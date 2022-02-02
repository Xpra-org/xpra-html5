/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2022 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */
'use strict';

/*
 * Worker for offscreen decoding and painting.
 * Requires Chrome 94+ or Android and a secure (SSL or localhost) context.
 */

importScripts("./lib/zlib.js");
importScripts("./lib/lz4.js");
importScripts("./lib/broadway/Decoder.js");
importScripts("./VideoDecoder.js");
importScripts("./ImageDecoder.js");
importScripts("./RgbHelpers.js");
importScripts("./Constants.js");

// Array of offscreen canvases and decoders we have control over
const offscreen_canvas = new Map();

const image_coding = ["rgb", "rgb32", "rgb24", "jpeg", "png", "png/P", "png/L", "webp"];
const video_coding = ["h264"];


class WindowDecoder {

    constructor(canvas, debug) {
        this.canvas = canvas;
        this.debug = debug;
        this.init();
    }
    init() {
        this.snapshot_buffer = null;
        this.snapshot_timer = 0;
        this.back_buffer = null;
        this.image_decoder = this.new_image_decoder();
        this.video_decoder = this.new_video_decoder();
        this.flush_seqs = [];    //this is the sequence numbers of the flush packets
        this.pending_paint = new Map();
        this.pending_decode = new Map();
        this.closed = false;
        this.animation_request = 0;
    }

    update_geometry(w, h) {
        if (this.closed) {
            return;
        }
        this.take_snapshot();
        if (this.canvas.width==w && this.canvas.height==h) {
            //unchanged
            return;
        }
        this.canvas.width = w;
        this.canvas.height = h;
        if (this.snapshot_buffer) {
            this.snapshot_buffer.width = w;
            this.snapshot_buffer.height = h;
        }
        if (this.back_buffer) {
            this.init_back_buffer();
        }
    }

    init_back_buffer() {
        const old_back_buffer = this.back_buffer;
        this.back_buffer = new OffscreenCanvas(this.canvas.width, this.canvas.height);
        const ctx = this.back_buffer.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        if (old_back_buffer && old_back_buffer.width>0 && old_back_buffer.height>0) {0
            ctx.drawImage(old_back_buffer, 0, 0);
        }
    }


    close() {
        if (!this.closed) {
            this.closed = true;
            if (this.video_decoder) {
                this.video_decoder._close();
            }
        }
        if (this.animation_request>0) {
            cancelAnimationFrame(this.animation_request);
            this.animation_request = 0;
        }
        if (this.snapshot_timer>0) {
            clearTimeout(this.snapshot_timer);
            this.snapshot_timer = 0;
        }
        this.back_buffer = null;
        this.snapshot_buffer = null;
    }

    new_image_decoder() {
        const image_decoder = new XpraImageDecoder();
        image_decoder.on_frame_decoded = (packet) => this.packet_decoded(packet);
        image_decoder.on_frame_error = (packet, error) => this.decode_error(packet, error);
        return image_decoder;
    }
    new_video_decoder() {
        const video_decoder = new XpraVideoDecoder();
        video_decoder.on_frame_decoded = (packet) => this.packet_decoded(packet);
        video_decoder.on_frame_error = (packet, error) => this.decode_error(packet, error);
        return video_decoder;
    }


    decode_draw_packet(packet) {
        const coding = packet[6];
        const packet_sequence = packet[8];
        const options = packet[10] || {};
        const flush = options["flush"] || 0;
        if (flush == 0) {
            //this is a 'flush' fence packet, record it:
            this.flush_seqs.push(packet_sequence);
        }
        //record this packet as pending:
        this.pending_decode.set(packet_sequence, performance.now());
        try {
            if (coding == "scroll" || coding == "void" ) {
                //nothing to do:
                this.packet_decoded(packet);
            }
            else if (image_coding.includes(coding)) {
                this.image_decoder.queue_frame(packet);
            }
            else if (video_coding.includes(coding)) {
                // Add to video queue
                if (!this.video_decoder.initialized) {
                    // Init with width and heigth of this packet.
                    // TODO: Use video max-size? It does not seem to matter.
                    this.video_decoder.init(packet[4], packet[5]);
                }
                this.video_decoder.queue_frame(packet);
            }
            else {
                this.decode_error(packet, "unsupported encoding: '"+coding+"'");
            }
        }
        catch (e) {
            this.decode_error(packet, ""+e);
        }
    }

    send_decode_error(packet, error) {
        packet[7] = null;
        self.postMessage({'error': ""+error, 'packet' : packet});
    }

    decode_error(packet, error) {
        this.close();
        //fail any packets pending and rely on the next refresh
        //which is going to be triggered by the decoding error(s)
        this.pending_paint.forEach((p) => {
            this.send_decode_error(p, "cancelled by decoding error");
        });
        this.init();
        const coding = packet[6];
        const packet_sequence = packet[8];
        const message = "failed to decode '"+coding+"' draw packet sequence "+packet_sequence+": "+error;
        console.error(message);
        packet[7] = null;
        this.send_decode_error(packet, message);
    }

    packet_decoded(packet) {
        try {
            const coding = packet[6];
            const packet_sequence = packet[8];
            const start = this.pending_decode.get(packet_sequence);
            if (!this.pending_decode.delete(packet_sequence)) {
                //already cancelled somehow
                return;
            }
            if (coding == "throttle") {
                // Encoding throttle is used to slow down frame input
                const timeout = 500;
                setTimeout(() => {
                    this.send_decode_ok(packet, start);
                }, timeout);
            }
            else {
                this.send_decode_ok(packet, start);
            }
            if (this.closed) {
                return;
            }

            if (this.flush_seqs.length==0) {
                //we haven't received the flush packet yet,
                //so this one is definitely older:
                this.paint_packet(packet);
                return;
            }
            //flush_seq is the current sequence no of the flush group we are dealing with:
            let flush_seq = this.flush_seqs[0];
            if (packet_sequence>flush_seq) {
                //this packet is for a later flush sequence,
                //queue it for later:
                this.pending_paint.set(packet_sequence, packet);
                return;
            }
            //the packet's sequence no is part of the current flush group,
            //so we can just paint it immediately:
            this.paint_packet(packet);
            //any snapshot is now out of date:
            this.snapshot_buffer = null;

            //are there any packets still waiting to be decoded
            //for the current sequence?
            if (Array.from(this.pending_decode.keys()).filter(x => x <= flush_seq).length>0) {
                //yes, found some pending decodes with a sequence number lower than the current flush
                return;
            }
            //there are no more pending decodes for the current flush sequence no
            //so it can be removed:
            this.flush_seqs.shift();
            //we're going to have a snapshot ready (when using the back buffer),
            //or we're going to schedule a take_snapshot()
            //so we can safely cancel the current timer:
            if (this.snapshot_timer>0) {
                clearTimeout(this.snapshot_timer);
            }
            //we can update the canvas front buffer
            //if we were using a back buffer to draw the screen updates:
            if (this.back_buffer) {
                this.back_to_front();
            }
            else {
                //schedule a capture of the front buffer contents:
                this.snapshot_timer = setTimeout(() => this.take_snapshot(), 100);
            }

            if (this.flush_seqs.length==0) {
                //anything pending is for a flush sequence that we have not received yet,
                //so we can paint them all now:
                this.paint_all(0);
                return;
            }
            while (this.flush_seqs.length>0) {
                //process the next flush sequence no:
                flush_seq = this.flush_seqs[0];
                //process any pending paints for the new current flush sequence no:
                this.paint_all(flush_seq);
                //if there are any pending decodes for this sequence no,
                //then we have to stop there and wait to be called again
                if (Array.from(this.pending_decode.keys()).filter(x => x <= flush_seq).length>0) {
                    break;
                }
                //otherwise, we have just painted this screen update fully:
                this.flush_seqs.shift();
                //and we can update the canvas front buffer:
                //if we were using a back buffer to draw the screen updates:
                if (this.back_buffer) {
                    this.back_to_front();
                }
            }
        }
        catch (e) {
            console.error("error handling decoded packet:", e);
            this.decode_error(packet, e);
        }
    }
    send_decode_ok(packet, start) {
        //copy the packet so we can zero out the data:
        const clone = Array.from(packet);
        const options = clone[10] || {};
        const decode_time = Math.round(1000*(performance.now()-start));
        options["decode_time"] = Math.max(0, decode_time);
        clone[6] = "offscreen-painted";
        clone[7] = null;
        clone[10] = options;
        self.postMessage({ 'draw': clone, 'start': start });
    }

    paint_all(max_seq) {
        //process pending paints up to max_seq,
        //in ascending order:
        const seqs = Array.from(this.pending_paint.keys()).sort((a, b) => a - b);
        for (let seq of seqs) {
            if (max_seq>0 && seq>max_seq) {
                break;
            }
            packet = this.pending_paint.get(seq);
            this.paint_packet(packet);
            this.pending_paint.delete(seq);
        }
    }

    paint_packet(packet) {
        if (this.closed) {
            this.decode_error(packet, "decoder is closed");
            return;
        }
        const x = packet[2],
            y = packet[3],
            width = packet[4],
            height = packet[5],
            coding_fmt = packet[6],
            data = packet[7];

        const canvas = this.back_buffer || this.canvas;
        let ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        const parts = coding_fmt.split(":");      //ie: "bitmap:rgb24" or "image:jpeg"
        const coding = parts[0];                  //ie: "bitmap"
        const paint_box = () => {
            if (!this.debug) {
                return;
            }
            const src_encoding = parts[1] || "";  //ie: "rgb24"
            const box_color = DEFAULT_BOX_COLORS[src_encoding];
            if (box_color) {                      //ie: "orange"
                this.paint_box(ctx, box_color, x, y, width, height);
            }
        }

        if (coding == "bitmap") {
            // RGB is transformed to bitmap
            ctx.clearRect(x, y, width, height);
            ctx.drawImage(data, x, y, width, height);
            paint_box();
        }
        else if (coding == "image" ) {
            // All others are transformed to VideoFrame
            ctx.clearRect(x, y, width, height);
            ctx.drawImage(data.image, x, y, width, height);
            data.image.close();
            paint_box();
        }
        else if (coding == "scroll") {
            this.init_back_buffer();
            ctx = this.back_buffer.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            for (let i = 0, j = data.length; i < j; ++i) {
                const scroll_data = data[i];
                const sx = scroll_data[0],
                    sy = scroll_data[1],
                    sw = scroll_data[2],
                    sh = scroll_data[3],
                    xdelta = scroll_data[4],
                    ydelta = scroll_data[5];
                ctx.drawImage(this.canvas, sx, sy, sw, sh, sx + xdelta, sy + ydelta, sw, sh);
                if (this.debug) {
                    this.paint_box(ctx, "brown", sx+xdelta, sy+ydelta, sw, sh);
                }
            }
        }
        else if (coding == "frame") {
            let enc_width = w;
            let enc_height = h;
            const options = packet[10] || {};
            const scaled_size = options["scaled_size"];
            if (scaled_size) {
                enc_width = scaled_size[0];
                enc_height = scaled_size[1];
            }
            ctx.drawImage(data, x, y, enc_width, enc_height);
            data.close();
            paint_box();
        }
        else if (coding == "throttle"){
            //we are skipping this frame
        }
        else if (coding == "void"){
            //nothing to do
        }
        else {
            this.decode_error(packet, "unsupported encoding: "+coding);
        }
        const options = packet[10] || {};
        const flush = options["flush"] || 0;
        if (flush == 0 && ctx.commit) {
            ctx.commit();
        }
    }

    paint_box(ctx, color, px, py, pw, ph) {
        if (color) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(px, py, pw, ph);
        }
    }

    back_to_front() {
        if (this.closed) {
            console.warn("cannot redraw, the decoder is closed");
            return;
        }
        if (this.animation_request>0) {
            console.warn("a redraw is already due - a frame may have been skipped");
            return;
        }
        if (this.back_buffer) {
            //show the back buffer at the next vsync:
            this.animation_request = requestAnimationFrame(() => {
                this.animation_request = 0;
                if (this.closed) {
                    return;
                }
                //to show this buffer, just move it to the snapshot canvas
                //and call redraw() to paint that:
                this.snapshot_buffer = this.back_buffer;
                this.back_buffer = null;
                this.redraw();
            });
        }
    }

    redraw() {
        if (!this.snapshot_buffer) {
            return;
        }
        const ctx = this.canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.snapshot_buffer, 0, 0);
        if (ctx.commit) {
            ctx.commit();
        }
    }

    take_snapshot() {
        this.snapshot_timer = 0;
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w>0 && h>0) {
            this.snapshot_buffer = new OffscreenCanvas(w, h);
            const ctx = this.snapshot_buffer.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.canvas, 0, 0);
        }
    }
}


onmessage = function (e) {
    const data = e.data;
    let wd = null;
    switch (data.cmd) {
        case 'check':
            // We do not check. We are here because we support native decoding.
            // TODO: Reconsider this. It might be a good thing to do some testing, just for sanity??
            const encodings = data.encodings;
            self.postMessage({ 'result': true, 'formats': encodings });
            break;
        case 'eos':
            wd = offscreen_canvas.get(data.wid);
            if (wd) {
                wd.close();
                offscreen_canvas.delete(data.wid);
            }
            break;
        case 'decode':
            const packet = data.packet;
            const wid = packet[1];
            wd = offscreen_canvas.get(wid);
            if (wd) {
                wd.decode_draw_packet(packet);
            }
            else {
                decode_error(packet, "no window decoder found for wid "+wid);
            }
            break
        case 'redraw':
            wd = offscreen_canvas.get(data.wid);
            if (wd) {
                wd.redraw();
            }
        case 'canvas':
            console.log("canvas transfer for window", data.wid, ": ", data.canvas, data.debug);
            if (data.canvas) {
                offscreen_canvas.set(data.wid, new WindowDecoder(data.canvas, data.debug));
            }
            break;
        case 'canvas-geo':
            wd = offscreen_canvas.get(data.wid);
            if (wd) {
                wd.update_geometry(data.w, data.h);
            }
            break;
        default:
            console.error("Offscreen decode worker got unknown message: " + data.cmd);
    }
}

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

// Array of offscreen canvases and decoders we have control over
const offscreen_canvas = new Map();

const image_coding = ["rgb", "rgb32", "rgb24", "jpeg", "png", "webp"];
const video_coding = ["h264"];


function decode_error(packet, error) {
    console.error("decode error:", error);
    packet[7] = null;
    self.postMessage({'error': ""+error, 'packet' : packet});
}

function decode_ok(packet, start) {
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


class WindowDecoder {

    constructor(canvas) {
        this.canvas = canvas;
        this.init();
    }
	init() {
        this.back_buffer = new OffscreenCanvas(this.canvas.width, this.canvas.height);
        this.image_decoder = this.new_image_decoder();
        this.video_decoder = this.new_video_decoder();
        this.flush = 0;         //this is the sequence number of the current flush
        this.pending_paint = new Map();
        this.pending_decode = new Map();
    }

    update_geometry(w, h) {
        if (this.canvas.width==w && this.canvas.height==h) {
            //unchanged
            return;
        }
        this.canvas.width = w;
        this.canvas.height = h;
        const old_back_buffer = this.back_buffer
        this.back_buffer = new OffscreenCanvas(w, h);
        const ctx = back_buffer.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(old_back_buffer, 0, 0);
    }

    close() {
        if (this.video_decoder) {
            this.video_decoder._close();
        }
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
        //record this packet as pending:
        this.pending_decode.set(packet_sequence, performance.now());
        try {
            if (coding == "scroll") {
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

    decode_error(packet, error) {
        this.close();
        this.init();
        decode_error(packet, error);
    }

    packet_decoded(packet) {
        try {
            const coding = packet[6];
            const packet_sequence = packet[8];
            let options = packet[10] || {};
            let flush = options["flush"] || 0;
            const start = this.pending_decode.get(packet_sequence);
            this.pending_decode.delete(packet_sequence);
            if (coding == "throttle") {
                // Encoding throttle is used to slow down frame input
                const timeout = 500;
                setTimeout(() => {
                    decode_ok(packet, start);
                }, timeout);
            }
            else {
                decode_ok(packet, start);
            }

            this.pending_paint.set(packet_sequence, packet);
            if (flush == 0 && this.flush==0) {
                 //this is a 'flush' packet, set the marker:
                 this.flush = packet_sequence;
            }
            while (this.flush>0) {
                //now that we know the sequence number for flush=0,
                //we can paint all the packets up to and including this sequence number:
                const pending_p = Array.from(this.pending_paint.keys()).filter(seq => seq<=this.flush);
                //paint in ascending order
                //(this is not strictly necessary with double buffering):
                const sorted_pp = pending_p.sort((a, b) => a - b);
                for (var seq of sorted_pp) {
                    const p = this.pending_paint.get(seq);
                    this.pending_paint.delete(seq);
                    this.paint_packet(p);
                }

                //The flush packet comes last, so we should have received
                //and started decoding all the other updates that are part of this flush sequence.
                //Find if any packets are still waiting to be decoded for this flush:
                const pending_d = Array.from(this.pending_decode.keys()).filter(seq => seq<=this.flush);
                if (pending_d.length>0) {
                    //we are still waiting for packets to be decoded
                    return;
                }

                //update the canvas front buffer:
                this.redraw();

                //now try to find the next 'flush=0' packet, if we have one:
                this.flush = 0;
                this.pending_paint.forEach((packet, seq) => {
                    let options = packet[10] || {};
                    flush = options["flush"] || 0;
                    //find the next lowest flush sequence:
                    //FIXME: should we just catch up with the highest flush sequence instead?
                    if (flush==0 && (this.flush==0 || seq<this.flush)) {
                        this.flush = seq;
                    }
                });
            }
        }
        catch (e) {
            console.error("error handling decoded packet:", e);
            this.decode_error(packet, e);
        }
    }

    paint_packet(packet) {
        const x = packet[2],
            y = packet[3],
            width = packet[4],
            height = packet[5],
            coding = packet[6],
            data = packet[7];
        const ctx = this.back_buffer.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        if (coding == "bitmap") {
            // RGB is transformed to bitmap
            ctx.clearRect(x, y, width, height);
            ctx.drawImage(data, x, y, width, height);
        }
        else if (coding == "image" ) {
            // All others are transformed to VideoFrame
            ctx.clearRect(x, y, width, height);
            ctx.drawImage(data.image, x, y, width, height);
            data.image.close();
        }
        else if (coding == "scroll") {
            for (let i = 0, j = data.length; i < j; ++i) {
                const scroll_data = data[i];
                const sx = scroll_data[0],
                    sy = scroll_data[1],
                    sw = scroll_data[2],
                    sh = scroll_data[3],
                    xdelta = scroll_data[4],
                    ydelta = scroll_data[5];
                ctx.drawImage(this.canvas, sx, sy, sw, sh, sx + xdelta, sy + ydelta, sw, sh);
            }
        }
        else if (coding == "frame") {
            let enc_width = w;
            let enc_height = h;
            let options = packet[10] || {};
            const scaled_size = options["scaled_size"];
            if (scaled_size) {
                enc_width = scaled_size[0];
                enc_height = scaled_size[1];
            }
            ctx.drawImage(data, x, y, enc_width, enc_height);
            data.close();
        }
        else if (coding == "throttle"){
            //we are skipping this frame
        }
        else {
            this.decode_error(packet, "unsupported encoding: "+coding);
        }
    }

    redraw() {
        const ctx = this.canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.back_buffer, 0, 0);
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
            wd = offscreen_canvas.get(wid);
            if (wd) {
                wd.redraw();
            }
        case 'canvas':
            offscreen_canvas.set(data.wid, new WindowDecoder(data.canvas));
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

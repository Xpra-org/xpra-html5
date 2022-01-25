/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2022 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

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
    const wid = packet[1];
    const oc = offscreen_canvas.get(wid);
    if (oc) {
        const pending_decode = oc["pending-decode"];
        if (pending_decode) {
            const packet_sequence = packet[8];
            pending_decode.delete(packet_sequence);
        }
    }
    self.postMessage({'error': ""+error, 'packet' : packet});
}

function decode_ok(packet, start) {
	//copy the packet so we can zero out the data:
	const clone = Array.from(packet);
    clone[6] = "offscreen-painted";
    clone[7] = null;
    let options = clone[10] || {};
    options["decode_time"] = Math.round(1000*performance.now() - 1000*start);
    clone[10] = options;
    self.postMessage({ 'draw': clone, 'start': start });
}


function paint_packet(packet) {
    const wid = packet[1],
        x = packet[2],
        y = packet[3],
        width = packet[4],
        height = packet[5],
        coding = packet[6],
        data = packet[7];

    const oc = offscreen_canvas.get(wid);
    let ctx = oc["ctx"];
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
        const canvas = oc["c"];
        for (let i = 0, j = data.length; i < j; ++i) {
            const scroll_data = data[i];
            const sx = scroll_data[0],
                sy = scroll_data[1],
                sw = scroll_data[2],
                sh = scroll_data[3],
                xdelta = scroll_data[4],
                ydelta = scroll_data[5];
            ctx.drawImage(canvas, sx, sy, sw, sh, sx + xdelta, sy + ydelta, sw, sh);
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
        decode_error(packet, "unsupported video encoding: "+coding);
    }
}


function new_image_decoder() {
    const image_decoder = new XpraImageDecoder();
    image_decoder.on_frame_decoded = packet_decoded;
    image_decoder.on_frame_error = decode_error;
    return image_decoder;
}

function new_video_decoder() {
    const video_decoder = new XpraVideoDecoder();
    video_decoder.on_frame_decoded = packet_decoded;
    video_decoder.on_frame_error = decode_error;
    return video_decoder;
}

function add_decoders_for_window(wid, canvas) {
    // Canvas
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    offscreen_canvas.set(wid, {
        "c"      : canvas,
        "ctx"    : ctx,
        "image-decoder" : new_image_decoder(),
        "video-decoder" : new_video_decoder(),
        "pending-paint" : new Map(),
        "pending-decode" : new Map(),
        });
}


function packet_decoded(packet) {
    //for now, paint immediately:
    try {
        const wid = packet[1];
        const coding = packet[6];
        const packet_sequence = packet[8];
        const oc = offscreen_canvas.get(wid);
	    const pending_decode = oc["pending-decode"];
		const start = pending_decode.get(packet_sequence);
        pending_decode.delete(packet_sequence);
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

        const pending_paint = oc["pending-paint"];
        let options = packet[10] || {};
        const flush = options["flush"] || 0;
        pending_paint.set(packet_sequence, packet);
        if (flush == 0) {
            //FIXME: we also need to wait for any pending decodes!
            //(but only for sequence numbers lower than this one)
            const sorted_pp = Array.from(pending_paint.keys()).sort((a, b) => a - b);
            for (var seq of sorted_pp) {
                const p = pending_paint.get(seq);
                pending_paint.delete(seq);
                paint_packet(p);
                if (seq>packet_sequence) {
                    //this packet is after the current flush!
                    //FIXME: continue processing if there is still another flush in there
                    break;
                }
            }
        }
    }
    catch (e) {
        console.error("error handling decoded packet:", e);
        decode_error(packet, e);
    }
}

function decode_draw_packet(packet) {
    const wid = packet[1];
    const coding = packet[6];
    const packet_sequence = packet[8];
    const oc = offscreen_canvas.get(wid);
    send_error = (message) => {
        decode_error(packet, message);
    }
    if (!oc) {
        send_error("no offscreen context for window "+wid);
        return;
    }

    //record this packet as pending:
    const pending_decode = oc["pending-decode"];
    pending_decode.set(packet_sequence, performance.now());
    try {
        if (coding == "scroll") {
            //nothing to do:
            this.packet_decoded(packet);
        }
        else if (image_coding.includes(coding)) {
            let decoder = oc["image-decoder"];
            decoder.queue_frame(packet);
        }
        else if (video_coding.includes(coding)) {
            // Add to video queue
            let decoder = oc["video-decoder"];
            if (!decoder.initialized) {
                // Init with width and heigth of this packet.
                // TODO: Use video max-size? It does not seem to matter.
                decoder.init(packet[4], packet[5]);
            }
            decoder.queue_frame(packet);
        }
        else {
            send_error("unsupported encoding: '"+coding+"'");
        }
    }
    catch (e) {
        send_error(e);
    }
}

function close(wid) {
    close_video(wid);
    offscreen_canvas.delete(wid);
}
function close_video(wid) {
    const oc = offscreen_canvas.get(wid);
    if (oc) {
        const video_decoder = oc["video-decoder"];
        if (video_decoder) {
            video_decoder._close();
        }
    }
}


onmessage = function (e) {
    const data = e.data;
    switch (data.cmd) {
        case 'check':
            // We do not check. We are here because we support native decoding.
            // TODO: Reconsider this. It might be a good thing to do some testing, just for sanity??
            const encodings = data.encodings;
            self.postMessage({ 'result': true, 'formats': encodings });
            break;
        case 'eos':
            close_video(data.wid);
            break;
        case 'decode':
            decode_draw_packet(data.packet);
            break
        case 'canvas':
            add_decoders_for_window(data.wid, data.canvas)
            break;
        case 'canvas-geo':
            const oc =  offscreen_canvas.get(data.wid);
            if (oc) {
                const canvas = oc["c"];
                if (canvas.width != data.w || canvas.height != data.h) {
                    canvas.width = data.w;
                    canvas.height = data.h;
                }
            }
            break;
        default:
            console.error("Offscreen decode worker got unknown message: " + data.cmd);
    }
}
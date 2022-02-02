/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

/*
 * Receives native image packets and decode them via ImageDecoder.
 * https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder
 * ImageDecoder is only working in Chrome 94+ and Android
 *
 */

const XpraImageDecoderLoader = {
    hasNativeDecoder: function () {
        return typeof ImageDecoder !== "undefined";
    }
}

function XpraImageDecoder() {
    this.on_frame_decoded = null;
    this.on_frame_error = (packet, error) => {
	    console.error("ImageDecoder error on packet ", packet, ": ", error);
    }
}

XpraImageDecoder.prototype.queue_frame = function (packet) {
    const width = packet[4];
    const height = packet[5];
    const coding = packet[6];
    if (coding.startsWith("rgb")) {
        // TODO: Figure out how to decode rgb with ImageDecoder API;
        const data = decode_rgb(packet);
        createImageBitmap(new ImageData(new Uint8ClampedArray(data.buffer), width, height), 0, 0, width, height).then((bitmap) => {
            packet[6] = "bitmap:"+coding;
            packet[7] = bitmap;
            this.on_frame_decoded(packet);
        }).catch(e => this.on_frame_error(packet, e));
    } else {
        const paint_coding = coding.split("/")[0];   //ie: "png/P" -> "png"
        const decoder = new ImageDecoder({
            type: "image/" + paint_coding,
            data: packet[7],
        });
        decoder.decode({ frameIndex: 0 }).then((result) => {
            packet[6] = "image:"+paint_coding;
            packet[7] = result;
            decoder.close();
            this.on_frame_decoded(packet);
        }).catch(e => this.on_frame_error(packet, e));
    }
};

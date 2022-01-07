/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

/*
 * Receives native image packages and decode them via ImageDecoder.
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
}

XpraImageDecoder.prototype.queue_frame = function (packet, start) {
    const width = packet[4];
    const height = packet[5];
    const coding = packet[6];
    if (coding.startsWith("rgb")) {
        // TODO: Figure out how to decode rgb with ImageDecoder API;
        const data = decode_rgb(packet);
        createImageBitmap(new ImageData(new Uint8ClampedArray(data.buffer), width, height), 0, 0, width, height).then((bitmap) => {
            packet[6] = "bitmap";
            packet[7] = bitmap;
            this.on_frame_decoded(packet, start);
        });
    } else {
        const decoder = new ImageDecoder({
            type: "image/" + coding,
            data: packet[7]
        });
        decoder.decode({ frameIndex: 0 }).then((result) => {
            packet[6] = "frame";
            packet[7] = result;
            decoder.close();
            this.on_frame_decoded(packet, start);
        });
    }
};

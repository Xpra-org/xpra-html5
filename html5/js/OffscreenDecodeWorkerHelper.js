/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2022 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

/*
 * Helper for offscreen decoding and painting.
 * Requires Chrome 94+ or Android and a secure (SSL or localhost) context.
 */

const XpraOffscreenWorker = {
    isAvailable: function () {
        if (XpraImageDecoderLoader.hasNativeDecoder() && XpraVideoDecoderLoader.hasNativeDecoder && typeof OffscreenCanvas !== "undefined") {
            //we also need the direct constructor:
            try {
                new OffscreenCanvas(256, 256);
                return true;
            }
            catch (e) {
                console.warn("unable to instantiate an offscreen canvas:", e);
            }
        }
        console.warn("Offscreen decoding is not available. Please consider using Google Chrome 94+ in a secure (SSL or localhost) context for better performance.");
        return false;
    }
}
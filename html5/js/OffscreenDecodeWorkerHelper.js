/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
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
            return true;
        } else {
            console.warn("Offscreen decoding is not available. Please consider using Google Chrome 94+ in a secure (SSL or localhost) context for better performance.");
            return false;
        }
    }
}
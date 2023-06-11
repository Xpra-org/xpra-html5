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
 */

const XpraOffscreenWorker = {
  isAvailable() {
	const isSafari = navigator.userAgent.toLowerCase().includes("safari");
	if (isSafari) {
		return false;
	}
    // We do not support firefox as it makes canvases flicker
    const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");
    if (typeof OffscreenCanvas !== "undefined" && !isFirefox) {
      //we also need the direct constructor:
      try {
        new OffscreenCanvas(256, 256);
        return true;
      } catch (error) {
        console.warn("unable to instantiate an offscreen canvas:", error);
      }
    }
    console.warn(
      "Offscreen decoding is not available. Please consider using Google Chrome for better performance."
    );
    return false;
  },
};

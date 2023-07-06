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
  // OffscreenCanvas supported since v.16.4
  isSafariVersionSupported() {
    var match = navigator.userAgent.match(/version\/(\d+\.\d+)/i);
    if (match && match[1]) {
      var version = parseFloat(match[1]);
      // Safari is buggy, see #227
      return version >= 999.9;
    }
    return false;
  },

  // OffscreenCanvas supported since v.105 (with fixed added for 107/108)
  isFirefoxVersionSupported() {
    var match = navigator.userAgent.match(/firefox\/(\d+)/i);
    if (match && match[1]) {
      var version = parseInt(match[1], 10);
      return version >= 108;
    }
    return false;
  },

  isAvailable() {
    var isSafari = navigator.userAgent.toLowerCase().includes("safari");
    if (isSafari && !this.isSafariVersionSupported()) {
      return false;
    }

    var isFirefox = navigator.userAgent.toLowerCase().includes("firefox");
    if (isFirefox && this.isFirefoxVersionSupported()) {
      return false;
    }

    if (typeof OffscreenCanvas !== "undefined") {
      //we also need the direct constructor:
      try {
        new OffscreenCanvas(256, 256);
        return true;
      } catch (error) {
        console.warn("unable to instantiate an offscreen canvas:", error);
      }
    }
    console.warn(
      "Offscreen decoding is not available. Please consider using " +
        "Google Chrome, Firefox >= 108 or Safari >= 16.4 for better performance."
    );
    return false;
  },
};

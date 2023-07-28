/*
 * This file is part of Xpra.
 * Copyright (C) 2016-2021 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2016 Spikes, Inc.
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

if (!Object.hasOwn) {
    Object.hasOwn = Object.call.bind(Object.hasOwnProperty);
}

const Utilities = {
  VERSION: "9.0",
  REVISION: 1285,
  LOCAL_MODIFICATIONS: 3,
  BRANCH: "master",

  exc: console_error_safe,
  error: console_error_safe,
  warn: console_warn_safe,
  log: console_log_safe,
  debug: console_debug_safe,

  //these versions should not be redirected:
  cexc: console_error_safe,
  cerror: console_error_safe,
  cwarn: console_warn_safe,
  clog: console_log_safe,
  cdebug: console_debug_safe,

  stristrue(v, default_value) {
    if (v === null) {
      return default_value;
    }
    return ["true", "on", "1", "yes", "enabled"].includes(
      String(v).toLowerCase()
    );
  },

  getHexUUID() {
    const s = [];
    const hexDigits = "0123456789abcdef";
    for (let index = 0; index < 36; index++) {
      if (index == 8 || index == 13 || index == 18 || index == 23) {
        s[index] = "-";
      } else {
        s[index] = hexDigits.slice(
          Math.floor(Math.random() * 0x10),
          Math.floor(Math.random() * 0x10) + 1
        );
      }
    }
    return s.join("");
  },

  ord(c) {
    return c.charCodeAt(0);
  },

  getSecureRandomString(length_) {
    const crypto = window.crypto || window.mscrypto;
    if (!crypto) {
      let s = "";
      while (s.length < length_) {
        s += Utilities.getHexUUID();
      }
      return s.slice(0, Math.max(0, length_));
    }
    const u = new Uint8Array(length_);
    crypto.getRandomValues(u);
    return String.fromCharCode.apply(null, u);
  },

  xorString(string1, string2) {
    let result = "";
    if (string1.length !== string2.length) {
      throw "strings must be equal length";
    }
    for (const index in string1) {
      const character1 = string1[index];
      const character2 = string2[index];
      result += String.fromCharCode(
        character1.charCodeAt(0) ^ character2.charCodeAt(0)
      );
    }
    return result;
  },

  trimString(string_, trimLength) {
    if (!string_) {
      return "";
    }
    return string_.length > trimLength
      ? `${string_.slice(0, Math.max(0, trimLength - 3))}...`
      : string_;
  },

  convertToHex(string_) {
    let hex = "";
    for (let index = 0; index < string_.length; index++) {
      hex += `${string_.charCodeAt(index).toString(16).padStart(2, "0")}`;
    }
    return hex;
  },

  getPlatformProcessor() {
    //mozilla property:
    if (navigator.oscpu) {
      return navigator.oscpu;
    }
    //ie:
    if (Object.hasOwn((navigator, "cpuClass"))) {
      return navigator.cpuClass;
    }
    return "unknown";
  },

  getPlatformName() {
    if (navigator.appVersion.includes("Win")) {
      return "Microsoft Windows";
    }
    if (navigator.appVersion.includes("Mac")) {
      return "Mac OSX";
    }
    if (navigator.appVersion.includes("Linux")) {
      return "Linux";
    }
    if (navigator.appVersion.includes("X11")) {
      return "Posix";
    }
    return "unknown";
  },

  getPlatform() {
    //use python style strings for platforms:
    if (navigator.appVersion.includes("Win")) {
      return "win32";
    }
    if (navigator.appVersion.includes("Mac")) {
      return "darwin";
    }
    if (navigator.appVersion.includes("Linux")) {
      return "linux";
    }
    if (navigator.appVersion.includes("X11")) {
      return "posix";
    }
    return "unknown";
  },

  getFirstBrowserLanguage() {
    const nav = window.navigator;
    const browserLanguagePropertyKeys = [
      "language",
      "browserLanguage",
      "systemLanguage",
      "userLanguage",
    ];
    let language;
    // support for HTML 5.1 "navigator.languages"
    if (Array.isArray(nav.languages)) {
      for (let language of nav.languages) {
        if (language && language.length > 0) {
          return language;
        }
      }
    }
    // support for other well known properties in browsers
    for (const property of browserLanguagePropertyKeys) {
      language = nav[property];
      if (language && language.length > 0) {
        return language;
      }
    }
    return null;
  },

  getKeyboardLayout() {
    let v = Utilities.getFirstBrowserLanguage();
    if (v == undefined) {
      return "us";
    }
    let layout = LANGUAGE_TO_LAYOUT[v];
    if (!layout) {
      //ie: v="en_GB";
      v = v.split(",")[0];
      let l = v.split("-", 2);
      if (l.length === 1) {
        l = v.split("_", 2);
      }
      //ie: "en"
      layout = l[0].toLowerCase();
      const temporary = LANGUAGE_TO_LAYOUT[layout];
      if (temporary) {
        layout = temporary;
      }
    }
    return layout;
  },

  isMacOS() {
    return navigator.platform.includes("Mac");
  },

  isWindows() {
    return navigator.platform.includes("Win");
  },

  isLinux() {
    return navigator.platform.includes("Linux");
  },

  isFirefox() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("firefox");
  },
  isOpera() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("opera");
  },
  isSafari() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("safari") && !ua.includes("chrome");
  },
  isEdge() {
    return navigator.userAgent.includes("Edge");
  },
  isChrome() {
    const isChromium = Object.hasOwn(window, "chrome");
    const winNav = window.navigator;
    const vendorName = winNav.vendor;
    const isOpera = winNav.userAgent.includes("OPR");
    const isIEedge = winNav.userAgent.includes("Edge");
    const isIOSChrome = winNav.userAgent.match("CriOS");
    if (isIOSChrome) {
      return true;
    } else if (
      isChromium !== null &&
      isChromium !== undefined &&
      vendorName === "Google Inc." &&
      isOpera === false &&
      isIEedge === false
    ) {
      return true;
    } else {
      return false;
    }
  },
  isIE() {
    return (
      navigator.userAgent.includes("MSIE") ||
      navigator.userAgent.includes("Trident/")
    );
  },

  is_64bit() {
    const _to_check = [];
    if (Object.hasOwn((window.navigator, "cpuClass")))
      _to_check.push(`${window.navigator.cpuClass}`.toLowerCase());
    if (window.navigator.platform)
      _to_check.push(`${window.navigator.platform}`.toLowerCase());
    if (navigator.userAgent)
      _to_check.push(`${navigator.userAgent}`.toLowerCase());
    const _64bits_signatures = [
      "x86_64",
      "x86-64",
      "Win64",
      "x64;",
      "amd64",
      "AMD64",
      "WOW64",
      "x64_64",
      "ia64",
      "sparc64",
      "ppc64",
      "IRIX64",
    ];
    for (const a of _to_check) {
      for (const b of _64bits_signatures) {
        if (a.includes(b.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  },

  isMobile() {
    return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
  },

  getSimpleUserAgentString() {
    if (Utilities.isFirefox()) {
      return "Firefox";
    } else if (Utilities.isOpera()) {
      return "Opera";
    } else if (Utilities.isSafari()) {
      return "Safari";
    } else if (Utilities.isChrome()) {
      return "Chrome";
    } else if (Utilities.isIE()) {
      return "MSIE";
    } else {
      return "";
    }
  },

  getColorGamut() {
    if (!window.matchMedia) {
      //unknown
      return "";
    } else if (window.matchMedia("(color-gamut: rec2020)").matches) {
      return "rec2020";
    } else if (window.matchMedia("(color-gamut: p3)").matches) {
      return "P3";
    } else if (window.matchMedia("(color-gamut: srgb)").matches) {
      return "srgb";
    } else {
      return "";
    }
  },

  isEventSupported(event) {
    let testElement = document.createElement("div");
    let isSupported;

    event = `on${event}`;
    isSupported = event in testElement;

    if (!isSupported) {
      testElement.setAttribute(event, "return;");
      isSupported = typeof testElement[event] === "function";
    }
    testElement = null;
    return isSupported;
  },

  //https://github.com/facebook/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js
  //BSD license
  normalizeWheel(/*object*/ event) /*object*/ {
    // Reasonable defaults
    const PIXEL_STEP = 10;
    const LINE_HEIGHT = 40;
    const PAGE_HEIGHT = 800;

    let sX = 0;
    let sY = 0; // spinX, spinY

    // Legacy
    if ("detail" in event) {
      sY = event.detail;
    }
    if ("wheelDelta" in event) {
      sY = -event.wheelDelta / 120;
    }
    if ("wheelDeltaY" in event) {
      sY = -event.wheelDeltaY / 120;
    }
    if ("wheelDeltaX" in event) {
      sX = -event.wheelDeltaX / 120;
    }

    // side scrolling on FF with DOMMouseScroll
    if ("axis" in event && event.axis === event.HORIZONTAL_AXIS) {
      sX = sY;
      sY = 0;
    }

    let pX = sX * PIXEL_STEP; // pixelX
    let pY = sY * PIXEL_STEP; // pixelY

    if ("deltaY" in event) {
      pY = event.deltaY;
    }
    if ("deltaX" in event) {
      pX = event.deltaX;
    }

    if ((pX || pY) && event.deltaMode) {
      if (event.deltaMode == 1) {
        // delta in LINE units
        pX *= LINE_HEIGHT;
        pY *= LINE_HEIGHT;
      } else {
        // delta in PAGE units
        pX *= PAGE_HEIGHT;
        pY *= PAGE_HEIGHT;
      }
    }

    // Fall-back if spin cannot be determined
    if (pX && !sX) {
      sX = pX < 1 ? -1 : 1;
    }
    if (pY && !sY) {
      sY = pY < 1 ? -1 : 1;
    }

    return {
      spinX: sX,
      spinY: sY,
      pixelX: pX,
      pixelY: pY,
      deltaMode: event.deltaMode || 0,
    };
  },

  saveFile(filename, data, mimetype) {
    const a = document.createElement("a");
    a.setAttribute("style", "display: none");
    document.body.append(a);
    const blob = new Blob([data], mimetype);
    const url = window.URL.createObjectURL(blob);
    if (navigator.msSaveOrOpenBlob) {
      navigator.msSaveOrOpenBlob(blob, filename);
    } else {
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  },

  StringToUint8(value) {
    return new TextEncoder().encode(value);
  },

  Uint8ToString(value) {
    return new TextDecoder().decode(value);
  },

  s(v) {
	if (v===undefined) {
		return "";
	}
    const type = typeof v;
    if (type === "object" && v.constructor === Uint8Array) {
      return Utilities.Uint8ToString(v);
    }
    return v.toString();
  },

  u : function(v){
	if (v===undefined) {
		return new Uint8Array(0);
	}
    const type = typeof v;
      if (type === 'object' && v.constructor===Uint8Array) {
        return v;
      }
     return StringToUint8(v.toString());
  },

  ArrayBufferToBase64(uintArray) {
    // apply in chunks of 10400 to avoid call stack overflow
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
    let s = "";
    const skip = 10_400;
    if (uintArray.subarray) {
      for (
        let index = 0, length_ = uintArray.length;
        index < length_;
        index += skip
      ) {
        s += String.fromCharCode.apply(
          null,
          uintArray.subarray(index, Math.min(index + skip, length_))
        );
      }
    } else {
      for (
        let index = 0, length_ = uintArray.length;
        index < length_;
        index += skip
      ) {
        s += String.fromCharCode.apply(
          null,
          uintArray.slice(index, Math.min(index + skip, length_))
        );
      }
    }
    return window.btoa(s);
  },

  ToBase64(v) {
    try {
      return window.btoa(v);
    } catch {
      return ArrayBufferToBase64(v);
    }
  },

  convertDataURIToBinary(dataURI) {
    const BASE64_MARKER = ";base64,";
    const base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    const base64 = dataURI.slice(Math.max(0, base64Index));
    const raw = window.atob(base64);
    const rawLength = raw.length;
    const array = new Uint8Array(new ArrayBuffer(rawLength));

    for (let index = 0; index < rawLength; index++) {
      array[index] = raw.charCodeAt(index);
    }
    return array;
  },

  parseINIString(data) {
    const regex = {
      section: /^\s*\[\s*([^\]]*)\s*]\s*$/,
      param: /^\s*([^=]+?)\s*=\s*(.*?)\s*$/,
      comment: /^\s*[#;].*$/,
    };
    const value = {};
    const lines = data.split(/[\n\r]+/);
    let section = null;
    for (const line of lines) {
      if (regex.comment.test(line)) {
        continue;
      } else if (regex.param.test(line)) {
        const match = line.match(regex.param);
        if (section) {
          value[section][match[1]] = match[2];
        } else {
          value[match[1]] = match[2];
        }
      } else if (regex.section.test(line)) {
        const match = line.match(regex.section);
        value[match[1]] = {};
        section = match[1];
      } else if (line.length === 0 && section) {
        section = null;
      }
    }
    return value;
  },

  /**
   * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
   * headers according to the format described here:
   * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
   * This method parses that string into a user-friendly key/value pair object.
   */
  ParseResponseHeaders(headerString) {
    const headers = {};
    if (!headerString) {
      return headers;
    }
    const headerPairs = headerString.split("\u000D\u000A");
    for (const headerPair of headerPairs) {
      // Can't use split() here because it does the wrong thing
      // if the header value has the string ": " in it.
      const index = headerPair.indexOf("\u003A\u0020");
      if (index > 0) {
        const key = headerPair.slice(0, Math.max(0, index));
        const value = headerPair.slice(Math.max(0, index + 2));
        headers[key] = value;
      }
    }
    return headers;
  },

  parseParams(q) {
    const parameters = {};
    let e;
    const a = /\+/g; // Regex for replacing addition symbol with a space
    const r = /([^&=]+)=?([^&]*)/g;
    const d = (s) => {
      return decodeURIComponent(s.replace(a, " "));
    };
    while ((e = r.exec(q))) parameters[d(e[1])] = d(e[2]);
    return parameters;
  },

  getparam(property) {
    let getParameter = window.location.getParameter;
    if (!getParameter) {
      getParameter = function (key) {
        if (!window.location.queryStringParams)
          window.location.queryStringParams = Utilities.parseParams(
            window.location.search.slice(1)
          );
        return window.location.queryStringParams[key];
      };
    }
    let value = getParameter(property);
    try {
      if (value === undefined && typeof sessionStorage !== "undefined") {
        value = sessionStorage.getItem(property);
      }
    } catch {
      value = null;
    }
    return value;
  },

  getboolparam(property, default_value) {
    const v = Utilities.getparam(property);
    if (v === null) {
      return default_value;
    }
    return ["true", "on", "1", "yes", "enabled"].includes(
      String(v).toLowerCase()
    );
  },

  hasSessionStorage() {
    if (typeof Storage === "undefined") {
      return false;
    }
    try {
      const key = "just for testing sessionStorage support";
      sessionStorage.setItem(key, "store-whatever");
      sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  getConnectionInfo() {
    if (!Object.hasOwn(navigator, "connection")) {
      return {};
    }
    const c = navigator.connection;
    const index = {};
    if (c.type) {
      index["type"] = c.type;
    }
    if (Object.hasOwn((c, "effectiveType"))) {
      index["effective-type"] = c.effectiveType;
    }
    if (!isNaN(c.downlink) && c.downlink > 0 && isFinite(c.downlink)) {
      index["downlink"] = Math.round(c.downlink * 1000 * 1000);
    }
    if (
      Object.hasOwn(c, "downlinkMax") &&
      !isNaN(c.downlinkMax) &&
      !isNaN(c.downlinkMax) &&
      c.downlinkMax > 0 &&
      isFinite(c.downlinkMax)
    ) {
      index["downlink.max"] = Math.round(c.downlinkMax * 1000 * 1000);
    }
    if (!isNaN(c.rtt) && c.rtt > 0) {
      index["rtt"] = c.rtt;
    }
    return index;
  },

  json_action(uri, success_function, error_function, username, password) {
    Utilities.log(
      "json_action(",
      uri,
      ", ",
      success_function,
      ", ",
      error_function,
      ")"
    );
    const xhr = new XMLHttpRequest();
    let url = uri;
    if (uri.startsWith("/")) {
      //relative URI
      url = document.location.href.split("/connect.html")[0] + uri;
    }
    xhr.open("GET", url, true);
    if (username && password) {
      const credentials = btoa(`${username}:${password}`);
      xhr.setRequestHeader("Authorization", `Basic ${credentials}`);
    }
    xhr.responseType = "json";
    xhr.addEventListener("load", function () {
      Utilities.log("loaded", url, "status", xhr.status);
      const status = xhr.status;
      if (status === 200) {
        success_function(xhr, xhr.response);
      } else {
        Utilities.log(uri, "failed:", status + xhr.response);
        if (error_function) {
          error_function(`failed: ${status}${xhr.response}`);
        }
      }
    });
    xhr.addEventListener("error", function (e) {
      Utilities.log(uri, "error:", e);
      if (error_function) {
        error_function(e);
      }
    });
    xhr.addEventListener("abort", function (e) {
      Utilities.log(uri, "abort:", e);
      if (error_function) {
        error_function(e);
      }
    });
    xhr.send();
    return xhr;
  },
};

//convert a language code into an X11 keyboard layout code:
const LANGUAGE_TO_LAYOUT = {
  en_GB: "gb",
  en: "us",
  zh: "cn",
  af: "za",
  sq: "al",
  ca: "ca",
  "zh-TW": "tw",
  "zh-CN": "cn",
  cs: "cz",
  da: "dk",
  "nl-BE": "be",
  "en-US": "us",
  "en-AU": "us",
  "en-GB": "gb",
  "en-CA": "ca",
  "en-NZ": "us",
  "en-IE": "ie",
  "en-ZA": "za",
  "en-JM": "us",
  "en-TT": "tr",
  et: "ee",
  fa: "ir",
  "fr-BE": "be",
  "fr-CA": "ca",
  "fr-CH": "ch",
  "fr-LU": "fr",
  "gd-IE": "ie",
  "de-CH": "ch",
  "de-AT": "at",
  "de-LU": "de",
  "de-LI": "de",
  he: "il",
  hi: "in",
  "it-CH": "ch",
  ja: "jp",
  ko: "kr",
  "pt-BR": "br",
  pt: "pt",
  sr: "rs",
  sl: "si",
  es: "es",
  sv: "se",
  "sv-FI": "fi",
  tr: "tr",
  uk: "ua",
  ur: "pk",
  vi: "vn",
  //Unknown conversions
  //"en-BZ": ??
  //"en-EG": ??
  //"gd": ??
  //"id": ??
  //"ji": ??
  //"rm": ??
  //"ro-MO": ??
  //"ru-MI": ??
  //"sb": ??
  //"sx": ??
  //"sz": ??
  //"ts": ??
  //"tn": ??
  //"ve": ??
  //"xh": ??
  //"zh-HK": ??
  //"zh-SG": ??
  //"zu": ??
};

function console_debug_safe() {
  if (console) console.debug.apply(console, arguments);
}

function console_error_safe() {
  if (console) console.error.apply(console, arguments);
}

function console_warn_safe() {
  if (console) console.warn.apply(console, arguments);
}

function console_log_safe() {
  if (console) console.log.apply(console, arguments);
}

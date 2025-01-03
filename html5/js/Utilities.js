/*
 * This file is part of Xpra.
 * Copyright (C) 2016-2021 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2016 Spikes, Inc.
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

'use strict';

const Utilities = {
	VERSION : "5.6",
	REVISION : 0,
	LOCAL_MODIFICATIONS : 0,
	BRANCH : "v5.x",

	exc : function() {
		if (console) {
			console.error.apply(console, arguments);
		}
	},
	error : function() {
		if (console) {
			console.error.apply(console, arguments);
		}
	},
	warn : function() {
		if (console) {
			console.log.apply(console, arguments);
		}
	},
	log : function() {
		if (console) {
			console.log.apply(console, arguments);
		}
	},
	debug : function() {
		if (console) {
			console.debug.apply(console, arguments);
		}
	},

	//these versions should not be redirected:
	cexc : function() {
		if (console) {
			console.error.apply(console, arguments);
		}
	},
	cerror : function() {
		if (console) {
			console.error.apply(console, arguments);
		}
	},
	cwarn : function() {
		if (console) {
			console.log.apply(console, arguments);
		}
	},
	clog : function() {
		if (console) {
			console.log.apply(console, arguments);
		}
	},
	cdebug : function() {
		if (console) {
			console.debug.apply(console, arguments);
		}
	},

	stristrue : function(v, default_value) {
		if (v===null) {
			return default_value;
		}
		return ["true", "on", "1", "yes", "enabled"].indexOf(String(v).toLowerCase())!==-1;
	},


	removeChars: function(validChars, inputString) {
		var regex = new RegExp('[^' + validChars + ']', 'g');
		return inputString.replace(regex, '');
	},

	getHexUUID: function() {
		const s = [];
		const hexDigits = "0123456789abcdef";
		for (let i = 0; i < 36; i++) {
			if (i==8 || i==13 || i==18 || i==23) {
				s[i] = "-";
			}
			else {
				s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
			}
		}
		return s.join("");
	},

	getSecureRandomString: function(len) {
		const crypto = window.crypto || window.mscrypto;
		if (!crypto) {
			let s = "";
			while (s.length<len) {
				s += Utilities.getHexUUID();
			}
			return s.substr(0, len);
		}
		const u = new Uint8Array(len);
		crypto.getRandomValues(u);
		return String.fromCharCode.apply(null, u);
	},

	xorString: function(str1, str2){
		let result = '';
		if(str1.length !== str2.length) {
			throw 'strings must be equal length';
		}
		for(let i = 0; i < str1.length; i++) {
			result += String.fromCharCode(str1[i].charCodeAt(0) ^ str2[i].charCodeAt(0));
		}
		return result;
	},

	trimString: function(str, trimLength){
		if (!str) {
			return "";
		}
		return str.length>trimLength ?
			str.substring(0, trimLength-3)+"..." :
			str;
	},

	getPlatformProcessor: function() {
		//mozilla property:
		if (navigator.oscpu){
			return navigator.oscpu;
		}
		//ie:
		if (navigator.hasOwnProperty("cpuClass")) {
			return navigator.cpuClass;
		}
		return 'unknown';
	},

	getPlatformName: function() {
		if (navigator.appVersion.includes('Win')){
			return 'Microsoft Windows';
		}
		if (navigator.appVersion.includes('Mac')){
			return 'Mac OSX';
		}
		if (navigator.appVersion.includes('Linux')){
			return 'Linux';
		}
		if (navigator.appVersion.includes('X11')){
			return 'Posix';
		}
		return 'unknown';
	},

	getPlatform: function() {
		//use python style strings for platforms:
		if (navigator.appVersion.includes('Win')){
			return 'win32';
		}
		if (navigator.appVersion.includes('Mac')){
			return 'darwin';
		}
		if (navigator.appVersion.includes('Linux')){
			return 'linux';
		}
		if (navigator.appVersion.includes('X11')){
			return 'posix';
		}
		return 'unknown';
	},

	getFirstBrowserLanguage : function () {
		const nav = window.navigator,
			browserLanguagePropertyKeys = ['language', 'browserLanguage', 'systemLanguage', 'userLanguage'];
		let language;
		// support for HTML 5.1 "navigator.languages"
		if (Array.isArray(nav.languages)) {
			for (let i = 0; i < nav.languages.length; i++) {
				language = nav.languages[i];
				if (language && language.length) {
					return language;
				}
			}
		}
		// support for other well known properties in browsers
		for (let i = 0; i < browserLanguagePropertyKeys.length; i++) {
			const prop = browserLanguagePropertyKeys[i];
			language = nav[prop];
			//Utilities.debug(prop, "=", language);
			if (language && language.length) {
				return language;
			}
		}
		return null;
	},

	getKeyboardLayout: function() {
		let v = Utilities.getFirstBrowserLanguage();
		Utilities.debug("getFirstBrowserLanguage()=", v);
		if (v==null) {
			return "us";
		}
		let layout = LANGUAGE_TO_LAYOUT[v];
		if (!layout) {
			//ie: v="en_GB";
			v = v.split(',')[0];
			let l = v.split('-', 2);
			if (l.length === 1){
				l = v.split('_', 2);
			}
			//ie: "en"
			layout = l[0].toLowerCase();
			const tmp = LANGUAGE_TO_LAYOUT[layout];
			if (tmp) {
				layout = tmp;
			}
		}
		Utilities.debug("getKeyboardLayout()=", layout);
		return layout;
	},

	getAudioContextClass : function() {
		return window.AudioContext || window.webkitAudioContext || window.audioContext;
	},

	getAudioContext : function() {
		if (Utilities.audio_context) {
			return Utilities.audio_context;
		}
		const acc = Utilities.getAudioContextClass();
		if(!acc) {
			return null;
		}
		Utilities.audio_context = new acc();
		return Utilities.audio_context;
	},

	isMacOS : function() {
		return navigator.platform.includes('Mac');
	},

	isWindows : function() {
		return navigator.platform.includes('Win');
	},

	isLinux : function() {
		return navigator.platform.includes('Linux');
	},


	isFirefox : function() {
		const ua = navigator.userAgent.toLowerCase();
		return ua.includes("firefox");
	},
	isOpera : function() {
		const ua = navigator.userAgent.toLowerCase();
		return ua.includes("opera");
	},
	isSafari : function() {
		const ua = navigator.userAgent.toLowerCase();
		return ua.includes("safari") && !ua.includes('chrome');
	},
	isEdge : function() {
		return navigator.userAgent.includes("Edge");
	},
	isChrome : function () {
		const isChromium = window.hasOwnProperty("chrome"),
			winNav = window.navigator,
			vendorName = winNav.vendor,
			isOpera = winNav.userAgent.includes("OPR"),
			isIEedge = winNav.userAgent.includes("Edge"),
			isIOSChrome = winNav.userAgent.match("CriOS");
		  if (isIOSChrome) {
			  return true;
		  }
		  else if (isChromium !== null && isChromium !== undefined && vendorName === "Google Inc." && isOpera === false && isIEedge === false) {
			  return true;
		  }
		  else {
			  return false;
		  }
	},
	isIE : function() {
		return navigator.userAgent.includes("MSIE") || navigator.userAgent.includes("Trident/");
	},

	is_64bit : function() {
		let _to_check = [] ;
		if (window.navigator.hasOwnProperty("cpuClass"))
			_to_check.push((window.navigator.cpuClass + "").toLowerCase());
		if (window.navigator.platform)
			_to_check.push((window.navigator.platform + "").toLowerCase());
		if (navigator.userAgent)
			_to_check.push((navigator.userAgent + "").toLowerCase());
		const _64bits_signatures = ["x86_64", "x86-64", "Win64", "x64;", "amd64", "AMD64", "WOW64", "x64_64", "ia64", "sparc64", "ppc64", "IRIX64"];
		for (let _c=0; _c<_to_check.length; _c++) {
			for (let _i=0 ; _i<_64bits_signatures.length; _i++) {
				if (_to_check[_c].indexOf(_64bits_signatures[_i].toLowerCase())!=-1) {
					return true;
				}
			}
		}
		return false;
	},

	isMobile : function () {
	    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
	},

	getSimpleUserAgentString : function() {
		if (Utilities.isFirefox()) {
			return "Firefox";
		}
		else if (Utilities.isOpera()) {
			return "Opera";
		}
		else if (Utilities.isSafari()) {
			return "Safari";
		}
		else if (Utilities.isChrome()) {
			return "Chrome";
		}
		else if (Utilities.isIE()) {
			return "MSIE";
		}
		else {
			return "";
		}
	},

	getColorGamut : function() {
		if (!window.matchMedia) {
			//unknown
			return "";
		}
		else if (window.matchMedia('(color-gamut: rec2020)').matches) {
			return "rec2020";
		}
		else if (window.matchMedia('(color-gamut: p3)').matches) {
			return "P3";
		}
		else if (window.matchMedia('(color-gamut: srgb)').matches) {
			return "srgb";
		}
		else {
			return "";
		}
	},

	isEventSupported : function(event) {
		let testEl = document.createElement('div');
		let isSupported;

		event = 'on' + event;
		isSupported = (event in testEl);

		if (!isSupported) {
			testEl.setAttribute(event, 'return;');
			isSupported = typeof testEl[event] === 'function';
		}
		testEl = null;
		return isSupported;
	},

	//https://github.com/facebook/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js
	//BSD license
	normalizeWheel : function(/*object*/ event) /*object*/ {
		// Reasonable defaults
		const PIXEL_STEP  = 10;
		const LINE_HEIGHT = 40;
		const PAGE_HEIGHT = 800;

		let sX = 0, sY = 0;       // spinX, spinY

		// Legacy
		if ('detail'      in event) { sY = event.detail; }
		if ('wheelDelta'  in event) { sY = -event.wheelDelta / 120; }
		if ('wheelDeltaY' in event) { sY = -event.wheelDeltaY / 120; }
		if ('wheelDeltaX' in event) { sX = -event.wheelDeltaX / 120; }

		// side scrolling on FF with DOMMouseScroll
		if ('axis' in event && event.axis === event.HORIZONTAL_AXIS) {
			sX = sY;
			sY = 0;
		}

		let pX = sX * PIXEL_STEP; // pixelX
		let pY = sY * PIXEL_STEP; // pixelY

		if ('deltaY' in event) { pY = event.deltaY; }
		if ('deltaX' in event) { pX = event.deltaX; }

		if ((pX || pY) && event.deltaMode) {
			if (event.deltaMode == 1) {          // delta in LINE units
				pX *= LINE_HEIGHT;
				pY *= LINE_HEIGHT;
			} else {                             // delta in PAGE units
				pX *= PAGE_HEIGHT;
				pY *= PAGE_HEIGHT;
			}
		}

		// Fall-back if spin cannot be determined
		if (pX && !sX) { sX = (pX < 1) ? -1 : 1; }
		if (pY && !sY) { sY = (pY < 1) ? -1 : 1; }

		return {
			spinX  : sX,
			spinY  : sY,
			pixelX : pX,
			pixelY : pY,
			deltaMode : (event.deltaMode || 0),
			};
	},

	saveFile : function(filename, data, mimetype) {
	    const a = document.createElement("a");
	    a.setAttribute("style", "display: none");
	    document.body.appendChild(a);
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

	StringToUint8 : function(str) {
		const u8a = new Uint8Array(str.length);
		for(let i=0,j=str.length;i<j;++i){
			u8a[i] = str.charCodeAt(i);
		}
		return u8a;
	},

	Uint8ToString : function(u8a){
		if (typeof u8a == "string") {
			return u8a;
		}
		const CHUNK_SZ = 0x8000;
		const c = [];
		for (let i=0; i < u8a.length; i+=CHUNK_SZ) {
			c.push(String.fromCharCode.apply(null, u8a.subarray(i, i+CHUNK_SZ)));
		}
		return c.join("");
	},

	s : function(v){
		if (v===undefined) {
			return "";
		}
		const type = typeof v;
		if (type === 'object' && v.constructor===Uint8Array) {
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

	ArrayBufferToBase64 : function(uintArray) {
		// apply in chunks of 10400 to avoid call stack overflow
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
		let s = "";
		const skip = 10400;
		if (uintArray.subarray) {
			for (let i=0, len=uintArray.length; i<len; i+=skip) {
				s += String.fromCharCode.apply(null, uintArray.subarray(i, Math.min(i + skip, len)));
			}
		} else {
			for (let i=0, len=uintArray.length; i<len; i+=skip) {
				s += String.fromCharCode.apply(null, uintArray.slice(i, Math.min(i + skip, len)));
			}
		}
		return window.btoa(s);
	},

	ToBase64 : function(v) {
		try {
			return window.btoa(v);
		}
		catch (e) {
			return ArrayBufferToBase64(v);
		}
	},

	convertDataURIToBinary : function (dataURI) {
		const BASE64_MARKER = ';base64,';
		const base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
		const base64 = dataURI.substring(base64Index);
		const raw = window.atob(base64);
		const rawLength = raw.length;
		const array = new Uint8Array(new ArrayBuffer(rawLength));

		for (let i = 0; i < rawLength; i++) {
			array[i] = raw.charCodeAt(i);
		}
		return array;
	},


	parseINIString : function (data) {
	    const regex = {
	        section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,
	        param: /^\s*([^=]+?)\s*=\s*(.*?)\s*$/,
	        comment: /^\s*[;#].*$/
	    };
	    const value = {};
	    const lines = data.split(/[\r\n]+/);
	    let section = null;
	    lines.forEach(function(line){
	        if(regex.comment.test(line)){
	            return;
	        }else if(regex.param.test(line)){
	            const match = line.match(regex.param);
	            if(section){
	                value[section][match[1]] = match[2];
	            }else{
	                value[match[1]] = match[2];
	            }
	        }else if(regex.section.test(line)){
	            const match = line.match(regex.section);
	            value[match[1]] = {};
	            section = match[1];
	        }else if(line.length == 0 && section){
	            section = null;
	        }
	    });
	    return value;
	},

	/**
	 * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
	 * headers according to the format described here:
	 * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
	 * This method parses that string into a user-friendly key/value pair object.
	 */
	ParseResponseHeaders : function(headerStr) {
		const headers = {};
		if (!headerStr) {
			return headers;
		}
		const headerPairs = headerStr.split('\u000d\u000a');
		for (let i = 0; i < headerPairs.length; i++) {
			const headerPair = headerPairs[i];
			// Can't use split() here because it does the wrong thing
			// if the header value has the string ": " in it.
			const index = headerPair.indexOf('\u003a\u0020');
			if (index > 0) {
				const key = headerPair.substring(0, index);
				const val = headerPair.substring(index + 2);
				headers[key] = val;
			}
		}
		return headers;
	},

	parseParams : function(q) {
		const params = {};
		let e;
		const a = /\+/g,	// Regex for replacing addition symbol with a space
				r = /([^&=]+)=?([^&]*)/g,
				d = function (s) { return decodeURIComponent(s.replace(a, " ")); };
		while (e = r.exec(q))
				params[d(e[1])] = d(e[2]);
		return params;
	},

	getparam : function(prop) {
		let getParameter = window.location.getParameter;
		if (!getParameter) {
			getParameter = function(key) {
				if (!window.location.queryStringParams)
					window.location.queryStringParams = Utilities.parseParams(window.location.search.substring(1));
				return window.location.queryStringParams[key];
			};
		}
		let value = getParameter(prop);
		try {
			if (value === undefined && typeof(sessionStorage) !== "undefined") {
				value = sessionStorage.getItem(prop);
			}
		}
		catch (e) {
			value = null;
		}
		return value;
	},


	getboolparam : function(prop, default_value) {
		const v = Utilities.getparam(prop);
		if(v===null) {
			return default_value;
		}
		return ["true", "on", "1", "yes", "enabled"].indexOf(String(v).toLowerCase())!==-1;
	},

	hasSessionStorage : function() {
		if (typeof(Storage) === "undefined") {
			return false;
		}
		try {
			const key = "just for testing sessionStorage support";
		    sessionStorage.setItem(key, "store-whatever");
		    sessionStorage.removeItem(key);
		    return true;
		}
		catch (e) {
			return false;
		}
	},


	getConnectionInfo : function() {
		if (!navigator.hasOwnProperty("connection")) {
			return {};
		}
		const c = navigator.connection;
		const i = {};
		if (c.type) {
			i["type"] = c.type;
		}
		if (c.hasOwnProperty("effectiveType")) {
			i["effective-type"] = c.effectiveType;
		}
		if (!isNaN(c.downlink) && !isNaN(c.downlink) && c.downlink>0 && isFinite(c.downlink)) {
			i["downlink"] = Math.round(c.downlink*1000*1000);
		}
		if (c.hasOwnProperty("downlinkMax") && !isNaN(c.downlinkMax) && !isNaN(c.downlinkMax) && c.downlinkMax>0 && isFinite(c.downlinkMax)) {
			i["downlink.max"] = Math.round(c.downlinkMax*1000*1000);
		}
		if (!isNaN(c.rtt) && c.rtt>0) {
			i["rtt"] = c.rtt;
		}
		return i;
	},

	json_action  : function(uri, success_fn, error_fn, username, password) {
		Utilities.log("json_action(", uri, ", ", success_fn, ", ", error_fn, ")");
	    var xhr = new XMLHttpRequest();
	    var url = uri;
		if (uri.startsWith("/")) {
			//relative URI
			url = document.location.href.split("/connect.html")[0] + uri;
		}
	    xhr.open('GET', url, true);
		if (username && password) {
			xhr.setRequestHeader("Authorization", "Basic " + btoa(username+":"+password));
		}
	    xhr.responseType = 'json';
		xhr.addEventListener("load", function() {
			Utilities.log("loaded", url, "status", xhr.status);
			var status = xhr.status;
			if (status === 200) {
				success_fn(xhr, xhr.response);
			}
			else {
				Utilities.log(uri, "failed:", status+xhr.response);
				if (error_fn) {
					error_fn("failed: "+status+xhr.response);
				}
			}
		});
		xhr.addEventListener("error", function(e) {
			Utilities.log(uri, "error:", e);
			if (error_fn) {
				error_fn(e);
			}
		});
		xhr.addEventListener("abort", function(e) {
			Utilities.log(uri, "abort:", e);
			if (error_fn) {
				error_fn(e);
			}
		});
		xhr.send();
		return xhr;
	},
};


//convert a language code into an X11 keyboard layout code:
const LANGUAGE_TO_LAYOUT = {
		"en_GB"	: "gb",
		"en"	: "us",
		"zh"	: "cn",
		"af"	: "za",
		"sq"	: "al",
		//"ar"	: "ar",
		//"eu"	: "eu",
		//"bg"	: "bg",
		//"be"	: "be",
		"ca"	: "ca",
		"zh-TW"	: "tw",
		"zh-CN"	: "cn",
		//"zh-HK"	: ??
		//"zh-SG"	: ??
		//"hr"	: "hr",
		"cs"	: "cz",
		"da"	: "dk",
		//"nl"	: "nl",
		"nl-BE"	: "be",
		"en-US"	: "us",
		//"en-EG"	: ??
		"en-AU"	: "us",
		"en-GB"	: "gb",
		"en-CA"	: "ca",
		"en-NZ"	: "us",
		"en-IE"	: "ie",
		"en-ZA" : "za",
		"en-JM" : "us",
		//"en-BZ"	: ??
		"en-TT"	: "tr",
		"et"	: "ee",
		//"fo"	: "fo",
		"fa"	: "ir",
		//"fi"	: "fi",
		//"fr"	: "fr",
		"fr-BE"	: "be",
		"fr-CA"	: "ca",
		"fr-CH"	: "ch",
		"fr-LU"	: "fr",
		//"gd"	: ??
		"gd-IE"	: "ie",
		//"de"	: "de",
		"de-CH"	: "ch",
		"de-AT"	: "at",
		"de-LU"	: "de",
		"de-LI"	: "de",
		"he"	: "il",
		"hi"	: "in",
		//"hu"	: "hu",
		//"is"	: "is",
		//"id"	: ??,
		//"it"	: "it",
		"it-CH"	: "ch",
		"ja"	: "jp",
		"ko"	: "kr",
		//"lv"	: "lv",
		//"lt"	: "lt",
		//"mk"	: "mk",
		//"mt"	: "mt",
		//"no"	: "no",
		//"pl"	: "pl",
		"pt-BR"	: "br",
		"pt"	: "pt",
		//"rm"	: ??,
		//"ro"	: "ro",
		//"ro-MO"	: ??,
		//"ru"	: "ru",
		///"ru-MI"	: ??,
		//"sz"	: ??,
		"sr"	: "rs",
		//"sk"	: "sk",
		"sl"	: "si",
		//"sb"	: ??,
		"es"	: "es",
		//"es-AR", "es-GT", "es-CR", "es-PA", "es-DO", "es-MX", "es-VE", "es-CO",
		//"es-PE", "es-EC", "es-CL", "es-UY", "es-PY", "es-BO", "es-SV", "es-HN",
		//"es-NI", "es-PR",
		//"sx"	: ??,
		"sv"	: "se",
		"sv-FI"	: "fi",
		//"th"	: "th",
		//"ts"	: ??,
		//"tn"	: ??,
		"tr"	: "tr",
		"uk"	: "ua",
		"ur"	: "pk",
		//"ve"	: ??,
		"vi"	: "vn",
		//"xh"	: "??",
 		//"ji"	: "??",
		//"zu"	: "??",
};

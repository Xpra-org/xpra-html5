/*
 * Copyright (c) 2013-2022 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015-2016 Spikes, Inc.
 * Licensed under MPL 2.0
 *
 * xpra client
 *
 * requires:
 *	Protocol.js
 *	Window.js
 *	Keycodes.js
 */

"use strict";

const XPRA_CLIENT_FORCE_NO_WORKER = false;
const CLIPBOARD_IMAGES = true;
const CLIPBOARD_EVENT_DELAY = 100;
const DECODE_WORKER = !!window.createImageBitmap;
const rencode_ok = rencode && rencode_selftest();
const SHOW_START_MENU = true;


function truncate(input) {
  if (!input) {
    return input;
  }
  const s = input.toString();
  if (s.length > 5) {
    return s.substring(0, 5) + "...";
  }
  return s;
}


function XpraClient(container) {
	// the container div is the "screen" on the HTML page where we
	// are able to draw our windows in.
	this.container = document.getElementById(container);
	if (!this.container) {
		throw new Error("invalid container element");
	}
	// assign callback for window resize event
	if (window.jQuery) {
		const me = this;
		jQuery(window).resize(jQuery.debounce(250, function (e) {
			me._screen_resized(e, me);
		}));
	}

	this.protocol = null;

	this.init_settings();
	this.init_state();
}

XpraClient.prototype.init_settings = function() {
	//server:
	this.host = null;
	this.port = null;
	this.ssl = null;
	this.path = "";
	this.username = "";
	this.passwords = [];
	this.insecure = false;
	this.uri = "";
	this.packet_encoder = null;
	//connection options:
	this.sharing = false;
	this.open_url = true;
	this.steal = true;
	this.remote_logging = true;
	this.encoding = "auto";
	//basic set of encodings:
	//(more may be added after checking via the DecodeWorker)
	this.supported_encodings = ["jpeg", "png", "png/P", "png/L", "rgb", "rgb32", "rgb24", "scroll", "void"];
	//extra encodings we enable if validated via the decode worker:
	//(we also validate jpeg and png as a sanity check)
	this.check_encodings = ["jpeg", "png", "png/P", "png/L", "rgb", "rgb32", "rgb24", "scroll", "webp", "void", "avif"];
	this.debug_categories = [];
	this.start_new_session = null;
	this.clipboard_enabled = false;
	this.file_transfer = false;
	this.keyboard_layout = null;
	this.printing = false;
	this.key_packets = [];
	this.clipboard_delayed_event_time = 0;

	this.scale = 1;
	this.vrefresh = -1;
	this.bandwidth_limit = 0;
	this.reconnect = true;
	this.reconnect_count = 5;
	this.reconnect_in_progress = false;
	this.reconnect_delay = 1000;	//wait 1 second before retrying
	this.reconnect_attempt = 0;
	this.swap_keys = Utilities.isMacOS();
	this.HELLO_TIMEOUT = 30000;
	this.PING_TIMEOUT = 15000;
	this.PING_GRACE = 2000;
	this.PING_FREQUENCY = 5000;
	this.INFO_FREQUENCY = 1000;
	this.uuid = Utilities.getHexUUID();
	this.offscreen_api = DECODE_WORKER && XpraOffscreenWorker.isAvailable();
};

XpraClient.prototype.init_state = function() {
	// state
	this.connected = false;
	this.desktop_width = 0;
	this.desktop_height = 0;
	this.server_remote_logging = false;
	this.server_start_time = -1;
	this.client_start_time = new Date();
	// some client stuff
	this.capabilities = {};
	this.RGB_FORMATS = ["RGBX", "RGBA", "RGB"];
	this.disconnect_reason = null;
	this.password_prompt_fn = null;
	this.keycloak_prompt_fn = null;
	// audio
	this.audio = null;
	this.audio_enabled = false;
	this.audio_mediasource_enabled = MediaSourceUtil.getMediaSourceClass()!=null;
	this.audio_aurora_enabled = typeof AV!=='undefined' && AV!=null && AV.Decoder!=null && AV.Player.fromXpraSource!=null;
	this.audio_codecs = {};
	this.audio_framework = null;
	this.audio_aurora_ctx = null;
	this.audio_codec = null;
	this.audio_context = Utilities.getAudioContext();
	this.audio_state = null;
	this.aurora_codecs = {};
	this.mediasource_codecs = {};
	// encryption
	this.encryption = false;
	this.encryption_key = null;
	this.cipher_in_caps = null;
	this.cipher_out_caps = null;
	// detect locale change:
	this.browser_language = Utilities.getFirstBrowserLanguage();
	this.browser_language_change_embargo_time = 0;
	this.key_layout = null;
	this.last_keycode_pressed = 0;
	this.last_key_packet = [];
	// mouse
	this.buttons_pressed = new Set();
	this.last_button_event = [-1, false, -1, -1];
	this.mousedown_event = null;
	this.last_mouse_x = null;
	this.last_mouse_y = null;
	this.wheel_delta_x = 0;
	this.wheel_delta_y = 0;
	this.mouse_grabbed = false;
	this.scroll_reverse_x = false;
	this.scroll_reverse_y = "auto";
	// clipboard
	this.clipboard_direction = default_settings["clipboard_direction"] || "both";
	this.clipboard_datatype = null;
	this.clipboard_buffer = "";
	this.clipboard_server_buffers = {};
	this.clipboard_pending = false;
	this.clipboard_targets = ["UTF8_STRING", "TEXT", "STRING", "text/plain"];
	if (CLIPBOARD_IMAGES && navigator.clipboard && navigator.clipboard.hasOwnProperty("write")) {
		this.clipboard_targets.push("image/png");
	}
	else {
		this.log("no clipboard write support: no images, navigator.clipboard=", navigator.clipboard);
	}
	// printing / file-transfer:
	this.remote_printing = false;
	this.remote_file_transfer = false;
	this.remote_open_files = false;
	// hello
	this.hello_timer = null;
	this.info_timer = null;
	this.info_request_pending = false;
	this.server_last_info = {};
	// ping
	this.ping_timeout_timer = null;
	this.ping_grace_timer = null;
	this.ping_timer = null;
	this.last_ping_server_time = 0;
	this.last_ping_local_time = 0;
	this.last_ping_echoed_time = 0;
	this.server_ping_latency = 0;
	this.client_ping_latency = 0;
	this.server_load = null;
	this.server_ok = false;
	//packet handling
	this.decode_worker = null;
	// floating menu
	this.toolbar_position = "top";

	this.server_display = "";
	this.server_platform = "";
	this.server_resize_exact = false;
	this.server_screen_sizes = [];
	this.server_is_desktop = false;
	this.server_is_shadow = false;
	this.server_readonly = false;

	this.server_connection_data = false;

	this.xdg_menu = null;
	// a list of our windows
	this.id_to_window = {};
	this.ui_events = 0;
	this.pending_redraw = [];
	this.draw_pending = 0;
	// basic window management
	this.topwindow = null;
	this.topindex = 0;
	this.focus = 0;

	const me = this;
	const screen_element = jQuery("#screen");
	screen_element.mousedown(function (e) {
		me.on_mousedown(e);
	});
	screen_element.mouseup(function (e) {
		me.on_mouseup(e);
	});
	screen_element.mousemove(function (e) {
		me.on_mousemove(e);
	});

	const div = document.getElementById("screen");
	function on_mousescroll(e) {
		me.on_mousescroll(e);
		return e.preventDefault();
	}
	if (Utilities.isEventSupported("wheel")) {
		div.addEventListener('wheel',			on_mousescroll, false);
	}
	else if (Utilities.isEventSupported("mousewheel")) {
		div.addEventListener('mousewheel',		on_mousescroll, false);
	}
	else if (Utilities.isEventSupported("DOMMouseScroll")) {
		div.addEventListener('DOMMouseScroll',	on_mousescroll, false); // for Firefox
	}
};

XpraClient.prototype.send = function() {
	this.debug("network", "sending a", arguments[0], "packet");
	if (this.protocol) {
		this.protocol.send.apply(this.protocol, arguments);
	}
};

XpraClient.prototype.send_log = function(level, args) {
	if(this.remote_logging && this.server_remote_logging && this.connected) {
		try {
			const sargs = [];
			for(let i = 0; i < args.length; i++) {
				sargs.push(unescape(encodeURIComponent(String(args[i]))));
			}
			this.send(["logging", level, sargs]);
		} catch (e) {
			this.cerror("remote logging failed");
			for(let i = 0; i < args.length; i++) {
				this.clog(" argument", i, typeof args[i], ":", "'"+args[i]+"'");
			}
		}
	}
};
XpraClient.prototype.exc = function() {
	//first argument is the exception:
	const exception = arguments[0];
	let args = Array.from(arguments);
	args = args.splice(1);
	if (args.length>0) {
		this.cerror(args);
	}
	if (exception.stack) {
		try {
			//logging.ERROR = 40
			this.send_log(40, [exception.stack]);
		}
		catch (e) {
			//we tried our best
		}
	}
};
XpraClient.prototype.error = function() {
	//logging.ERROR = 40
	this.send_log(40, arguments);
	this.cerror.apply(this, arguments);
};
XpraClient.prototype.cerror = function() {
	Utilities.cerror.apply(Utilities, arguments);
};
XpraClient.prototype.warn = function() {
	//logging.WARN = 30
	this.send_log(30, arguments);
	this.cwarn.apply(this, arguments);
};
XpraClient.prototype.cwarn = function() {
	Utilities.cwarn.apply(Utilities, arguments);
};
XpraClient.prototype.log = function() {
	//logging.INFO = 20
	this.send_log(20, arguments);
	this.clog.apply(this, arguments);
};
XpraClient.prototype.clog = function() {
	Utilities.clog.apply(Utilities, arguments);
};
XpraClient.prototype.debug = function() {
	const category = arguments[0];
	let args = Array.from(arguments);
	//args = args.splice(1);
	if (this.debug_categories.includes(category)) {
		if (category!="network") {
			//logging.DEBUG = 10
			this.send_log(10, arguments);
		}
		this.cdebug.apply(this, arguments);
	}
};
XpraClient.prototype.cdebug = function() {
	Utilities.cdebug.apply(Utilities, arguments);
};


XpraClient.prototype.init = function(ignore_blacklist) {
	this.on_connection_progress("Initializing", "", 20);
	this.init_audio(ignore_blacklist);
	this.init_packet_handlers();
	this.init_keyboard();
	if (this.scale!==1) {
		this.container.style.width = 100*this.scale+"%";
		this.container.style.height = 100*this.scale+"%";
		this.container.style.transform = "scale("+1/this.scale+")";
		this.container.style.transformOrigin = "top left";
	}
};


XpraClient.prototype.init_packet_handlers = function() {
	// the client holds a list of packet handlers
	this.packet_handlers = {
		'open': this._process_open,
		'close': this._process_close,
		'error': this._process_error,
		'disconnect': this._process_disconnect,
		'challenge': this._process_challenge,
		'startup-complete': this._process_startup_complete,
		'hello': this._process_hello,
		'encodings': this._process_encodings,
		'ping': this._process_ping,
		'ping_echo': this._process_ping_echo,
		'info-response': this._process_info_response,
		'new-tray': this._process_new_tray,
		'new-window': this._process_new_window,
		'new-override-redirect': this._process_new_override_redirect,
		'window-metadata': this._process_window_metadata,
		'lost-window': this._process_lost_window,
		'raise-window': this._process_raise_window,
		'window-icon': this._process_window_icon,
		'window-resized': this._process_window_resized,
		'window-move-resize': this._process_window_move_resize,
		'initiate-moveresize': this._process_initiate_moveresize,
		'configure-override-redirect': this._process_configure_override_redirect,
		'desktop_size': this._process_desktop_size,
		'eos': this._process_eos,
		'draw': this._process_draw,
		'cursor': this._process_cursor,
		'bell': this._process_bell,
		'notify_show' : this._process_notify_show,
		'notify_close' : this._process_notify_close,
		'sound-data': this._process_sound_data,
		'clipboard-token': this._process_clipboard_token,
		'set-clipboard-enabled': this._process_set_clipboard_enabled,
		'clipboard-request': this._process_clipboard_request,
		'send-file': this._process_send_file,
		'open-url': this._process_open_url,
		'setting-change': this._process_setting_change,
		'pointer-position': this._process_pointer_position,
	};
};

XpraClient.prototype.on_connection_progress = function(state, details, progress) {
	//can be overriden
	this.clog(state, details);
};

XpraClient.prototype.callback_close = function(reason) {
	if (reason === undefined) {
		reason = "unknown reason";
	}
	this.clog("connection closed: "+reason);
};

XpraClient.prototype.connect = function() {
	let details = this.host + ":" + this.port + this.path;
	if (this.ssl) {
		details += " with ssl";
	}
	this.schedule_hello_timer();
	this.on_connection_progress("Connecting to server", details, 40);
	// open the web socket, started it in a worker if available
	// check we have enough information for encryption
	if(this.encryption && ((!this.encryption_key) || (this.encryption_key == ""))) {
		this.disconnect("no key specified for encryption");
		return;
	}
	this.initialize_workers();
}

XpraClient.prototype.initialize_workers = function() {
	const safe_encodings = ["jpeg", "png", "png/P", "png/L", "rgb", "rgb32", "rgb24", "scroll", "void"];
	// detect websocket in webworker support and degrade gracefully
	if (!window.Worker) {
		// no webworker support
		this.supported_encodings = safe_encodings;
		this.offscreen_api = false;
		this.decode_worker = false;
		this.clog("no webworker support at all.");
		this._do_connect(false);
		return;
	}
	this.clog("we have webworker support");
	// spawn worker that checks for a websocket
	const me = this;
	const worker = new Worker('js/lib/wsworker_check.js');
	worker.addEventListener('message', function(e) {
		const data = e.data;
		switch (data['result']) {
		case true:
			// yey, we can use websocket in worker!
			me.clog("we can use websocket in webworker");
			me._do_connect(true);
			break;
		case false:
			me.clog("we can't use websocket in webworker, won't use webworkers");
			me._do_connect(false);
			break;
		default:
			me.clog("client got unknown message from worker");
			me._do_connect(false);
		}
	}, false);
	// ask the worker to check for websocket support, when we receive a reply
	// through the eventlistener above, _do_connect() will finish the job
	worker.postMessage({'cmd': 'check'});

	if (!DECODE_WORKER) {
		this.supported_encodings = safe_encodings;
		this.decode_worker = false;
		return;
	}
	let decode_worker;
	 if (this.offscreen_api) {
		me.clog("using offscreen decode worker");
		decode_worker = new Worker('js/OffscreenDecodeWorker.js');
	} else {
		me.clog("using decode worker");
		decode_worker = new Worker('js/DecodeWorker.js');
	}
	decode_worker.addEventListener('message', function(e) {
		const data = e.data;
		if (data['draw']) {
			me.do_process_draw(data['draw'], data['start']);
			return;
		}
		if (data['error']) {
			const msg = data['error'],
				packet = data['packet'],
				wid = packet[1],
				width = packet[2],
				height = packet[3],
				coding = packet[6],
				packet_sequence = packet[8];
			me.clog("decode error on ", coding, "packet sequence", packet_sequence, ":", msg);
			if (!me.offscreen_api) {
				me.clog(" pixel data:", packet[7]);
			}
			me.do_send_damage_sequence(packet_sequence, wid, width, height, -1, msg);
			return;
		}
		switch (data['result']) {
		case true:
			const formats = Array.from(data['formats']);
			me.clog("we can decode using a worker:", decode_worker);
			me.supported_encodings = formats;
			me.clog("full list of supported encodings:", me.supported_encodings);
			me.decode_worker = decode_worker;
			break;
		case false:
			me.clog("we can't decode using a worker: "+data['errors']);
			me.decode_worker = false;
			break;
		default:
			me.clog("client got unknown message from the decode worker");
			me.decode_worker = false;
		}
	}, false);
	this.clog("decode worker will check:", this.check_encodings);
	decode_worker.postMessage({'cmd': 'check', 'encodings' : this.check_encodings});
};

XpraClient.prototype._do_connect = function(with_worker) {
	if(with_worker && !(XPRA_CLIENT_FORCE_NO_WORKER)) {
		this.protocol = new XpraProtocolWorkerHost();
	} else {
		this.protocol = new XpraProtocol();
	}
	this.open_protocol();
};

XpraClient.prototype.open_protocol = function() {
	// set protocol to deliver packets to our packet router
	this.protocol.set_packet_handler(this._route_packet, this);
	// make uri
	let uri = "ws://";
	if (this.ssl)
		uri = "wss://";
	uri += this.host;
	if (this.port)
		uri += ":" + this.port;
	uri += this.path;
	// do open
	this.uri = uri;
	this.on_connection_progress("Opening WebSocket connection", uri, 50);
	this.protocol.open(uri);
};

XpraClient.prototype.request_refresh = function(wid) {
	this.send([
		"buffer-refresh", wid, 0, 100,
		{
			"refresh-now"	: true,
			"batch"			: {"reset" : true},
		},
		{},	//no client_properties
		]);
};

XpraClient.prototype.redraw_windows = function() {
	for (const i in this.id_to_window) {
		const iwin = this.id_to_window[i];
		this.request_redraw(iwin);
	}
};

XpraClient.prototype.remove_windows = function() {
	for (const wid in this.id_to_window) {
		const win = this.id_to_window[wid];
		window.removeWindowListItem(win.wid);
		win.destroy();
    }
}

XpraClient.prototype.close_windows = function() {
	for (const i in this.id_to_window) {
		const iwin = this.id_to_window[i];
		window.removeWindowListItem(i);
		iwin.destroy();
	}
};

XpraClient.prototype.close_protocol = function() {
	this.connected = false;
	if (this.protocol) {
		this.protocol.close();
		this.protocol = null;
	}
};

XpraClient.prototype.clear_timers = function() {
	this.stop_info_timer();
	this.cancel_hello_timer();
	if (this.ping_timer) {
		clearTimeout(this.ping_timer);
		this.ping_timer = null;
	}
	if (this.ping_timeout_timer) {
		clearTimeout(this.ping_timeout_timer);
		this.ping_timeout_timer = null;
	}
	if (this.ping_grace_timer) {
		clearTimeout(this.ping_grace_timer);
		this.ping_grace_timer = null;
	}
};

XpraClient.prototype.set_encoding = function(encoding) {
	// add an encoding to our hello.encodings list
	this.clog("encoding:", encoding);
	this.encoding = encoding;
};

XpraClient.prototype._route_packet = function(packet, ctx) {
	// ctx refers to `this` because we came through a callback
	const packet_type = Utilities.s(packet[0]);
	ctx.debug("network", "received a", packet_type, "packet");
	const fn = ctx.packet_handlers[packet_type];
	if (fn==undefined) {
		ctx.cerror("no packet handler for ", packet_type);
		ctx.clog(packet);
	} else {
		fn(packet, ctx);
	}
};

XpraClient.prototype._screen_resized = function(event, ctx) {
	// send the desktop_size packet so server knows we changed size
	if (!this.connected) {
		return;
	}
	if (this.container.clientWidth==this.desktop_width && this.container.clientHeight==this.desktop_height) {
		return;
	}
	this.desktop_width = this.container.clientWidth;
	this.desktop_height = this.container.clientHeight;
	const newsize = [this.desktop_width, this.desktop_height];
	const packet = ["desktop_size", newsize[0], newsize[1], this._get_screen_sizes()];
	ctx.send(packet);
	// call the screen_resized function on all open windows
	for (const i in ctx.id_to_window) {
		const iwin = ctx.id_to_window[i];
		iwin.screen_resized();

		// Force fullscreen on a a given window name from the provided settings
		if (default_settings !== undefined && default_settings.auto_fullscreen !== undefined && default_settings.auto_fullscreen.length > 0) {
			var pattern = new RegExp(".*" + default_settings.auto_fullscreen + ".*");
			if (iwin.fullscreen === false && iwin.metadata.title.match(pattern)) {
				clog("auto fullscreen window: " + iwin.metadata.title);
				iwin.set_fullscreen(true);
				iwin.screen_resized();
			}
		}

		// Make a DESKTOP-type window fullscreen automatically.
		// This resizes things like xfdesktop according to the window size.
		if (this.fullscreen === false && this.client.is_window_desktop(iwin)) {
			clog("auto fullscreen desktop window: " + this.metadata.title);
			this.set_fullscreen(true);
			this.screen_resized();
		}
	}
	// Re-position floating toolbar menu
	this.position_float_menu();
};

/**
 * Keyboard
 */
XpraClient.prototype.init_keyboard = function() {
	const me = this;
	this.query_keyboard_map();
	// modifier keys:
	this.num_lock_modifier = null;
	this.alt_modifier = null;
	this.control_modifier = "control";
	this.meta_modifier = null;
	this.altgr_modifier = null;
	this.altgr_state = false;

	this.capture_keyboard = false;
	// assign the key callbacks
	document.addEventListener('keydown', function(e) {
		const preview_el = $('#window_preview');

		if (e.code === 'Escape') {
			if (preview_el.is(":visible")) {
				client.toggle_window_preview();

				return e.stopPropagation() || e.preventDefault();
			}
		}
		if (e.code === 'Tab') {
			if (preview_el.is(":visible")) {
				// Select next for previous window.
				const num_slides = $(".window-preview-item-container").length;
				const curr_slide = preview_el.slick("slickCurrentSlide");
				var next_index = curr_slide;
				if (e.shiftKey) {
					next_index = (curr_slide - 1) % num_slides;
				} else {
					next_index = (curr_slide + 1) % num_slides;
				}
				preview_el.slick("goTo", next_index, true);
				return e.stopPropagation() || e.preventDefault();
			} else if (e.altKey) {
				// Alt+Tab shows window preview. and goes to the next window.
				client.toggle_window_preview((e, slick) => {
					const num_slides = slick.slideCount;
					const curr_slide = slick.currentSlide;
					var next_index = (curr_slide + 1) % num_slides;
					setTimeout(() => { slick.goTo(next_index, true); }, 10);
				});
				return e.stopPropagation() || e.preventDefault();
			}
		}
		const r = me._keyb_onkeydown(e, me);
		if (!r) {
			e.preventDefault();
		}
	});
	document.addEventListener('keyup', function (e) {
		if (e.code === 'Tab' || e.code.startsWith("Alt")) {
			if ($('#window_preview').is(":visible")) {
				if (e.code.startsWith("Alt")) {
					client.toggle_window_preview();
				}
				return e.stopPropagation() || e.preventDefault();
			}
		}
		const r = me._keyb_onkeyup(e, me);
		if (!r) {
			e.preventDefault();
		}
	});
};

XpraClient.prototype.query_keyboard_map = function() {
	var keyboard = navigator.keyboard;
	this.keyboard_map = {};
	if (!navigator.keyboard) {
		return;
	}
	keyboard.getLayoutMap().then(keyboardLayoutMap => {
		clog("got a keyboard layout map:", keyboardLayoutMap);
		clog("keys:", Array.from(keyboardLayoutMap.keys()));
		for (const [key, value] of keyboardLayoutMap.entries()) {
			cdebug("keyboard", key, "=", value);
			this.keyboard_map[key] = value;
		}
	});
	if (keyboard.addEventListener) {
		keyboard.addEventListener("layoutchange", function() {
			clog("keyboard layout has changed!");
		});
	}
};

XpraClient.prototype._keyb_get_modifiers = function(event) {
	/**
	 * Returns the modifiers set for the current event.
	 * We get the list of modifiers using "get_event_modifiers"
	 * then we translate them.
	 */
	//convert generic modifiers "meta" and "alt" into their x11 name:
	const modifiers = get_event_modifiers(event);
	return this.translate_modifiers(modifiers);
};

XpraClient.prototype.translate_modifiers = function(modifiers) {
	/**
	 * We translate "alt" and "meta" into their keymap name.
	 * (usually "mod1")
	 * And also swap keys for macos clients.
	 */
	//convert generic modifiers "meta" and "alt" into their x11 name:
	const alt = this.alt_modifier;
	let control = this.control_modifier;
	let meta = this.meta_modifier;
	const altgr = this.altgr_modifier;
	if (this.swap_keys) {
		meta = this.control_modifier;
		control = this.meta_modifier;
	}

	const new_modifiers = modifiers.slice();
	let index = modifiers.indexOf("meta");
	if (index>=0 && meta)
		new_modifiers[index] = meta;
	index = modifiers.indexOf("control");
	if (index>=0 && control)
		new_modifiers[index] = control;
	index = modifiers.indexOf("alt");
	if (index>=0 && alt)
		new_modifiers[index] = alt;
	index = modifiers.indexOf("numlock");
	if (index>=0) {
		if (this.num_lock_modifier) {
			new_modifiers[index] = this.num_lock_modifier;
		}
		else {
			new_modifiers.splice(index, 1);
		}
	}
	index = modifiers.indexOf("capslock");
	if (index>=0) {
		new_modifiers[index] = "lock";
	}
	
	//add altgr?
	if (this.altgr_state && altgr && !new_modifiers.includes(altgr)) {
		new_modifiers.push(altgr);
		//remove spurious modifiers:
		index = new_modifiers.indexOf(alt);
		if (index>=0)
			new_modifiers.splice(index, 1);
		index = new_modifiers.indexOf(control);
		if (index>=0)
			new_modifiers.splice(index, 1);
	}
	//this.clog("altgr_state=", this.altgr_state, ", altgr_modifier=", this.altgr_modifier, ", modifiers=", new_modifiers);
	return new_modifiers;
};


XpraClient.prototype._check_browser_language = function(key_layout) {
	/**
	 * This function may send the new detected keyboard layout.
	 * (ignoring the keyboard_layout preference)
	 */
	const now = performance.now();
	if (now<this.browser_language_change_embargo_time) {
		return;
	}
	let new_layout;
	if (key_layout) {
		new_layout = key_layout;
	}
	else {
		//we may have used a different layout for a specific key,
		//and now this new key doesn't need it anymore,
		//so we may want to switch back to the original layout:
		const l = Utilities.getFirstBrowserLanguage();
		if (l && this.browser_language != l) {
			//if the browser language has changed,
			//this takes precedence over the configuration
			this.clog("browser language changed from", this.browser_language, "to", l);
			this.browser_language = l;
			new_layout = Utilities.getKeyboardLayout();
		}
		else {
			//this will honour the setting supplied by the user on the connect page
			//or default to Utilities.getKeyboardLayout()
			new_layout = this._get_keyboard_layout() || "us";
		}
	}
	if (new_layout!=null && this.key_layout!=new_layout) {
		this.key_layout = new_layout;
		this.clog("keyboard layout changed from", this.key_layout, "to", key_layout);
		this.send(["layout-changed", new_layout, ""]);
		//changing the language too quickly can cause problems server side,
		//wait a bit before checking again:
		this.browser_language_change_embargo_time = now + 1000;
	}
	else {
		//check again after 100ms minimum
		this.browser_language_change_embargo_time = now + 100;
	}
};


XpraClient.prototype._keyb_process = function(pressed, event) {
	// MSIE hack
	return this.do_keyb_process(pressed, event || window.event);
}

XpraClient.prototype.do_keyb_process = function(pressed, event) {
	if (this.server_readonly) {
		return true;
	}
	if (!this.capture_keyboard) {
		return true;
	}
	/**
	 * Process a key event: key pressed or key released.
	 * Figure out the keycode, keyname, modifiers, etc
	 * And send the event to the server.
	 */

	let keyname = event.code || "";
	const keycode = event.which || event.keyCode;
	if (keycode==229) {
		//this usually fires when we have received the event via "oninput" already
		return;
	}
	let str = event.key || String.fromCharCode(keycode);
	let unpress_now = false;
	this.debug("keyboard", "last keycode pressed=", this.last_keycode_pressed, ", keycode=", keycode, ", pressed=", pressed, ", str=", str);
	const dead = str.toLowerCase()=="dead";
	if (dead && ((this.last_keycode_pressed!=keycode && !pressed) || pressed)) {
		//dead key unpress without first getting a key pressed event,
		//or just a regular pressed dead key, in both cases send a pair:
		pressed = true;
		unpress_now = true;
	}

	if (pressed) {
		this.last_keycode_pressed = keycode;
	}
	else {
		this.last_keycode_pressed = 0;
	}

	this.debug("keyboard", "processKeyEvent(", pressed, ", ", event, ") key=", keyname, "keycode=", keycode, "dead=", dead);

	//sync numlock
	if (keycode==144 && pressed) {
		this.num_lock = !this.num_lock;
	}

	let key_language = null;
	//some special keys are better mapped by name:
	const map_str = this.keyboard_map[keyname];
	this.clog("keyname in keyboard_map=", keyname in this.keyboard_map, "map_str=", map_str);
	if (dead && map_str && map_str in DEAD_KEYS) {
		keyname = DEAD_KEYS[map_str];
		str = map_str;
		this.debug("keyboard", "dead key:", keyname);
	}
	else if (keyname in KEY_TO_NAME){
		keyname = KEY_TO_NAME[keyname];
	}
	else if (keyname=="" && str in KEY_TO_NAME){
		keyname = KEY_TO_NAME[str];
	}
	//special case for numpad,
	//try to distinguish arrowpad and numpad:
	//(for arrowpad, keyname==str)
	else if (keyname!=str && str in NUMPAD_TO_NAME) {
		keyname = NUMPAD_TO_NAME[str];
		this.num_lock = ("0123456789.".includes(keyname));
	}
	//next try mapping the actual character
	else if (str in CHAR_TO_NAME) {
		keyname = CHAR_TO_NAME[str];
		if (keyname.includes("_")) {
			//ie: Thai_dochada
			const lang = keyname.split("_")[0];
			key_language = KEYSYM_TO_LAYOUT[lang];
		}
	}
	//fallback to keycode map:
	else {
		if (keycode in CHARCODE_TO_NAME) {
			keyname = CHARCODE_TO_NAME[keycode];
		}
		//may override with shifted table:
		if (event.getModifierState && event.getModifierState("Shift") && keycode in CHARCODE_TO_NAME_SHIFTED) {
			keyname = CHARCODE_TO_NAME_SHIFTED[keycode];
		}
	}

	this._check_browser_language(key_language);

	const DOM_KEY_LOCATION_RIGHT = 2;
	if (keyname.match("_L$") && event.location==DOM_KEY_LOCATION_RIGHT)
		keyname = keyname.replace("_L", "_R");

	//AltGr: keep track of pressed state
	if (str=="AltGraph" || (keyname=="Alt_R" && (Utilities.isWindows() || Utilities.isMacOS())) || (keyname=="Alt_L" && Utilities.isMacOS())) {
		this.altgr_state = pressed;
		keyname = "ISO_Level3_Shift";
		str = "AltGraph";
	}

	//if (this.num_lock && keycode>=96 && keycode<106)
	//	keyname = "KP_"+(keycode-96);

	const raw_modifiers = get_event_modifiers(event);
	const modifiers = this._keyb_get_modifiers(event);
	const keyval = keycode;
	const group = 0;

	const shift = modifiers.includes("shift");
	const capslock = modifiers.includes("capslock");
	if ((capslock && shift) || (!capslock && !shift)) {
		str = str.toLowerCase();
	}

	const ostr = str;
	if (this.swap_keys) {
		if (keyname=="Control_L") {
			keyname = "Meta_L";
			str = "meta";
		}
		else if (keyname=="Meta_L") {
			keyname = "Control_L";
			str = "control";
		}
		else if (keyname=="Control_R") {
			keyname = "Meta_R";
			str = "meta";
		}
		else if (keyname=="Meta_R") {
			keyname = "Control_R";
			str = "control";
		}
	}
	
	//macos will swallow the key release event if the meta modifier is pressed,
	//so simulate one immediately:
	if (pressed && Utilities.isMacOS() && raw_modifiers.includes("meta") && ostr!="meta") {
		unpress_now = true;
	}

	let allow_default = false;
	if (this.clipboard_enabled && client.clipboard_direction !== "to-server") {
		//allow some key events that need to be seen by the browser
		//for handling the clipboard:
		let clipboard_modifier_keys = ["Control_L", "Control_R", "Shift_L", "Shift_R"];
		let clipboard_modifier = "control";
		if (Utilities.isMacOS()) {
			//Apple does things differently, as usual:
			clipboard_modifier_keys = ["Meta_L", "Meta_R", "Shift_L", "Shift_R"];
			clipboard_modifier = "meta";
		}
		//let the OS see Control (or Meta on macos) and Shift:
		if (clipboard_modifier_keys.indexOf(keyname)>=0) {
			this.debug("keyboard", "passing clipboard modifier key event to browser:", keyname);
			allow_default = true;
		}
		//let the OS see Shift + Insert:
		if (shift && keyname=="Insert") {
			this.debug("keyboard", "passing clipboard combination Shift+Insert to browser");
			allow_default = true;
		}
		const clipboard_mod_set = raw_modifiers.includes(clipboard_modifier);
		if (clipboard_mod_set) {
			const l = keyname.toLowerCase();
			if (l=="c" || l=="x" || l=="v") {
				this.debug("keyboard", "passing clipboard combination to browser:", clipboard_modifier, "+", keyname);
				allow_default = true;
				if (l=="v") {
					this.clipboard_delayed_event_time = performance.now()+CLIPBOARD_EVENT_DELAY;
				}
			}
		}
	}

	if (this.topwindow != null) {
		let packet = ["key-action", this.topwindow, keyname, pressed, modifiers, keyval, str, keycode, group];
		this.key_packets.push(packet);
		if (unpress_now) {
			packet = ["key-action", this.topwindow, keyname, false, modifiers, keyval, str, keycode, group];
			this.key_packets.push(packet);
		}

		//if there is a chance that we're in the process of handling
		//a clipboard event (a click or control-v)
		//then we send with a slight delay:
		let delay = 0;
		const now = performance.now();
		if (this.clipboard_delayed_event_time>now) {
			delay = this.clipboard_delayed_event_time-now;
		}
		const me = this;
		setTimeout(function () {
			while (me.key_packets.length>0) {
				var key_packet = me.key_packets.shift();
				me.last_key_packet = key_packet;
				me.send(key_packet);
			}
		}, delay);
	}
	if (keyname=="F11") {
		this.debug("keyboard", "allowing default handler for", keyname);
		allow_default = true;
	}
	return allow_default;
};


XpraClient.prototype._keyb_onkeydown = function(event, ctx) {
	return ctx._keyb_process(true, event);
};
XpraClient.prototype._keyb_onkeyup = function(event, ctx) {
	return ctx._keyb_process(false, event);
};

XpraClient.prototype._get_keyboard_layout = function() {
	this.debug("keyboard", "_get_keyboard_layout() keyboard_layout=", this.keyboard_layout);
	if (this.keyboard_layout)
		return this.keyboard_layout;
	return Utilities.getKeyboardLayout();
};

XpraClient.prototype._get_keycodes = function() {
	//keycodes.append((nn(keyval), nn(name), nn(keycode), nn(group), nn(level)))
	const keycodes = [];
	let kc;
	for(const keycode in CHARCODE_TO_NAME) {
		kc = parseInt(keycode);
		keycodes.push([kc, CHARCODE_TO_NAME[keycode], kc, 0, 0]);
	}
	//show("keycodes="+keycodes.toSource());
	return keycodes;
};

XpraClient.prototype._get_desktop_size = function() {
	return [this.desktop_width, this.desktop_height];
};

XpraClient.prototype._get_DPI = function() {
	"use strict";
	const dpi_div = document.getElementById("dpi");
	if (dpi_div != undefined) {
		//show("dpiX="+dpi_div.offsetWidth+", dpiY="+dpi_div.offsetHeight);
		if (dpi_div.offsetWidth>0 && dpi_div.offsetHeight>0)
			return Math.round((dpi_div.offsetWidth + dpi_div.offsetHeight) / 2.0);
	}
	//alternative:
	if ('deviceXDPI' in screen)
		return (screen.systemXDPI + screen.systemYDPI) / 2;
	//default:
	return 96;
};

XpraClient.prototype._get_screen_sizes = function() {
	const dpi = this._get_DPI();
	const screen_size = [this.container.clientWidth, this.container.clientHeight];
	const wmm = Math.round(screen_size[0]*25.4/dpi);
	const hmm = Math.round(screen_size[1]*25.4/dpi);
	const monitor = ["Canvas", 0, 0, screen_size[0], screen_size[1], wmm, hmm];
        let name = "HTML";
        if (navigator.userAgentData && navigator.userAgentData.brands) {
            name = navigator.userAgentData.brands[0].brand+" "+navigator.userAgentData.brands[0].version;
        }
	const screen = [name, screen_size[0], screen_size[1],
				wmm, hmm,
				[monitor],
				0, 0, screen_size[0], screen_size[1]
			];
	//just a single screen:
	return [screen];
};


XpraClient.prototype._update_capabilities = function(appendobj) {
	for (const attr in appendobj) {
		this.capabilities[attr] = appendobj[attr];
	}
};

/**
 * Ping
 */
XpraClient.prototype._check_server_echo = function(ping_sent_time) {
	const last = this.server_ok;
	this.server_ok = this.last_ping_echoed_time >= ping_sent_time;
	//this.clog("check_server_echo", this.server_ok, "last", last, "last_time", this.last_ping_echoed_time, "this_this", ping_sent_time);
	if(last != this.server_ok) {
		if(!this.server_ok) {
			this.clog("server connection is not responding, drawing spinners...");
		} else {
			this.clog("server connection is OK");
		}
		for (const i in this.id_to_window) {
			const iwin = this.id_to_window[i];
			iwin.set_spinner(this.server_ok);
		}
	}
};

XpraClient.prototype._check_echo_timeout = function(ping_time) {
	if (this.reconnect_in_progress) {
		return;
	}
	if(this.last_ping_echoed_time > 0 && this.last_ping_echoed_time < ping_time) {
		if (this.reconnect && this.reconnect_attempt<this.reconnect_count) {
			this.warn("ping timeout - reconnecting");
			this.reconnect_attempt++;
			this.do_reconnect();
		}
		else {
			// no point in telling the server here...
			this.disconnect("server ping timeout, waited "+ this.PING_TIMEOUT +"ms without a response");
		}
	}
};


XpraClient.prototype._emit_event = function(event_type) {
	const event = document.createEvent("Event");
	event.initEvent(event_type, true, true);
	document.dispatchEvent(event);
};
XpraClient.prototype.emit_connection_lost = function(event_type) {
	this._emit_event("connection-lost");
};
XpraClient.prototype.emit_connection_established = function(event_type) {
	this._emit_event("connection-established");
};


/**
 * Hello
 */
XpraClient.prototype._send_hello = function(counter) {
	if (this.decode_worker==null) {
		counter = (counter || 0);
		if (counter==0) {
			this.on_connection_progress("Waiting for decode worker", "", 90);
			this.clog("waiting for decode worker to finish initializing");
		}
		else if (counter>100) {
			//we have waited 10 seconds or more...
			//continue without:
			this.do_send_hello(null, null);
		}
		//try again later:
		const me = this;
		setTimeout(function() {
			me._send_hello(counter+1);
		}, 100);
	}
	else {
		this.do_send_hello(null, null);
	}
}

XpraClient.prototype.do_send_hello = function(challenge_response, client_salt) {
	// make the base hello
	this._make_hello_base();
	// handle a challenge if we need to
	if((this.passwords.length>0) && (!challenge_response)) {
		// tell the server we expect a challenge (this is a partial hello)
		this.capabilities["challenge"] = true;
		this.clog("sending partial hello");
	} else {
		this.clog("sending hello");
		// finish the hello
		this._make_hello();
	}
	if(challenge_response) {
		this._update_capabilities({
			"challenge_response": challenge_response
		});
		if(client_salt) {
			this._update_capabilities({
				"challenge_client_salt" : client_salt
			});
		}
	}
	this.clog("sending hello capabilities", this.capabilities);
	// verify:
	for (const key in this.capabilities) {
		if (key==null) {
			throw new Error("invalid null key in hello packet data");
		}
		const value = this.capabilities[key];
		if (value==null) {
			throw new Error("invalid null value for key "+key+" in hello packet data");
		}
	}
	// send the packet
	this.send(["hello", this.capabilities]);
	this.schedule_hello_timer();
};

XpraClient.prototype._make_hello_base = function() {
	this.capabilities = {};
	const digests = ["hmac", "hmac+md5", "xor", "keycloak"];
	if (typeof forge!=='undefined') {
		try {
			this.debug("network", "forge.md.algorithms=", forge.md.algorithms);
			for (const hash in forge.md.algorithms) {
				digests.push("hmac+"+hash);
			}
			this.debug("network", "digests:", digests);
		}
		catch (e) {
			this.cerror("Error probing forge crypto digests");
		}
	}
	else {
		this.clog("cryptography library 'forge' not found");
	}
	this._update_capabilities({
		// version and platform
		"version"					: Utilities.VERSION,
		"build.revision"			: Utilities.REVISION,
		"build.local_modifications"	: Utilities.LOCAL_MODIFICATIONS,
		"build.branch"				: Utilities.BRANCH,
		"platform"					: Utilities.getPlatformName(),
		"platform.name"				: Utilities.getPlatformName(),
		"platform.processor"		: Utilities.getPlatformProcessor(),
		"platform.platform"			: navigator.appVersion,
		"session-type"				: Utilities.getSimpleUserAgentString(),
		"session-type.full"			: navigator.userAgent,
		"namespace"			 		: true,
		"clipboard.contents-slice-fix" : true,
		"share"						: this.sharing,
		"steal"						: this.steal,
		"client_type"				: "HTML5",
		"websocket.multi-packet"	: true,
		"setting-change"			: true,
		"username" 					: this.username,
		"display"					: this.server_display || "",
		"uuid"						: this.uuid,
		"argv" 						: [window.location.href],
		"digest" 					: digests,
		"salt-digest" 				: digests,
		//compression bits:
		"zlib"						: true,
		"compression_level"	 		: 1,
		"mouse.show"				: true,
		// packet encoders
		//don't enable plain rencode (too many problems with bytes and strings)
		//"rencode" 					: rencode_ok,
		"rencodeplus"				: rencode_ok,
		"bencode"					: true,
		"yaml"						: false,
		"open-url"					: this.open_url,
		"ping-echo-sourceid"		: true,
		"vrefresh"					: this.vrefresh,
		"network" : {
			"pings" : 5,
		},
	});
	if (SHOW_START_MENU) {
		this._update_capabilities({
			"xdg-menu-update"			: true,
			});
	}
	if (this.bandwidth_limit>0) {
		this._update_capabilities({
			"bandwidth-limit"	: this.bandwidth_limit,
		});
	}
	const ci = Utilities.getConnectionInfo();
	if (ci) {
		this._update_capabilities({
			"connection-data"	: ci,
		});
	}
	if (lz4.decode) {
		this._update_capabilities({
			"lz4"						: true,
			"encoding.rgb_lz4"			: true,
		});
	}

	if(typeof BrotliDecode != "undefined" && !Utilities.isIE()) {
		this._update_capabilities({
			"brotli"					: true,
		});
	}

	this._update_capabilities({
		"clipboard.preferred-targets" : this.clipboard_targets,
	});

	if(this.encryption) {
		const enc = this.encryption.split("-")[0];
		if (enc!="AES") {
			throw "invalid encryption specified: '"+enc+"'";
		}
		const mode = this.encryption.split("-")[1] || "CBC";
		this.cipher_in_caps = {
			"cipher"					: enc,
			"cipher.mode"				: mode,
			"cipher.iv"					: Utilities.getSecureRandomString(16),
			"cipher.key_salt"			: Utilities.getSecureRandomString(32),
			"cipher.key_size"			: 32,		//256 bits
			"cipher.key_hash"			: "SHA1",
			"cipher.key_stretch_iterations"	: 1000,
			"cipher.padding.options"	: ["PKCS#7"],
		};
		this._update_capabilities(this.cipher_in_caps);
		this.protocol.set_cipher_in(this.cipher_in_caps, this.encryption_key);
	}
	if(this.start_new_session) {
		this._update_capabilities({"start-new-session" : this.start_new_session});
	}
};

XpraClient.prototype._make_hello = function() {
	let selections;
	if (navigator.clipboard && navigator.clipboard.readText && navigator.clipboard.writeText) {
		//we don't need the primary contents,
		//we can use the async clipboard
		selections = ["CLIPBOARD"];
		this.log("using new navigator.clipboard");
	}
	else {
		selections = ["CLIPBOARD", "PRIMARY"];
		this.log("legacy clipboard");
	}
	this.desktop_width = this.container.clientWidth;
	this.desktop_height = this.container.clientHeight;
	this.key_layout = this._get_keyboard_layout();
	if (this.supported_encodings.indexOf("scroll")>0) {
		//support older servers which use a capability for enabling 'scroll' encoding:
		this._update_capabilities({
			"encoding.scrolling"				: true,
			"encoding.scrolling.min-percent" 	: 50,
			"encoding.scrolling.preference" 	: 20,
			});
	}
	this._update_capabilities({
		"auto_refresh_delay"		: 500,
		"randr_notify"				: true,
		"sound.server_driven"		: true,
		"server-window-resize"		: true,
		"window.initiate-moveresize"	: true,
		"screen-resize-bigger"		: false,
		"metadata.supported"		: [
										"fullscreen", "maximized", "iconic", "above", "below",
										//"set-initial-position", "group-leader",
										"title", "size-hints", "class-instance", "transient-for", "window-type", "has-alpha",
										"decorations", "override-redirect", "tray", "modal", "opacity",
										//"shadow", "desktop",
										],
		"encoding"					: this.encoding,
		"encodings"					: this.supported_encodings,
		"encoding.icons.max_size"	: [30, 30],
		"encodings.core"			: this.supported_encodings,
		"encodings.rgb_formats"	 	: this.RGB_FORMATS,
		"encodings.window-icon"		: ["png"],
		"encodings.cursor"			: ["png"],
		"encoding.flush"			: true,
		"encoding.transparency"		: true,
		"encoding.decoder-speed"	: {"video" : 0},
		"encodings.packet"			: true,
		//"encoding.min-speed"		: 80,
		//"encoding.min-quality"	: 50,
		"encoding.color-gamut"		: Utilities.getColorGamut(),
		//"encoding.non-scroll"		: ["rgb32", "png", "jpeg"],
		//video stuff:
		"encoding.video_scaling"	: true,
		"encoding.video_max_size"	: [1024, 768],
		"encoding.eos"				: true,
		"encoding.full_csc_modes"	: {
			"mpeg1"		: ["YUV420P"],
			"h264" 		: ["YUV420P"],
			"mpeg4+mp4"	: ["YUV420P"],
			"h264+mp4"	: ["YUV420P"],
			"vp8+webm"	: ["YUV420P"],
			"webp"		: ["BGRX", "BGRA"],
			"jpeg"		: ["BGRX", "BGRA", "BGR", "RGBX", "RGBA", "RGB", "YUV420P", "YUV422P", "YUV444P"],
		},
		//this is a workaround for server versions between 2.5.0 to 2.5.2 only:
		"encoding.x264.YUV420P.profile"		: "baseline",
		"encoding.h264.YUV420P.profile"		: "baseline",
		"encoding.h264.YUV420P.level"		: "2.1",
		"encoding.h264.cabac"				: false,
		"encoding.h264.deblocking-filter"	: false,
		"encoding.h264.fast-decode"			: true,
		"encoding.h264+mp4.YUV420P.profile"	: "baseline",
		"encoding.h264+mp4.YUV420P.level"	: "3.0",
		//prefer native video in mp4/webm container to broadway plain h264:
		"encoding.h264.score-delta"			: -20,
		"encoding.h264+mp4.score-delta"		: 50,
		"encoding.h264+mp4."		: 50,
		//"encoding.h264+mp4.fast-decode"		: true,
		"encoding.mpeg4+mp4.score-delta"	: 40,
		//"encoding.mpeg4+mp4.fast-decode"	: true,
		"encoding.vp8+webm.score-delta"		: 40,

		"sound.receive"				: true,
		"sound.send"				: false,
		"sound.decoders"			: Object.keys(this.audio_codecs),
		"sound.bundle-metadata"		: true,
		// encoding stuff
		"encoding.rgb_zlib"			: true,
		"windows"					: true,
		"window.pre-map"			: true,
		//partial support:
		"keyboard"					: true,
		"xkbmap_layout"				: this.key_layout,
		"xkbmap_keycodes"			: this._get_keycodes(),
		"xkbmap_print"				: "",
		"xkbmap_query"				: "",
		"desktop_size"				: [this.desktop_width, this.desktop_height],
		"desktop_mode_size"			: [this.desktop_width, this.desktop_height],
		"screen_sizes"				: this._get_screen_sizes(),
		"dpi"						: this._get_DPI(),
		//not handled yet, but we will:
		"clipboard"					: this.clipboard_enabled,
		"clipboard.want_targets"	: true,
		"clipboard.greedy"			: true,
		"clipboard.selections"		: selections,
		"notifications"				: true,
		"notifications.close"		: true,
		"notifications.actions"		: true,
		"cursors"					: true,
		"bell"						: true,
		"system_tray"				: true,
		//we cannot handle this (GTK only):
		"named_cursors"				: false,
		// printing
		"file-transfer" 			: this.file_transfer,
		"printing" 					: this.printing,
		"file-size-limit"			: 10,
		"flush"						: true,
	});
};


XpraClient.prototype.on_first_ui_event = function() {
	//this hook can be overriden
};

XpraClient.prototype._new_ui_event = function() {
	if (this.ui_events==0) {
		this.on_first_ui_event();
	}
	this.ui_events++;
};

/**
 * Mouse handlers
 */
XpraClient.prototype.getMouse = function(e) {
	// get mouse position take into account scroll
	let mx = e.clientX + jQuery(document).scrollLeft();
	let my = e.clientY + jQuery(document).scrollTop();

	if (this.scale!==1) {
		mx = Math.round(mx * this.scale);
		my = Math.round(my * this.scale);
	}

	// check last mouse position incase the event
	// hasn't provided it - bug #854
	if(isNaN(mx) || isNaN(my)) {
		if(!isNaN(this.last_mouse_x) && !isNaN(this.last_mouse_y)) {
			mx = this.last_mouse_x;
			my = this.last_mouse_y;
		} else {
			// should we avoid sending NaN to the server?
			mx = 0;
			my = 0;
		}
	} else {
		this.last_mouse_x = mx;
		this.last_mouse_y = my;
	}

	let mbutton = 0;
	if ("which" in e)  // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
		mbutton = Math.max(0, e.which);
	else if ("button" in e)  // IE, Opera (zero based)
		mbutton = Math.max(0, e.button)+1;

	// We return a simple javascript object (a hash) with x and y defined
	return {x: mx, y: my, button: mbutton};
};

XpraClient.prototype.on_mousemove = function(e) {
	this.do_window_mouse_move(e, null);
};

XpraClient.prototype.on_mousedown = function(e) {
	this.do_window_mouse_click(e, null, true);
};

XpraClient.prototype.on_mouseup = function(e) {
	this.do_window_mouse_click(e, null, false);
};

XpraClient.prototype.on_mousescroll = function(e) {
	this.do_window_mouse_scroll(e, null);
};


XpraClient.prototype._window_mouse_move = function(ctx, e, window) {
	ctx.do_window_mouse_move(e, window);
};
XpraClient.prototype.do_window_mouse_move = function(e, window) {
	if (this.server_readonly || this.mouse_grabbed || !this.connected) {
		return;
	}
	const mouse = this.getMouse(e),
		x = Math.round(mouse.x),
		y = Math.round(mouse.y);
	const modifiers = this._keyb_get_modifiers(e);
	const buttons = [];
	let wid = 0;
	if (window) {
		wid = window.wid;
	}
	this.send(["pointer-position", wid, [x, y], modifiers, buttons]);
};

XpraClient.prototype._window_mouse_down = function(ctx, e, window) {
	ctx.mousedown_event = e;
	ctx.do_window_mouse_click(e, window, true);
};

XpraClient.prototype._window_mouse_up = function(ctx, e, window) {
	//this.mousedown_event = null;
	ctx.do_window_mouse_click(e, window, false);
};

XpraClient.prototype.release_buttons = function(e, window) {
	const mouse = this.getMouse(e),
		x = Math.round(mouse.x),
		y = Math.round(mouse.y),
		modifiers = this._keyb_get_modifiers(e),
		wid = window.wid,
		pressed = false;
	for (let button of this.buttons_pressed) {
		me.send_button_action(wid, button, pressed, x, y, modifiers);
	}
}

XpraClient.prototype.do_window_mouse_click = function(e, window, pressed) {
	if (this.server_readonly || this.mouse_grabbed || !this.connected) {
		return;
	}
	// Skip processing if clicked on float menu
	if ($(e.target).attr("id") === "float_menu" || $(e.target).parents("#float_menu").length > 0) {
		this.debug("clicked on float_menu, skipping event handler", e);
		return;
	}
	let send_delay = 0;
	if (client.clipboard_direction !== "to-server" && this._poll_clipboard(e)) {
		send_delay = CLIPBOARD_EVENT_DELAY;
	}
	const mouse = this.getMouse(e, window),
		x = Math.round(mouse.x),
		y = Math.round(mouse.y);
	const modifiers = this._keyb_get_modifiers(e);
	let wid = 0;
	if (window) {
		wid = window.wid;
	}
	// dont call set focus unless the focus has actually changed
	if (wid>0 && this.focus != wid) {
		this._window_set_focus(window);
	}
	let button = mouse.button;
	let lbe = this.last_button_event;
	if (lbe[0]==button && lbe[1]==pressed && lbe[2]==x && lbe[3]==y) {
		//duplicate!
		this.debug("mouse", "skipping duplicate click event");
		return;
	}
	this.last_button_event = [button, pressed, x, y];
	this.debug("mouse", "click:", button, pressed, x, y);
	if (button==4) {
		button = 8;
	}
	else if (button==5) {
		button = 9;
	}
	const me = this;
	setTimeout(function() {
		me.clipboard_delayed_event_time = performance.now()+CLIPBOARD_EVENT_DELAY;
		me.send_button_action(wid, button, pressed, x, y, modifiers);
	}, send_delay);
}

XpraClient.prototype.send_button_action = function(wid, button, pressed, x, y, modifiers) {
	const buttons = [];
	if (pressed) {
		this.buttons_pressed.add(button);
	}
	else {
		this.buttons_pressed.delete(button);
	}
	this.send(["button-action", wid, button, pressed, [x, y], modifiers, buttons]);
};

// Source: https://deepmikoto.com/coding/1--javascript-detect-mouse-wheel-direction
XpraClient.prototype.detect_vertical_scroll_direction = function(e, window) {
	if ( !e ) {
		//IE? In any case, detection won't work:
		return 0;
	}
	let delta = null;
	if ( e.wheelDelta ) { // will work in most cases
		delta = e.wheelDelta;
	} else if ( e.detail ) { // fallback for Firefox
		delta = -e.detail;
	}
	if (delta == null) {
		return 0;
	}
	if (delta>0) {
		return -1;
	}
	if (delta<0) {
		return 1;
	}
	return 0;
};

XpraClient.prototype._window_mouse_scroll = function(ctx, e, window) {
	ctx.do_window_mouse_scroll(e, window);
};

XpraClient.prototype.do_window_mouse_scroll = function(e, window) {
	if (this.server_readonly || this.mouse_grabbed || !this.connected) {
		return;
	}
	const mouse = this.getMouse(e),
		x = Math.round(mouse.x),
		y = Math.round(mouse.y);
	const modifiers = this._keyb_get_modifiers(e);
	const buttons = [];
	let wid = 0;
	if (window) {
		wid = window.wid;
	}
	const wheel = Utilities.normalizeWheel(e);
	this.debug("mouse", "normalized wheel event:", wheel);
	//clamp to prevent event floods:
	let px = Math.min(1200, wheel.pixelX);
	let py = Math.min(1200, wheel.pixelY);
	if (this.scroll_reverse_x) {
		px = -px;
	}
	if (this.scroll_reverse_y==true || (this.scroll_reverse_x=="auto" && this.detect_vertical_scroll_direction(e, window) < 0 && py > 0)) {
		py = -py;
	}
	const apx = Math.abs(px);
	const apy = Math.abs(py);
	if (this.server_precise_wheel) {
		if (apx>0) {
			const btn_x = (px>=0) ? 6 : 7;
			const xdist = Math.round(px*1000/120);
			this.send(["wheel-motion", wid, btn_x, -xdist,
				[x, y], modifiers, buttons]);
		}
		if (apy>0) {
			const btn_y = (py>=0) ? 5 : 4;
			const ydist = Math.round(py*1000/120);
			this.send(["wheel-motion", wid, btn_y, -ydist,
				[x, y], modifiers, buttons]);
		}
		return;
	}
	//generate a single event if we can, or add to accumulators:
	if (apx>=40 && apx<=160) {
		this.wheel_delta_x = (px>0) ? 120 : -120;
	}
	else {
		this.wheel_delta_x += px;
	}
	if (apy>=40 && apy<=160) {
		this.wheel_delta_y = (py>0) ? 120 : -120;
	}
	else {
		this.wheel_delta_y += py;
	}
	//send synthetic click+release as many times as needed:
	let wx = Math.abs(this.wheel_delta_x);
	let wy = Math.abs(this.wheel_delta_y);
	const btn_x = (this.wheel_delta_x>=0) ? 6 : 7;
	const btn_y = (this.wheel_delta_y>=0) ? 5 : 4;
	while (wx>=120) {
		wx -= 120;
		this.send(["button-action", wid, btn_x, true, [x, y], modifiers, buttons]);
		this.send(["button-action", wid, btn_x, false, [x, y], modifiers, buttons]);
	}
	while (wy>=120) {
		wy -= 120;
		this.send(["button-action", wid, btn_y, true, [x, y], modifiers, buttons]);
		this.send(["button-action", wid, btn_y, false, [x, y], modifiers, buttons]);
	}
	//store left overs:
	this.wheel_delta_x = (this.wheel_delta_x>=0) ? wx : -wx;
	this.wheel_delta_y = (this.wheel_delta_y>=0) ? wy : -wy;
};

XpraClient.prototype.init_clipboard = function() {
	const me = this;
	window.addEventListener("paste", function (e) {
		let clipboardData = (e.originalEvent || e).clipboardData;
		//IE: must use window.clipboardData because the event clipboardData is null!
		if (!clipboardData) {
			clipboardData = window.clipboardData;
		}
		if (clipboardData && clipboardData.files && clipboardData.files.length > 0) {
			const files = clipboardData.files;
			me.clog("paste got", files.length, "files");
			for (let i = 0; i < files.length; i++) {
				let file = files.item(i);
					//lastModified: 1634740745068
					//lastModifiedDate: Wed Oct 20 2021 21:39:05 GMT+0700 (Indochina Time) {}
					//name: "addresses.png"
					//size: 17698
					//type: "image/png"
					//webkitRelativePath: ""
				me.send_file(file);
			}
			e.preventDefault();
			return;
		}
		let paste_data;
		if (navigator.clipboard && navigator.clipboard.readText) {
			navigator.clipboard.readText().then(function(text) {
				me.cdebug("clipboard", "paste event, text=", text);
				const paste_data = unescape(encodeURIComponent(text));
				me.clipboard_buffer = paste_data;
				me.send_clipboard_token(paste_data);
			}, function(err) {
				me.cdebug("clipboard", "paste event failed:", err);
			});
		}
		else {
			let datatype = "text/plain";
			if (Utilities.isIE()) {
				datatype = "Text";
			}
			paste_data = unescape(encodeURIComponent(clipboardData.getData(datatype)));
			cdebug("clipboard", "paste event, data=", paste_data);
			me.clipboard_buffer = paste_data;
			me.send_clipboard_token(paste_data);
		}
	});
	window.addEventListener("copy", function (e) {
		const clipboard_buffer = me.get_clipboard_buffer();
		const pasteboard = $("#pasteboard");
		pasteboard.text(decodeURIComponent(escape(clipboard_buffer)));
		pasteboard.select();
		me.cdebug("clipboard", "copy event, clipboard buffer=", clipboard_buffer);
		me.clipboard_pending = false;
	});
	window.addEventListener("cut", function (e) {
		const clipboard_buffer = me.get_clipboard_buffer();
		const pasteboard = $("#pasteboard");
		pasteboard.text(decodeURIComponent(escape(clipboard_buffer)));
		pasteboard.select();
		me.cdebug("clipboard", "cut event, clipboard buffer=", clipboard_buffer);
		me.clipboard_pending = false;
	});
	$('#screen').on('click', function (e) {
		me.may_set_clipboard();
	});
	$("#screen").keypress(function() {
		me.may_set_clipboard();
	});
}

XpraClient.prototype.may_set_clipboard = function(e) {
	this.cdebug("clipboard", "pending=", this.clipboard_pending, "buffer=", truncate(this.clipboard_buffer));
	if (!this.clipboard_pending) {
		return;
	}
	let clipboard_buffer = this.get_clipboard_buffer();
	const clipboard_datatype = (this.get_clipboard_datatype() || "").toLowerCase();
	const is_text = clipboard_datatype.indexOf("text")>=0 || clipboard_datatype.indexOf("string")>=0;
	if (!is_text) {
		//maybe just abort here instead?
		clipboard_buffer = "";
	}
	const pasteboard = $("#pasteboard");
	pasteboard.text(clipboard_buffer);
	pasteboard.select();
	this.cdebug("clipboard", "click event, with pending clipboard datatype=", clipboard_datatype, ", buffer=", clipboard_buffer);
	//for IE:
	let success = false;
	if (window.hasOwnProperty("clipboardData") && window.clipboardData.hasOwnProperty("setData") && typeof window.clipboardData.setData === "function") {
		try {
			if (Utilities.isIE()) {
				window.clipboardData.setData("Text", clipboard_buffer);
			}
			else {
				window.clipboardData.setData(clipboard_datatype, clipboard_buffer);
			}
			success = true;
		}
		catch (e) {
			success = false;
		}
	}
	if (!success && is_text) {
		success = document.execCommand('copy');
	}
	else {
		//probably no point in trying again?
	}
	if (success) {
		//clipboard_buffer may have been cleared if not set to text:
		this.clipboard_buffer = clipboard_buffer;
		this.clipboard_pending = false;
	}
}


XpraClient.prototype._poll_clipboard = function(e) {
	if (this.clipboard_enabled === false) {
		return;
	}
	//see if the clipboard contents have changed:
	if (this.clipboard_pending) {
		//we're still waiting to set the clipboard..
		return false;
	}
	if (navigator.clipboard && navigator.clipboard.readText) {
		this.debug("clipboard", "polling using", navigator.clipboard.readText);
		this.read_clipboard_text();
		return false;
	}
	//fallback code for legacy mode:
	let datatype = "text/plain";
	let clipboardData = (e.originalEvent || e).clipboardData;
	//IE: must use window.clipboardData because the event clipboardData is null!
	if (!clipboardData) {
		clipboardData = window.clipboardData;
		if (!clipboardData) {
			this.debug("clipboard", "polling: no data available");
			return false;
		}
	}
	if (Utilities.isIE()) {
		datatype = "Text";
	}
	const raw_clipboard_buffer = clipboardData.getData(datatype);
	if (raw_clipboard_buffer===null) {
		return false;
	}
	const clipboard_buffer = unescape(encodeURIComponent(raw_clipboard_buffer));
	this.debug("clipboard", "paste event, data=", clipboard_buffer);
	if (clipboard_buffer==this.clipboard_buffer) {
		return false;
	}
	this.debug("clipboard", "clipboard contents have changed");
	this.clipboard_buffer = clipboard_buffer;
	this.send_clipboard_token(clipboard_buffer);
	this.clipboard_delayed_event_time = performance.now()+CLIPBOARD_EVENT_DELAY;
	return true;
};

XpraClient.prototype.read_clipboard_text = function() {
	if (this.clipboard_enabled === false) {
		return;
	}
	const client = this;
	client.debug("clipboard", "read_clipboard_text()");
	//warning: this can take a while,
	//so we may send the click before the clipboard contents...
	navigator.clipboard.readText().then(function(text) {
		client.debug("clipboard", "paste event, text=", text);
		const clipboard_buffer = unescape(encodeURIComponent(text));
		if (clipboard_buffer!=client.clipboard_buffer) {
			client.debug("clipboard", "clipboard contents have changed");
			client.clipboard_buffer = clipboard_buffer;
			client.send_clipboard_token(clipboard_buffer);
			client.clipboard_delayed_event_time = performance.now()+CLIPBOARD_EVENT_DELAY;
		}
		client.clipboard_pending = false;
	}, function(err) {
		client.debug("clipboard", "paste event failed:", err);
		client.clipboard_pending = false;
	});
}


/**
 * Focus
 */
XpraClient.prototype._window_set_focus = function(win) {
	const client = win.client;
	if (win==null || client.server_readonly || !client.connected) {
		return;
	}
	// don't send focus packet for override_redirect windows!
	if (win.override_redirect || win.tray) {
		return;
	}
	if (win.minimized) {
		//tell server to map it:
		win.toggle_minimized();
	}
	const wid = win.wid;
	if (client.focus == wid) {
		return;
	}

	// Keep DESKTOP-type windows per default setttings lower than all other windows.
	// Only allow focus if all other windows are minimized.
	if (default_settings !== undefined && default_settings.auto_fullscreen_desktop_class !== undefined && default_settings.auto_fullscreen_desktop_class.length > 0) {
		var auto_fullscreen_desktop_class = default_settings.auto_fullscreen_desktop_class;
		if (win.windowtype == "DESKTOP" && win.metadata['class-instance'].includes(auto_fullscreen_desktop_class)) {
			var any_visible = false;
			for (let i in client.id_to_window) {
				const iwin = client.id_to_window[i];
				if (iwin.wid == win.wid) continue;
				any_visible ||= !iwin.minimized;
			}
			if (any_visible) {
				return;
			}
		}
	}

	const top_stacking_layer = Object.keys(client.id_to_window).length;
	const old_stacking_layer = win.stacking_layer;
	const had_focus = client.focus;
	client.focus = wid;
	client.topwindow = wid;
	client.send(["focus", wid, []]);
	//set the focused flag on the window specified,
	//adjust stacking order:
	let iwin = null;
	for (const i in client.id_to_window) {
		iwin = client.id_to_window[i];
		iwin.focused = (iwin.wid==wid);
		if (iwin.focused) {
			iwin.stacking_layer = top_stacking_layer;
			client.send_configure_window(iwin, {"focused" : true}, true);
		}
		else {
			//move it down to fill the gap:
			if (iwin.stacking_layer>old_stacking_layer) {
				iwin.stacking_layer--;
			}
			if (had_focus==i) {
				client.send_configure_window(iwin, {"focused" : false}, true);
			}
		}
		iwin.updateFocus();
		iwin.update_zindex();
	}
	//client._set_favicon(wid);
};

/*
 * detect DESKTOP-type window from settings
 */
XpraClient.prototype.is_window_desktop = function(win) {
	if (default_settings !== undefined && default_settings.auto_fullscreen_desktop_class !== undefined && default_settings.auto_fullscreen_desktop_class.length > 0) {
		var auto_fullscreen_desktop_class = default_settings.auto_fullscreen_desktop_class;
		if (win.windowtype == "DESKTOP" && win.metadata['class-instance'].includes(auto_fullscreen_desktop_class)) {
			return true;
		}
	}
	return false;
}

/*
 * Show/Hide the window preview list
 */
XpraClient.prototype.toggle_window_preview = function(init_cb) {
	const preview_element = $('#window_preview');

	preview_element.on('init', (e, slick) => {
		if (init_cb) {
			init_cb(e, slick);
		}
	});

	preview_element.on("afterChange", function(event, slick, currentSlide) {
		const wid = $(".slick-current .window-preview-item-container").data('wid');
		if (!client.id_to_window[wid].minimized) {
			client._window_set_focus(client.id_to_window[wid]);
		}
	});

	$(window).on('click', this._handle_window_list_blur);
	$(window).on('contextmenu', this._handle_window_list_blur);

	if (preview_element.is(":visible")) {
		// Restore the current selection if it's minimized.
		const wid = $(".slick-current .window-preview-item-container").data('wid');
		client.clog("current wid: " + wid);
		if (client.id_to_window[wid].minimized) {
			client._window_set_focus(client.id_to_window[wid]);
		}

		// Clear the list of window elements.
		preview_element.children().remove();

		preview_element.slick('unslick');
		preview_element.children().remove();
		preview_element.hide();
		preview_element.off("afterChange");
		preview_element.off("init");
		$(window).off('click', this._handle_window_list_blur);
		$(window).off('contextmenu', this._handle_window_list_blur);
		return;
	}

	// Clear the list of window elements.
	preview_element.children().remove();

	// Sort windows by stacking order.;
	var windows_sorted = Object.values(client.id_to_window).filter( (win) => {
		// skip DESKTOP type windows.
		if (client.is_window_desktop(win)) {
			return false;
		}
		return true;
	});

	if (windows_sorted.length === 0) {
		return;
	}

	var container_width = 200 * Math.min(4, windows_sorted.length);
	preview_element.css('width', container_width + "px");

	windows_sorted.sort((a, b) => {
		if (a.stacking_layer < b.stacking_layer) {
			return 1;
		}
		if (a.stacking_layer > b.stacking_layer) {
			return -1;
		}
		return 0;
	});

	// Add all open windows to the list.
	for (let i in windows_sorted) {
		var win = windows_sorted[i];
		var item_container = $("<div>");
		item_container.data("wid", win.wid);
		item_container.addClass("window-preview-item-container");

		// Text
		var item_text_el = $("<div>");
		item_text_el.addClass("window-preview-item-text");
		item_text_el.text(win.title);

		// Window image
		var png_base64 = win.canvas.toDataURL("image/png");
		var img_el = $('<img>');
		img_el.addClass("window-preview-item-img");
		img_el.attr("src", png_base64);

		item_container.append(item_text_el);
		item_container.append(img_el);

		preview_element.append(item_container);
	}

	preview_element.show();

	preview_element.slick({
		centerMode: true,
		focusOnSelect: true,
		focusOnChange: true,
		touchMove: false,
		centerPadding: '0px',
		slidesToShow: Math.max(1, Math.min(4, windows_sorted.length)),
		slidesToScroll: 1,
		infinite: true,
		adaptiveHeight: false,
		speed: 0,
		prevArrow: null,
		nextArrow: null,
		easing: 'null',
		waitForAnimate: false,
	});
}

/*
 * Handle closing of window list if clickout outside of area.
 */
XpraClient.prototype._handle_window_list_blur = function(e) {
	if ($('#window_preview').is(":visible")) {
		if (e.target.id === "window_preview") {
			return;
		}
		if ($(e.target).parents("#window_preview").length > 0) {
			return;
		}
		if ($(e.target).hasClass("window-list-button")) {
			return;
		}
		if ($(e.target).parents("#float_menu").length > 0 && $(e.target).parent().has("#open_windows_list")) {
			return;
		}
		// Clicked outside window list, close it.
		client.toggle_window_preview();
	}
}

/*
 * packet processing functions start here
 */

XpraClient.prototype.on_open = function() {
	//this hook can be overriden
};

XpraClient.prototype._process_open = function(packet, ctx) {
	// call the send_hello function
	ctx.on_connection_progress("WebSocket connection established", "", 80);
	// wait timeout seconds for a hello, then bomb
	ctx.schedule_hello_timer();
	ctx._send_hello();
	ctx.on_open();
};

XpraClient.prototype.schedule_hello_timer = function() {
	this.cancel_hello_timer();
	const me = this;
	this.hello_timer = setTimeout(function () {
		me.disconnect("Did not receive hello before timeout reached, not an Xpra server?");
	}, this.HELLO_TIMEOUT);
}
XpraClient.prototype.cancel_hello_timer = function() {
	if (this.hello_timer) {
		clearTimeout(this.hello_timer);
		this.hello_timer = null;
	}
}


XpraClient.prototype._process_error = function(packet, ctx) {
	const code = parseInt(packet[2]);
	let reconnect = ctx.reconnect || ctx.reconnect_attempt<ctx.reconnect_count;
	if (reconnect && code>=0) {
		if ([0, 1006, 1008, 1010, 1014, 1015].indexOf(code)>=0) {
			// don't re-connect unless we had actually managed to connect
			// (because these specific websocket error codes are likely permanent)
			reconnect = ctx.connected;
		}
	}
	ctx.cerror("websocket error: ", packet[1], "code: ", code, "reason: ", ctx.disconnect_reason,
				", connected: ", ctx.connected, ", reconnect: ", reconnect);
	if (ctx.reconnect_in_progress) {
		return;
	}
	ctx.packet_disconnect_reason(packet);
	ctx.close_audio();
	if (!reconnect) {
		// call the client's close callback
		ctx.callback_close(ctx.disconnect_reason);
	}
};


XpraClient.prototype.packet_disconnect_reason = function(packet) {
	if (!this.disconnect_reason && packet[1]) {
		const code = packet[2];
		if (!this.connected && [0, 1006, 1008, 1010, 1014, 1015].indexOf(code)>=0) {
			this.disconnect_reason = "connection failed, invalid address?";
		}
		else {
			this.disconnect_reason = packet[1];
			let i = 2;
			while (packet.length>i && packet[i]) {
				this.disconnect_reason += "\n"+packet[i];
				i++;
			}
		}
	}
}


XpraClient.prototype.do_reconnect = function() {
	//try again:
	this.reconnect_in_progress = true;
	const me = this;
	const protocol = this.protocol;
	setTimeout(function(){
		try {
			me.remove_windows();
			me.close_audio();
			me.clear_timers();
			me.init_state();
			if (protocol) {
				me.protocol = null;
				protocol.terminate();
			}
			me.emit_connection_lost();
			me.connect();
		}
		finally {
			me.reconnect_in_progress = false;
		}
	}, this.reconnect_delay);
};

XpraClient.prototype._process_close = function(packet, ctx) {
	ctx.clog("websocket closed: ", packet[1], "reason: ", ctx.disconnect_reason, ", reconnect: ", ctx.reconnect, ", reconnect attempt: ", ctx.reconnect_attempt);
	if (ctx.reconnect_in_progress) {
		return;
	}
	ctx.packet_disconnect_reason(packet);
	if (ctx.reconnect && ctx.reconnect_attempt<ctx.reconnect_count) {
		ctx.emit_connection_lost();
		ctx.close_protocol();
		ctx.reconnect_attempt++;
		ctx.do_reconnect();
	}
	else {
		ctx.close();
	}
};

XpraClient.prototype.disconnect = function(reason) {
	this.disconnect_reason = reason || "unknown";
	this.close();
}

XpraClient.prototype.close = function() {
	if (this.reconnect_in_progress) {
		return;
	}
        this.cancel_hello_timer();
	this.emit_connection_lost();
	this.remove_windows();
	this.close_audio();
	this.clear_timers();
	this.close_protocol();
	// call the client's close callback
	this.callback_close(this.disconnect_reason);
};

XpraClient.prototype._process_disconnect = function(packet, ctx) {
	ctx.debug("main", "disconnect reason:", packet[1]);
	if (ctx.reconnect_in_progress) {
		return;
	}
	// save the disconnect reason
	ctx.packet_disconnect_reason(packet);
	ctx.close();
	// call the client's close callback
	ctx.callback_close(ctx.disconnect_reason);
};

XpraClient.prototype._process_startup_complete = function(packet, ctx) {
	ctx.log("startup complete");
	ctx.emit_connection_established();
};

XpraClient.prototype._connection_change = function(e) {
	const ci = Utilities.getConnectionInfo();
	this.clog("connection status - change event=", e, ", connection info=", ci, "tell server:", this.server_connection_data);
	if (ci && this.server_connection_data) {
		this.send(["connection-data", ci]);
	}
};


XpraClient.prototype._process_hello = function(packet, ctx) {
	//show("process_hello("+packet+")");
	ctx.cancel_hello_timer();
	const hello = packet[1];
	ctx.clog("received hello capabilities", hello);
	ctx.server_display = hello["display"] || "";
	ctx.server_platform = hello["platform"] || "";
	ctx.server_remote_logging = hello["remote-logging.multi-line"];
	if(ctx.server_remote_logging && ctx.remote_logging) {
		//hook remote logging:
		Utilities.log = function() { ctx.log.apply(ctx, arguments); };
		Utilities.warn = function() { ctx.warn.apply(ctx, arguments); };
		Utilities.error = function() { ctx.error.apply(ctx, arguments); };
		Utilities.exc = function() { ctx.exc.apply(ctx, arguments); };
	}
	// check for server encryption caps update
	if(ctx.encryption) {
		ctx.cipher_out_caps = {};
		const CIPHER_CAPS = [
			"", ".mode", ".iv",
			".key_salt", ".key_size", ".key_hash", ".key_stretch_iterations",
			".padding", ".padding.options",
			];
		for (let i=0; i<CIPHER_CAPS.length; ++i) {
			const cipher_key = "cipher"+CIPHER_CAPS[i];
			let value = hello[cipher_key];
			if ((typeof value) === 'object' && value.constructor===Uint8Array) {
				value = String.fromCharCode.apply(null, value);
			}
			ctx.cipher_out_caps[cipher_key] = value;
		}
		ctx.protocol.set_cipher_out(ctx.cipher_out_caps, ctx.encryption_key);
	}
	let PACKET_ENCODERS = ["bencode"];
	if (rencode_ok) {
		PACKET_ENCODERS = ["rencodeplus", "bencode"];
	}
	for (const i in PACKET_ENCODERS) {
		const packet_encoder = PACKET_ENCODERS[i];
		if (hello[packet_encoder]) {
			ctx.packet_encoder = packet_encoder;
			ctx.protocol.enable_packet_encoder(packet_encoder);
			Utilities.clog("packet encoder:", packet_encoder);
			break;
		}
	}
	//don't use offscreen or decode worker with 'rencodeplus':
	if (ctx.decode_worker && ctx.packet_encoder!="rencodeplus") {
		Utilities.clog("turning off decode worker for "+ctx.packet_encoder+" packet encoder");
		ctx.decode_worker = null;
		ctx.offscreen_api = false;
	}

	// find the modifier to use for Num_Lock
	const modifier_keycodes = hello['modifier_keycodes'];
	if (modifier_keycodes) {
		for (const modifier in modifier_keycodes) {
			if (modifier_keycodes.hasOwnProperty(modifier)) {
				const mappings = modifier_keycodes[modifier];
				for (const keycode in mappings) {
					const keys = mappings[keycode];
					for (const index in keys) {
						const key=keys[index];
						if (key=="Num_Lock") {
							ctx.num_lock_modifier = modifier;
						}
					}
				}
			}
		}
	}

	const version = Utilities.s(hello["version"]);
	try {
		const vparts = version.split(".");
		const vno = [];
		for (let i=0; i<vparts.length;i++) {
			vno[i] = parseInt(vparts[i]);
		}
		if (vno[0]<=0 && vno[1]<10) {
			ctx.disconnect("unsupported version: " + version);
			return;
		}
	}
	catch (e) {
		ctx.disconnect("error parsing version number '" + version + "'");
		return;
	}
	ctx.log("got hello: server version", version, "accepted our connection");
	//figure out "alt" and "meta" keys:
	if ("modifier_keycodes" in hello) {
		const modifier_keycodes = hello["modifier_keycodes"];
		for (const mod in modifier_keycodes) {
			//show("modifier_keycode["+mod+"]="+modifier_keycodes[mod].toSource());
			const keys = modifier_keycodes[mod];
			for (let i=0; i<keys.length; i++) {
				const key = keys[i];
				//the first value is usually the integer keycode,
				//the second one is the actual key name,
				//doesn't hurt to test both:
				for (let j=0; j<key.length; j++) {
					if ("Alt_L"==key[j])
						ctx.alt_modifier = mod;
					else if ("Meta_L"==key[j])
						ctx.meta_modifier = mod;
					else if ("ISO_Level3_Shift"==key[j] || "Mode_switch"==key[j])
						ctx.altgr_modifier = mod;
					else if ("Control_L"==key[j])
						ctx.control_modifier = mod;
				}
			}
		}
	}
	//show("alt="+alt_modifier+", meta="+meta_modifier);
	// stuff that must be done after hello
	if(ctx.audio_enabled) {
		if(!(hello["sound.send"])) {
			ctx.error("server does not support speaker forwarding");
			ctx.audio_enabled = false;
		}
		else {
			ctx.server_audio_codecs = hello["sound.encoders"];
			if(!ctx.server_audio_codecs) {
				ctx.error("audio codecs missing on the server");
				ctx.audio_enabled = false;
			}
			else {
				ctx.log("audio codecs supported by the server:", ctx.server_audio_codecs);
				if(!ctx.server_audio_codecs.includes(ctx.audio_codec)) {
					ctx.warn("audio codec "+ctx.audio_codec+" is not supported by the server");
					ctx.audio_codec = null;
					//find the best one we can use:
					for (let i = 0; i < MediaSourceConstants.PREFERRED_CODEC_ORDER.length; i++) {
						const codec = MediaSourceConstants.PREFERRED_CODEC_ORDER[i];
						if ((codec in ctx.audio_codecs) && (ctx.server_audio_codecs.indexOf(codec)>=0)){
							if (ctx.mediasource_codecs[codec]) {
								ctx.audio_framework = "mediasource";
							}
							else {
								ctx.audio_framework = "aurora";
							}
							ctx.audio_codec = codec;
							ctx.log("using", ctx.audio_framework, "audio codec", codec);
							break;
						}
					}
					if(!ctx.audio_codec) {
						ctx.warn("audio codec: no matches found");
						ctx.audio_enabled = false;
					}
				}
			}
			//with Firefox, we have to wait for a user event..
			if (ctx.audio_enabled && !Utilities.isFirefox()) {
				ctx._sound_start_receiving();
			}
		}
	}
	if (SHOW_START_MENU) {
		ctx.xdg_menu = hello["xdg-menu"];
		if (ctx.xdg_menu) {
			ctx.process_xdg_menu();
		}
	}

	ctx.server_is_desktop = Boolean(hello["desktop"]);
	ctx.server_is_shadow = Boolean(hello["shadow"]);
	ctx.server_readonly = Boolean(hello["readonly"]);
	if (ctx.server_is_desktop || ctx.server_is_shadow) {
		jQuery("body").addClass("desktop");
	}
	ctx.server_resize_exact = hello["resize_exact"] || false;
	ctx.server_screen_sizes = hello["screen-sizes"] || [];
	ctx.clog("server screen sizes:", ctx.server_screen_sizes);

	ctx.server_precise_wheel = hello["wheel.precise"] || false;

	ctx.remote_open_files = Boolean(hello["open-files"]);
	ctx.remote_file_transfer = Boolean(hello["file-transfer"]);
	if (!ctx.remote_file_transfer) {
		$("#upload_menu_entry").hide();
		$("#download_menu_entry").hide();
	}
	ctx.remote_printing = Boolean(hello["printing"]);
	if (ctx.remote_printing && ctx.printing) {
		// send our printer definition
		const printers = {
			"HTML5 client": {
				"printer-info": "Print to PDF in client browser",
				"printer-make-and-model": "HTML5 client version",
				"mimetypes": ["application/pdf"]
			}
		};
		ctx.send(["printers", printers]);
	}
	ctx.server_connection_data = hello["connection-data"];
	if (navigator.hasOwnProperty("connection")) {
		navigator.connection.onchange = function() {
			ctx._connection_change();
		};
		ctx._connection_change();
	}
	// don't send clipboard packets to servers that don't want them:
	ctx.clipboard_enabled = Boolean(hello["clipboard"] || false);

	// start sending our own pings
	ctx._send_ping();
	ctx.ping_timer = setInterval(function () {
		ctx._send_ping();
		return true;
	}, ctx.PING_FREQUENCY);
	ctx.reconnect_attempt = 0;
	// Drop start_new_session to avoid creating new displays
	// on reconnect
	ctx.start_new_session = null;
	ctx.on_connection_progress("Session started", "", 100);
	ctx.on_connect();
	ctx.connected = true;
};

XpraClient.prototype._process_encodings = function(packet, ctx) {
	const caps = packet[1];
	ctx.log("update encodings:", Object.keys(caps));
};


XpraClient.prototype.process_xdg_menu = function() {
	this.log("received xdg start menu data");
	let key;
	//remove current menu:
	$('#startmenu li').remove();
	const startmenu = document.getElementById("startmenu");
	for(key in this.xdg_menu){
		const category = this.xdg_menu[key];
		const li = document.createElement("li");
		li.className = "-hasSubmenu";

		const catDivLeft = document.createElement("div");
			catDivLeft.className="menu-divleft";
		catDivLeft.appendChild(this.xdg_image(category.IconData, category.IconType));

		const a = document.createElement("a");
		a.appendChild(catDivLeft);
		a.appendChild(document.createTextNode(this.xdg_menu[key].Name));
		a.href = "#";
		li.appendChild(a);

		const ul = document.createElement("ul");

		//TODO need to figure out how to do this properly
		a.onmouseenter= function(){
			this.parentElement.childNodes[1].className="-visible";
		};
		a.onmouseleave= function(){
			this.parentElement.childNodes[1].className="";
		};

		const xdg_menu_cats = category.Entries;
		for(key in xdg_menu_cats){
			const entry = xdg_menu_cats[key];
			const li2 = document.createElement("li");
			const a2 = document.createElement("a");

			let name = entry.Name;
			name = Utilities.trimString(name,15);
			const command = entry.Exec.replace(/%[uUfF]/g, "");

			const divLeft = document.createElement("div");
			divLeft.className = "menu-divleft";
			divLeft.appendChild(this.xdg_image(entry.IconData, entry.IconType));

			const titleDiv = document.createElement("div");
			titleDiv.appendChild(document.createTextNode(name));
			titleDiv.className = "menu-content-left";
			divLeft.appendChild(titleDiv);

			a2.appendChild(divLeft);
			a2.title = command;

			const me = this;
			a2.onclick = function(){
				const ignore = "False";
				me.start_command(this.innerText, this.title, ignore);
				document.getElementById("menu_list").className="-hide";
			};
			a2.onmouseenter= function(){
				this.parentElement.parentElement.className="-visible";
			};
			a2.onmouseleave= function(){
				this.parentElement.parentElement.className="";
			};

			li2.appendChild(a2);
			ul.appendChild(li2);
		}
		li.appendChild(ul);
		startmenu.appendChild(li);
	}
};


XpraClient.prototype._process_setting_change = function(packet, ctx) {
	const setting = packet[1],
		value = packet[2];
	if (setting=="xdg-menu" && SHOW_START_MENU) {
		ctx.xdg_menu = value;
		if (ctx.xdg_menu) {
			ctx.process_xdg_menu();
			$('#startmenuentry').show();
		}
	}
};

XpraClient.prototype.xdg_image = function(icon_data, icon_type) {
	const img = new Image();
	if (typeof icon_data !== 'undefined'){
		if (typeof icon_data === 'string') {
			icon_data = Utilities.StringToUint8(icon_data);
		}
		if (icon_type=="svg") {
			img.src = "data:image/svg+xml;base64," + Utilities.ArrayBufferToBase64(icon_data);
		}
		else if (icon_type=="png" || icon_type=="jpeg") {
			img.src = "data:image/"+icon_type+";base64," + Utilities.ArrayBufferToBase64(icon_data);
		}
	}
	img.className = "menu-content-left";
	img.height = 24;
	img.width = 24;
	return img;
};



XpraClient.prototype.on_connect = function() {
	//this hook can be overriden
};

XpraClient.prototype._process_challenge = function(packet, ctx) {
	ctx.cancel_hello_timer();
	if(ctx.encryption) {
		if(packet.length >=3) {
			ctx.cipher_out_caps = packet[2];
			ctx.protocol.set_cipher_out(ctx.cipher_out_caps, ctx.encryption_key);
		} else {
			ctx.disconnect("challenge does not contain encryption details to use for the response");
			return;
		}
	}
	const digest = Utilities.s(packet[3]);
	const server_salt = Utilities.s(packet[1]);
	const salt_digest = Utilities.s(packet[4]) || "xor";
	const prompt = (Utilities.s(packet[5]) || "password").replace(/[^a-zA-Z0-9\., :\+/]/gi, '');
	ctx.clog("process challenge:", digest);
	function do_process_challenge(password) {
		if (password==null) {
			ctx.disconnect("password prompt cancelled");
			return;
		}
		ctx.do_process_challenge(digest, server_salt, salt_digest, password);
	}
	if (ctx.passwords.length>0) {
		if (!ctx.is_digest_safe(digest)) {
			ctx.disconnect("refusing to send a password over an insecure connection");
			return;
		}
		const password = ctx.passwords.shift();
		do_process_challenge(password);
		return;
	}
	if (digest.startsWith("keycloak") && ctx.keycloak_prompt_fn) {
		ctx.cancel_hello_timer();
		ctx.keycloak_prompt_fn(server_salt, do_process_challenge);
		return;
	}
	if (ctx.password_prompt_fn && ctx.is_digest_safe(digest)) {
		if (!ctx.is_digest_safe(digest)) {
			ctx.disconnect("refusing to prompt for a password over an insecure connection");
			return;
		}
		const address = ""+client.host+":"+client.port;
		ctx.cancel_hello_timer();
		ctx.password_prompt_fn("The server at "+address+" requires a "+prompt, do_process_challenge);
		return;
	}
	ctx.disconnect("No password specified for authentication challenge");
}

XpraClient.prototype.is_digest_safe = function(digest) {
    return digest != "xor" || this.ssl || this.encryption || this.insecure || this.host == "localhost" || this.host == "127.0.0.1" || this.host=="::1";
}

XpraClient.prototype.do_process_challenge = function(digest, server_salt, salt_digest, password) {
	this.cancel_hello_timer();
	let client_salt = null;
	let l = server_salt.length;

	//don't use xor over unencrypted connections unless explicitly allowed:
	if (!this.is_digest_safe(digest)) {
		this.callback_close(`server requested digest xor, cowardly refusing to use it without encryption with ${this.host}`);
		return;
	}

	if (salt_digest=="xor") {
		if (l<16 || l>256) {
			this.disconnect("invalid server salt length for xor digest:"+l);
			return;
		}
	}
	else {
		//other digest, 32 random bytes is enough:
		l = 32;
	}
	client_salt = Utilities.getSecureRandomString(l);
	this.clog("challenge using salt digest", salt_digest);
	const salt = this._gendigest(salt_digest, client_salt, server_salt);
	if (!salt) {
		this.disconnect("server requested an unsupported salt digest " + salt_digest);
		return;
	}
	const challenge_digest = digest.startsWith("keycloak") ? "xor" : digest;
	this.clog("challenge using digest", challenge_digest);
	const challenge_response = this._gendigest(challenge_digest, password, salt);
	if (challenge_response) {
		this.do_send_hello(challenge_response, client_salt);
	}
	else {
		this.disconnect("server requested an unsupported digest " + digest);
	}
};

XpraClient.prototype._gendigest = function(digest, password, salt) {
	if (digest.startsWith("hmac")) {
		let hash = "md5";
		if (digest.indexOf("+")>0) {
			hash = digest.split("+")[1];
		}
		this.clog("hmac using hash", hash);
		const hmac = forge.hmac.create();
		hmac.start(hash, password);
		hmac.update(salt);
		return hmac.digest().toHex();
	} else if (digest == "xor") {
		const trimmed_salt = salt.slice(0, password.length);
		return Utilities.xorString(trimmed_salt, password);
	} else {
		return null;
	}
};


XpraClient.prototype._send_ping = function() {
	if (this.reconnect_in_progress || !this.connected) {
		return;
	}
	const me = this;
	const now_ms = Math.ceil(performance.now());
	this.send(["ping", now_ms]);
	// add timeout to wait for ping timout
	this.ping_timeout_timer = setTimeout(function () {
		me._check_echo_timeout(now_ms);
	}, this.PING_TIMEOUT);
	// add timeout to detect temporary ping miss for spinners
	const wait = 2000;
	this.ping_grace_timer = setTimeout(function () {
		me._check_server_echo(now_ms);
	}, wait);
};

XpraClient.prototype._process_ping = function(packet, ctx) {
	const echotime = packet[1];
	ctx.last_ping_server_time = echotime;
	if (packet.length>2) {
		//prefer system time (packet[1] is monotonic)
		ctx.last_ping_server_time = packet[2];
	}
	let sid = "";
	if (packet.length>=4) {
		sid = packet[3];
	}
	ctx.last_ping_local_time = new Date().getTime();
	const l1 = 0, l2=0, l3=0;
	ctx.send(["ping_echo", echotime, l1, l2, l3, 0, sid]);
};

XpraClient.prototype._process_ping_echo = function(packet, ctx) {
	ctx.last_ping_echoed_time = packet[1];
	const l1 = packet[2],
		l2 = packet[3],
		l3 = packet[4];
	ctx.client_ping_latency = packet[5];
	ctx.server_ping_latency = Math.ceil(performance.now())-ctx.last_ping_echoed_time;
	ctx.server_load = [l1/1000.0, l2/1000.0, l3/1000.0];
	// make sure server goes OK immediately instead of waiting for next timeout
	ctx._check_server_echo(0);
};


/**
 * Info
 */
XpraClient.prototype.start_info_timer = function() {
	if (this.info_timer==null) {
		const me = this;
		this.info_timer = setInterval(function () {
			if (me.info_timer!=null) {
				me.send_info_request();
			}
			return true;
		}, this.INFO_FREQUENCY);
	}
};
XpraClient.prototype.send_info_request = function() {
	if (!this.info_request_pending) {
		this.send(["info-request", [this.uuid], [], []]);
		this.info_request_pending = true;
	}
};
XpraClient.prototype._process_info_response = function(packet, ctx) {
	ctx.info_request_pending = false;
	ctx.server_last_info = packet[1];
	ctx.debug("network", "info-response:", ctx.server_last_info);
	const event = document.createEvent("Event");
	event.initEvent('info-response', true, true);
	event.data = ctx.server_last_info;
	document.dispatchEvent(event);
};
XpraClient.prototype.stop_info_timer = function() {
	if (this.info_timer) {
		clearTimeout(this.info_timer);
		this.info_timer = null;
		this.info_request_pending = false;
	}
};


/**
 * System Tray forwarding
 */

XpraClient.prototype.position_float_menu = function() {
	const float_menu_element = $('#float_menu');
	var toolbar_width = float_menu_element.width();
	var left = float_menu_element.offset().left || 0;
	var top = float_menu_element.offset().top || 0;
	var screen_width = $('#screen').width();
	if (this.toolbar_position=="custom") {
		//no calculations needed
	}
	else if (this.toolbar_position=="top-left") {
		//no calculations needed
	}
	else if (this.toolbar_position=="top") {
		left = screen_width/2-toolbar_width/2;
	}
	else if (this.toolbar_position=="top-right") {
		left = screen_width-toolbar_width-100;
	}
	float_menu_element.offset({ top: top, left: left });
}

XpraClient.prototype._process_new_tray = function(packet, ctx) {
	const wid = packet[1];
	//let w = packet[2];
	//let h = packet[3];
	const metadata = packet[4];
	const mydiv = document.createElement("div");
	mydiv.id = String(wid);
	const mycanvas = document.createElement("canvas");
	mydiv.appendChild(mycanvas);

	const float_tray = document.getElementById("float_tray");
	const float_menu = document.getElementById("float_menu");
	const float_menu_element = $('#float_menu');
	float_menu_element.children().show();
	//increase size for tray icon
	const new_width = float_menu_width + float_menu_item_size - float_menu_padding + 5;
	float_menu.style.width = new_width + "px";
	float_menu_width = float_menu_element.width() + 10;
	mydiv.style.backgroundColor = "white";

	float_tray.appendChild(mydiv);
	const x = 0;
	const y = 0;
	const w = float_menu_item_size;
	const h = float_menu_item_size;

	mycanvas.width = w;
	mycanvas.height = h;
	ctx.id_to_window[wid] = new XpraWindow(ctx, mycanvas, wid, x, y, w, h,
			metadata,
			false,
			true,
			{},
			ctx._tray_geometry_changed,
			ctx._window_mouse_move,
			ctx._window_mouse_down,
			ctx._window_mouse_up,
			ctx._window_mouse_scroll,
			ctx._tray_set_focus,
			ctx._tray_closed,
			ctx.scale
	);
	ctx.send_tray_configure(wid);
};
XpraClient.prototype.send_tray_configure = function(wid) {
	const div = jQuery("#" + String(wid));
	const x = Math.round(div.offset().left);
	const y = Math.round(div.offset().top);
	const w = float_menu_item_size,
		h = float_menu_item_size;
	this.clog("tray", wid, "position:", x, y);
	this.send(["configure-window", Number(wid), x, y, w, h, {}]);
};
XpraClient.prototype._tray_geometry_changed = function(win) {
	win.client.debug("tray", "tray geometry changed (ignored)");
};
XpraClient.prototype._tray_set_focus = function(win) {
	win.client.debug("tray", "tray set focus (ignored)");
};
XpraClient.prototype._tray_closed = function(win) {
	win.client.debug("tray", "tray closed (ignored)");
};

XpraClient.prototype.reconfigure_all_trays = function() {
	const float_menu = document.getElementById("float_menu");
	float_menu_width = (float_menu_item_size*4) + float_menu_padding;
	for (const twid in this.id_to_window) {
		const twin = this.id_to_window[twid];
		if (twin && twin.tray) {
			float_menu_width = float_menu_width + float_menu_item_size;
			this.send_tray_configure(twid);
		}
	}

	// only set if float_menu is visible
	if($('#float_menu').width() > 0){
		float_menu.style.width = float_menu_width;
		this.position_float_menu();
	}
};


XpraClient.prototype.suspend = function() {
	const window_ids = Object.keys(client.id_to_window).map(Number);
	this.send(["suspend", true, window_ids]);
	for (const i in this.id_to_window) {
		let iwin = this.id_to_window[i];
		iwin.suspend();
	}
}

XpraClient.prototype.resume = function() {
	const window_ids = Object.keys(client.id_to_window).map(Number);
	for (const i in this.id_to_window) {
		let iwin = this.id_to_window[i];
		iwin.resume();
	}
	this.send(["resume", true, window_ids]);
	this.redraw_windows();
	this.request_refresh(-1);
}


/**
 * Windows
 */
XpraClient.prototype._new_window = function(wid, x, y, w, h, metadata, override_redirect, client_properties) {
	// each window needs their own DIV that contains a canvas
	const mydiv = document.createElement("div");
	mydiv.id = String(wid);

	const screen = document.getElementById("screen");
	screen.appendChild(mydiv);
	// create the XpraWindow object to own the new div
	const win = new XpraWindow(this, wid, x, y, w, h,
		metadata,
		override_redirect,
		false,
		client_properties,
		this._window_geometry_changed,
		this._window_mouse_move,
		this._window_mouse_down,
		this._window_mouse_up,
		this._window_mouse_scroll,
		this._window_set_focus,
		this._window_closed,
		this.scale
		);
	if(win && win.has_decorations) {
		const trimmedTitle = Utilities.trimString(win.title,30);
		window.addWindowListItem(wid, trimmedTitle);
	}
	this.id_to_window[wid] = win;
	if (!override_redirect) {
		const geom = win.get_internal_geometry();
		this.send(["map-window", wid, geom.x, geom.y, geom.w, geom.h, win.client_properties]);
		this._window_set_focus(win);
	}
};

XpraClient.prototype._new_window_common = function(packet, override_redirect) {
	const wid = packet[1];
	let x = packet[2];
	let y = packet[3];
	let w = packet[4];
	let h = packet[5];
	const metadata = packet[6];
	if (wid in this.id_to_window)
		throw new Error("we already have a window " + wid);
	if (w<=0 || h<=0) {
		this.error("window dimensions are wrong:", w, h);
		w = 1;
		h = 1;
	}
	let client_properties = {};
	if (packet.length>=8)
		client_properties = packet[7];
	if (x==0 && y==0 && !metadata["set-initial-position"]) {
		//find a good position for it
		const l = Object.keys(this.id_to_window).length;
		if (l==0) {
			//first window: center it
			if (w<=this.desktop_width) {
				x = Math.round((this.desktop_width-w)/2);
			}
			if (h<=this.desktop_height) {
				y = Math.round((this.desktop_height-h)/2);
			}
		}
		else {
			x = Math.min(l*10, Math.max(0, this.desktop_width-100));
			y = 96;
		}
	}
	this._new_window(wid, x, y, w, h, metadata, override_redirect, client_properties);
	this._new_ui_event();
};

XpraClient.prototype._window_closed = function(win) {
	win.client.send(["close-window", win.wid]);
};

XpraClient.prototype._window_geometry_changed = function(win) {
	// window callbacks are called from the XpraWindow function context
	// so use win.client instead of `this` to refer to the client
	win.client.send_configure_window(win, {}, false);
};

XpraClient.prototype.send_configure_window = function(win, state, skip_geometry) {
	const geom = win.get_internal_geometry();
	const wid = win.wid;
	let packet = ["configure-window", wid, geom.x, geom.y, geom.w, geom.h, win.client_properties, 0, state, skip_geometry];
	this.send(packet);
};

XpraClient.prototype._process_new_window = function(packet, ctx) {
	ctx._new_window_common(packet, false);
};

XpraClient.prototype._process_new_override_redirect = function(packet, ctx) {
	ctx._new_window_common(packet, true);
};

XpraClient.prototype._process_window_metadata = function(packet, ctx) {
	const wid = packet[1],
		metadata = packet[2],
		win = ctx.id_to_window[wid];
	if (win!=null) {
		win.update_metadata(metadata);
	}
};

XpraClient.prototype._process_initiate_moveresize = function(packet, ctx) {
	const wid = packet[1],
		win = ctx.id_to_window[wid];
	if (win!=null) {
		const x_root = packet[2],
			y_root = packet[3],
			direction = packet[4],
			button = packet[5],
			source_indication = packet[6];
		win.initiate_moveresize(ctx.mousedown_event, x_root, y_root, direction, button, source_indication);
	}
};

XpraClient.prototype._process_pointer_position = function(packet, ctx) {
	const wid = packet[1];
	let x = packet[2],
		y = packet[3];
	const win = ctx.id_to_window[wid];
	if (packet.length>=6) {
		//we can use window relative coordinates:
		if (win) {
			x = win.x + packet[4];
			y = win.y + packet[5];
		}
	}
	const shadow_pointer = document.getElementById("shadow_pointer");
	const style = shadow_pointer.style;
	let cursor_url, w, h, xhot, yhot;
	if (win.png_cursor_data) {
		w = win.png_cursor_data[0];
		h = win.png_cursor_data[1];
		xhot = win.png_cursor_data[2];
		yhot = win.png_cursor_data[3];
		cursor_url = "data:image/png;base64," + window.btoa(win.png_cursor_data[4]);
	}
	else {
		w = 32;
		h = 32;
		xhot = 8;
		yhot = 3;
		cursor_url = "icons/default_cursor.png";
	}
	x -= xhot;
	y -= yhot;
	style.width = w+"px";
	style.height = h+"px";
	shadow_pointer.src = cursor_url;
	style.left = x+"px";
	style.top = y+"px";
	style.display = "inline";
};

XpraClient.prototype.on_last_window = function() {
	//this hook can be overriden
};

XpraClient.prototype._process_lost_window = function(packet, ctx) {
	const wid = packet[1];
	const win = ctx.id_to_window[wid];
	if(win && win.has_decorations) {
		window.removeWindowListItem(wid);
	}
	try {
		delete ctx.id_to_window[wid];
	}
	catch (e) {}
	if (win!=null) {
		win.destroy();
		ctx.clog("lost window, was tray=", win.tray);
		if (win.tray) {
			//other trays may have moved:
			ctx.reconfigure_all_trays();
		}
	}
	ctx.clog("lost window", wid, ", remaining: ", Object.keys(ctx.id_to_window));
	if (Object.keys(ctx.id_to_window).length==0) {
		ctx.on_last_window();
	}
	else if (win && win.focused) {
		//it had focus, find the next highest:
		ctx.auto_focus();
	}
	if (ctx.decode_worker) {
		ctx.decode_worker.postMessage({'cmd': 'remove', 'wid' : wid});
	}
}


XpraClient.prototype.auto_focus = function() {
	let highest_window = null;
	let highest_stacking = -1;
	for (const i in this.id_to_window) {
		let iwin = this.id_to_window[i];
		if (!iwin.minimized && iwin.stacking_layer>highest_stacking && !iwin.tray) {
			highest_window = iwin;
			highest_stacking = iwin.stacking_layer;
		}
	}
	if (highest_window) {
		this._window_set_focus(highest_window);
	}
	else {
		this.focus = 0;
		this.send(["focus", 0, []]);
	}
}


XpraClient.prototype._process_raise_window = function(packet, ctx) {
	const wid = packet[1];
	const win = ctx.id_to_window[wid];
	if (win!=null) {
		ctx._window_set_focus(win);
	}
};

XpraClient.prototype._process_window_resized = function(packet, ctx) {
	const wid = packet[1];
	const width = packet[2];
	const height = packet[3];
	const win = ctx.id_to_window[wid];
	if (win!=null) {
		win.resize(width, height);
	}
};

XpraClient.prototype._process_window_move_resize = function(packet, ctx) {
	const wid = packet[1];
	const x = packet[2];
	const y = packet[3];
	const width = packet[4];
	const height = packet[5];
	const win = ctx.id_to_window[wid];
	if (win!=null) {
		win.move_resize(x, y, width, height);
	}
};

XpraClient.prototype._process_configure_override_redirect = function(packet, ctx) {
	const wid = packet[1];
	const x = packet[2];
	const y = packet[3];
	const width = packet[4];
	const height = packet[5];
	const win = ctx.id_to_window[wid];
	if (win!=null) {
		win.move_resize(x, y, width, height);
	}
};

XpraClient.prototype._process_desktop_size = function(packet, ctx) {
	//root_w, root_h, max_w, max_h = packet[1:5]
	//we don't use this yet,
	//we could use this to clamp the windows to a certain area
};

XpraClient.prototype._process_bell = function(packet, ctx) {
	const percent = packet[3];
	const pitch = packet[4];
	const duration = packet[5];
	if (ctx.audio_context!=null) {
		const oscillator = ctx.audio_context.createOscillator();
		const gainNode = ctx.audio_context.createGain();
		oscillator.connect(gainNode);
		gainNode.connect(ctx.audio_context.destination);
		gainNode.gain.setValueAtTime(percent, ctx.audio_context.currentTime);
		oscillator.frequency.setValueAtTime(pitch, ctx.audio_context.currentTime);
		oscillator.start();
		setTimeout(function(){oscillator.stop();}, duration);
	}
	else {
		const snd = new Audio("data:audio/wav;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7xA4Tvh9Rz/y8QADBwMWgQAZG/ILNAARQ4GLTcDeIIIhxGOBAuD7hOfBB3/94gcJ3w+o5/5eIAIAAAVwWgQAVQ2ORaIQwEMAJiDg95G4nQL7mQVWI6GwRcfsZAcsKkJvxgxEjzFUgfHoSQ9Qq7KNwqHwuB13MA4a1q/DmBrHgPcmjiGoh//EwC5nGPEmS4RcfkVKOhJf+WOgoxJclFz3kgn//dBA+ya1GhurNn8zb//9NNutNuhz31f////9vt///z+IdAEAAAK4LQIAKobHItEIYCGAExBwe8jcToF9zIKrEdDYIuP2MgOWFSE34wYiR5iqQPj0JIeoVdlG4VD4XA67mAcNa1fhzA1jwHuTRxDUQ//iYBczjHiTJcIuPyKlHQkv/LHQUYkuSi57yQT//uggfZNajQ3Vmz+Zt//+mm3Wm3Q576v////+32///5/EOgAAADVghQAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQRLCgwpBGMlJkIz8jKhGvj4k6jzRnqasNKIeoh5gI7BJaC1A1AoNBjJgbyApVS4IDlZgDU5WUAxEKDNmmALHzZp0Fkz1FMTmGFl1FMEyodIavcCAUHDWrKAIA4aa2oCgILEBupZgHvAhEBcZ6joQBxS76AgccrFlczBvKLC0QI2cBoCFvfTDAo7eoOQInqDPBtvrDEZBNYN5xwNwxQRfw8ZQ5wQVLvO8OYU+mHvFLlDh05Mdg7BT6YrRPpCBznMB2r//xKJjyyOh+cImr2/4doscwD6neZjuZR4AgAABYAAAABy1xcdQtxYBYYZdifkUDgzzXaXn98Z0oi9ILU5mBjFANmRwlVJ3/6jYDAmxaiDG3/6xjQQCCKkRb/6kg/wW+kSJ5//rLobkLSiKmqP/0ikJuDaSaSf/6JiLYLEYnW/+kXg1WRVJL/9EmQ1YZIsv/6Qzwy5qk7/+tEU0nkls3/zIUMPKNX/6yZLf+kFgAfgGyLFAUwY//uQZAUABcd5UiNPVXAAAApAAAAAE0VZQKw9ISAAACgAAAAAVQIygIElVrFkBS+Jhi+EAuu+lKAkYUEIsmEAEoMeDmCETMvfSHTGkF5RWH7kz/ESHWPAq/kcCRhqBtMdokPdM7vil7RG98A2sc7zO6ZvTdM7pmOUAZTnJW+NXxqmd41dqJ6mLTXxrPpnV8avaIf5SvL7pndPvPpndJR9Kuu8fePvuiuhorgWjp7Mf/PRjxcFCPDkW31srioCExivv9lcwKEaHsf/7ow2Fl1T/9RkXgEhYElAoCLFtMArxwivDJJ+bR1HTKJdlEoTELCIqgEwVGSQ+hIm0NbK8WXcTEI0UPoa2NbG4y2K00JEWbZavJXkYaqo9CRHS55FcZTjKEk3NKoCYUnSQ0rWxrZbFKbKIhOKPZe1cJKzZSaQrIyULHDZmV5K4xySsDRKWOruanGtjLJXFEmwaIbDLX0hIPBUQPVFVkQkDoUNfSoDgQGKPekoxeGzA4DUvnn4bxzcZrtJyipKfPNy5w+9lnXwgqsiyHNeSVpemw4bWb9psYeq//uQZBoABQt4yMVxYAIAAAkQoAAAHvYpL5m6AAgAACXDAAAAD59jblTirQe9upFsmZbpMudy7Lz1X1DYsxOOSWpfPqNX2WqktK0DMvuGwlbNj44TleLPQ+Gsfb+GOWOKJoIrWb3cIMeeON6lz2umTqMXV8Mj30yWPpjoSa9ujK8SyeJP5y5mOW1D6hvLepeveEAEDo0mgCRClOEgANv3B9a6fikgUSu/DmAMATrGx7nng5p5iimPNZsfQLYB2sDLIkzRKZOHGAaUyDcpFBSLG9MCQALgAIgQs2YunOszLSAyQYPVC2YdGGeHD2dTdJk1pAHGAWDjnkcLKFymS3RQZTInzySoBwMG0QueC3gMsCEYxUqlrcxK6k1LQQcsmyYeQPdC2YfuGPASCBkcVMQQqpVJshui1tkXQJQV0OXGAZMXSOEEBRirXbVRQW7ugq7IM7rPWSZyDlM3IuNEkxzCOJ0ny2ThNkyRai1b6ev//3dzNGzNb//4uAvHT5sURcZCFcuKLhOFs8mLAAEAt4UWAAIABAAAAAB4qbHo0tIjVkUU//uQZAwABfSFz3ZqQAAAAAngwAAAE1HjMp2qAAAAACZDgAAAD5UkTE1UgZEUExqYynN1qZvqIOREEFmBcJQkwdxiFtw0qEOkGYfRDifBui9MQg4QAHAqWtAWHoCxu1Yf4VfWLPIM2mHDFsbQEVGwyqQoQcwnfHeIkNt9YnkiaS1oizycqJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");
		snd.play();
	}
};

/**
 * Notifications
 */
XpraClient.prototype._process_notify_show = function(packet, ctx) {
	//TODO: add UI switch to disable notifications
	//unused:
	//const dbus_id = packet[1];
	//const app_name = packet[3];
	//const app_icon = packet[5];
	const nid = packet[2];
	const replaces_nid = packet[4];
	const summary = Utilities.s(packet[6]);
	const body = Utilities.s(packet[7]);
	const expire_timeout = packet[8];
	const icon = packet[9];
	const actions = packet[10];
	const hints = packet[11];
	if(window.closeNotification) {
		if (replaces_nid>0) {
			window.closeNotification(replaces_nid);
		}
		window.closeNotification(nid);
	}

	function notify() {
		let icon_url = "";
		if (icon && icon[0]=="png") {
			icon_url = "data:image/png;base64," + Utilities.ToBase64(icon[3]);
			ctx.clog("notification icon_url=", icon_url);
		}
		/*
		const nactions = [];
		if (actions) {
			ctx.log("actions=", actions);
			for (let i=0; i<actions.length/2;++i) {
				nactions.push({
					"action"	: actions[i*2],
					"title"		: actions[i*2+1],
				});
			}
		}*/
		const notification = new Notification(summary, { body: body, icon: icon_url });
		notification.onclose = function() {
			const reason = 2;	//closed by the user - best guess...
			ctx.send(["notification-close", nid, reason, ""]);
		};
		notification.onclick = function() {
			ctx.log("user clicked on notification", nid);
		};
	}

	if ("Notification" in window && actions.length==0) {
		//we have notification support in the browser
		if (Notification.permission === "granted") {
			notify();
			return;
		}
		else if (Notification.permission !== "denied") {
			Notification.requestPermission(function (permission) {
				if (permission === "granted") {
					notify();
				}
			});
			return;
		}
	}
	
	if(window.doNotification) {
		window.doNotification("info", nid, summary, body, expire_timeout, icon, actions, hints,
				function(nid, action_id) {
					ctx.send(["notification-action", nid, action_id]);
				},
				function(nid, reason, text) {
					ctx.send(["notification-close", nid, reason, text || ""]);
				});
	}
	ctx._new_ui_event();
};

XpraClient.prototype._process_notify_close = function(packet, ctx) {
	const nid = packet[1];
	if(window.closeNotification) {
		window.closeNotification(nid);
	}
};


/**
 * Cursors
 */
XpraClient.prototype.reset_cursor = function(packet, ctx) {
	for (const wid in ctx.id_to_window) {
		const window = ctx.id_to_window[wid];
		window.reset_cursor();
	}
};

XpraClient.prototype._process_cursor = function(packet, ctx) {
	if (packet.length==2) {
		ctx.reset_cursor(packet, ctx);
		return;
	}
	if (packet.length<9) {
		ctx.reset_cursor();
		return;
	}
	//we require a png encoded cursor packet:
	const encoding = packet[1];
	if (encoding!="png") {
		ctx.warn("invalid cursor encoding: "+encoding);
		return;
	}
	const w = packet[4];
	const h = packet[5];
	const xhot = packet[6];
	const yhot = packet[7];
	const img_data = packet[9];
	for (const wid in ctx.id_to_window) {
		const window = ctx.id_to_window[wid];
		window.set_cursor(encoding, w, h, xhot, yhot, img_data);
	}
};

XpraClient.prototype._process_window_icon = function(packet, ctx) {
	const wid = packet[1];
	const w = packet[2];
	const h = packet[3];
	const encoding = packet[4];
	const img_data = packet[5];
	ctx.debug("main", "window-icon: ", encoding, " size ", w, "x", h);
	const win = ctx.id_to_window[wid];
	if (win) {
		const src = win.update_icon(w, h, encoding, img_data);
		//update favicon too:
		if (wid==ctx.focus || ctx.server_is_desktop || ctx.server_is_shadow) {
			jQuery("#favicon").attr("href", src);
		}
	}
};

/**
 * Window Painting
 */
XpraClient.prototype._process_draw = function(packet, ctx) {
	//ensure that the pixel data is in a byte array:
	const coding = Utilities.s(packet[6]);
	packet[6] = coding;
	let img_data = packet[7];
	const raw_buffers = [];
	const now = performance.now();
	if (coding!="scroll") {
		if (!(img_data instanceof Uint8Array)) {
			//the legacy bencoder can give us a string here
			img_data = Utilities.StringToUint8(img_data);
			packet[7] = img_data;
		}
		raw_buffers.push(img_data.buffer);
	}
	if (ctx.decode_worker) {
		ctx.decode_worker.postMessage({'cmd': 'decode', 'packet' : packet, 'start' : now}, raw_buffers);
		//the worker draw event will call do_process_draw
	}
	else {
		ctx.do_process_draw(packet, now);
	}
}

XpraClient.prototype._process_eos = function(packet, ctx) {
	ctx.do_process_draw(packet, 0);
	const wid = packet[1];
	if (ctx.decode_worker) {
		ctx.decode_worker.postMessage({'cmd': 'eos', 'wid' : wid});
	}
}


XpraClient.prototype.request_redraw = function(win) {

	if (document.hidden) {
		this.debug("draw", "not redrawing, document.hidden=", document.hidden);
		return;
	}

	if (this.offscreen_api) {
		this.decode_worker.postMessage({'cmd': 'redraw', 'wid' : win.wid});
		return;
	}
	// request that drawing to screen takes place at next available opportunity if possible
	this.debug("draw", "request_redraw for", win);
	win.swap_buffers();
	if(!window.requestAnimationFrame) {
		// requestAnimationFrame is not available, draw immediately
		win.draw();
		return;
	}
	if (!this.pending_redraw.includes(win)) {
		this.pending_redraw.push(win);
	}
	if (this.draw_pending) {
		// already scheduled
		return;
	}
	// schedule a screen refresh if one is not already due:
	this.draw_pending = performance.now();
	const me = this;
	window.requestAnimationFrame(function() {me.draw_pending_list()});
};

XpraClient.prototype.draw_pending_list = function() {
	this.debug("draw", "animation frame:", this.pending_redraw.length,
		"windows to paint, processing delay", performance.now()-this.draw_pending, "ms");
	this.draw_pending = 0;
	// draw all the windows in the list:
	while (this.pending_redraw.length>0) {
		const w = this.pending_redraw.shift();
		w.draw();
	}
}


XpraClient.prototype.do_send_damage_sequence = function(packet_sequence, wid, width, height, decode_time, message) {
	const protocol = this.protocol;
	if (!protocol) {
		return;
	}
	const packet = ["damage-sequence", packet_sequence, wid, width, height, decode_time, message];
	if (decode_time<0) {
		this.cwarn("decode error packet:", packet);
	}
	protocol.send(packet);
}

XpraClient.prototype.do_process_draw = function(packet, start) {
	if(!packet){
		//no valid draw packet, likely handle errors for that here
		return;
	}
	const ptype = packet[0],
		wid = packet[1];
	const win = this.id_to_window[wid];
	if (ptype=="eos") {
		this.debug("draw", "eos for window", wid);
		if (win) {
			win.eos();
		}
		return;
	}

	const width = packet[4],
		height = packet[5],
		coding = Utilities.s(packet[6]),
		packet_sequence = packet[8];
	let options = packet[10] || {};
	const protocol = this.protocol;
	if (!protocol) {
		return;
	}
	const me = this;
	function send_damage_sequence(decode_time, message) {
		me.do_send_damage_sequence(packet_sequence, wid, width, height, decode_time, message);
	}
	function decode_result(error) {
		const flush = options["flush"] || 0;
		let decode_time = Math.round(1000*performance.now() - 1000*start);
		if (flush==0) {
			me.request_redraw(win);
		}
		if (error || start==0) {
			me.request_redraw(win);
			decode_time = -1
		}
		me.debug("draw", "decode time for ", coding, " sequence ", packet_sequence, ": ", decode_time, ", flush=", flush);
		send_damage_sequence(decode_time, error || "");
	}
	if (!win) {
		this.debug("draw", 'cannot paint, window not found:', wid);
		send_damage_sequence(-1, "window "+wid+" not found");
		return;
	}
	if (coding=="offscreen-painted") {
		const decode_time = options["decode_time"];
		send_damage_sequence(decode_time || 0, "");
		return;
	}
	try {
		win.paint(packet, decode_result);
	}
	catch(e) {
		me.exc(e, "error painting", coding, "sequence no", packet_sequence);
		send_damage_sequence(-1, String(e));
		//there may be other screen updates pending:
		win.paint_pending = 0;
		win.may_paint_now();
		me.request_redraw(win);
	}
};


/**
 * Audio
 */
XpraClient.prototype.init_audio = function(ignore_audio_blacklist) {
	this.debug("audio", "init_audio() enabled=", this.audio_enabled, ", mediasource enabled=", this.audio_mediasource_enabled, ", aurora enabled=", this.audio_aurora_enabled);
	if(this.audio_mediasource_enabled) {
		this.mediasource_codecs = MediaSourceUtil.getMediaSourceAudioCodecs(ignore_audio_blacklist);
		for (const codec_option in this.mediasource_codecs) {
			this.audio_codecs[codec_option] = this.mediasource_codecs[codec_option];
		}
	}
	if(this.audio_aurora_enabled) {
		this.aurora_codecs = MediaSourceUtil.getAuroraAudioCodecs();
		for (const codec_option in this.aurora_codecs) {
			if(codec_option in this.audio_codecs) {
				//we already have native MediaSource support!
				continue;
			}
			this.audio_codecs[codec_option] = this.aurora_codecs[codec_option];
		}
	}
	this.debug("audio", "codecs:", this.audio_codecs);
	if(!this.audio_codecs) {
		this.audio_codec = null;
		this.audio_enabled = false;
		this.warn("no valid audio codecs found");
		return;
	}
	if(!(this.audio_codec in this.audio_codecs)) {
		if(this.audio_codec) {
			this.warn("invalid audio codec: "+this.audio_codec);
			this.warn("codecs found: "+this.audio_codecs);
		}
		this.audio_codec = MediaSourceUtil.getDefaultAudioCodec(this.audio_codecs);
		if(this.audio_codec) {
			if(this.audio_mediasource_enabled && (this.audio_codec in this.mediasource_codecs)) {
				this.audio_framework = "mediasource";
			}
			else if (this.audio_aurora_enabled && !Utilities.isIE()) {
				this.audio_framework = "aurora";
			}
			if (this.audio_framework) {
				this.log("using "+this.audio_framework+" audio codec: "+this.audio_codec);
			}
			else {
				this.warn("no valid audio framework - cannot enable audio");
				this.audio_enabled = false;
			}
		}
		else {
			this.warn("no valid audio codec found");
			this.audio_enabled = false;
		}
	}
	else {
		this.log("using "+this.audio_framework+" audio codec: "+this.audio_codec);
	}
	this.log("audio codecs: ", Object.keys(this.audio_codecs));
};

XpraClient.prototype._sound_start_receiving = function() {
	if (!this.audio_framework || !this.audio_codec) {
		//choose a codec + framework to use
		const codecs_supported = MediaSourceUtil.get_supported_codecs(this.audio_mediasource_enabled,
				this.audio_aurora_enabled,
				false);
		const audio_codec = MediaSourceUtil.get_best_codec(codecs_supported);
		if (!audio_codec) {
			this.log("no codec found");
			return;
		}
		const acparts = audio_codec.split(":");
		this.audio_framework = acparts[0];
		this.audio_codec = acparts[1];
	}
	try {
		this.audio_buffers = [];
		this.audio_buffers_count = 0;
		if (this.audio_framework=="mediasource") {
			this._sound_start_mediasource();
		}
		else {
			this._sound_start_aurora();
		}
	}
	catch(e) {
		this.exc(e, "error starting audio player");
	}
};


XpraClient.prototype._send_sound_start = function() {
	this.log("audio: requesting "+this.audio_codec+" stream from the server");
	this.send(["sound-control", "start", this.audio_codec]);
};


XpraClient.prototype._sound_start_aurora = function() {
	this.audio_aurora_ctx = AV.Player.fromXpraSource();
	this._send_sound_start();
};

XpraClient.prototype._sound_start_mediasource = function() {
	const me = this;

	function audio_error(event) {
		if(!me.media_source) {
			//already closed
			me.debug("audio", "media_source is closed, ignoring audio error: "+event);
			return;
		}
		if(me.audio) {
			me.error(event+" error: "+me.audio.error);
			if(me.audio.error) {
				me.error(MediaSourceConstants.ERROR_CODE[me.audio.error.code]);
			}
		}
		else {
			me.error(event+" error");
		}
		me.close_audio();
	}

	//Create a MediaSource:
	this.media_source = MediaSourceUtil.getMediaSource();
	if(this.debug) {
		MediaSourceUtil.addMediaSourceEventDebugListeners(this.media_source, "audio");
	}
	this.media_source.addEventListener('error', 	function(e) {audio_error("audio source"); });

	//Create an <audio> element:
	this.audio = document.createElement("audio");
	this.audio.setAttribute('autoplay', true);
	if(this.debug) {
		MediaSourceUtil.addMediaElementEventDebugListeners(this.audio, "audio");
	}
	this.audio.addEventListener('play', 			function() { me.clog("audio play!"); });
	this.audio.addEventListener('error', 			function() { audio_error("audio"); });
	document.body.appendChild(this.audio);

	//attach the MediaSource to the <audio> element:
	this.audio.src = window.URL.createObjectURL(this.media_source);
	this.audio_buffers = [];
	this.audio_buffers_count = 0;
	this.audio_source_ready = false;
	this.clog("audio waiting for source open event on", this.media_source);
	this.media_source.addEventListener('sourceopen', function() {
		me.log("audio media source open");
		if (me.audio_source_ready) {
			me.warn("ignoring: source already open");
			return;
		}
		//ie: codec_string = "audio/mp3";
		const codec_string = MediaSourceConstants.CODEC_STRING[me.audio_codec];
		if(codec_string==null) {
			me.error("invalid codec '"+me.audio_codec+"'");
			me.close_audio();
			return;
		}
		me.log("using audio codec string for "+me.audio_codec+": "+codec_string);

		//Create a SourceBuffer:
		let asb;
		try {
			asb = me.media_source.addSourceBuffer(codec_string);
		} catch (e) {
			me.exc(e, "audio setup error for", codec_string);
			me.close_audio();
			return;
		}
		me.audio_source_buffer = asb;
		asb.mode = "sequence";
		if (me.debug_categories.includes("audio")) {
			MediaSourceUtil.addSourceBufferEventDebugListeners(asb, "audio");
		}
		asb.addEventListener('error', 				function(e) { audio_error("audio buffer"); });
		me.audio_source_ready = true;
		me._send_sound_start();
	});
};

XpraClient.prototype._send_sound_stop = function() {
	this.log("audio: stopping stream");
	this.send(["sound-control", "stop"]);
};

XpraClient.prototype.close_audio = function() {
	if (this.connected && this.audio_enabled) {
		this._send_sound_stop();
	}
	if (this.audio_framework=="mediasource") {
		this._close_audio_mediasource();
	}
	else {
		this._close_audio_aurora();
	}
	this.on_audio_state_change("stopped", "closed");
};

XpraClient.prototype._close_audio_aurora = function() {
	if(this.audio_aurora_ctx) {
		if (this.audio_aurora_ctx.context) {
			try {
				this.audio_aurora_ctx.context.close();
			}
			catch (e) {
				this.debug("audio", "error closing context", e);
			}
		}
		this.audio_aurora_ctx = null;
	}
};

XpraClient.prototype._close_audio_mediasource = function() {
	this.log("close_audio_mediasource: audio_source_buffer="+this.audio_source_buffer+", media_source="+this.media_source+", audio="+this.audio);
	this.audio_source_ready = false;
	if(this.audio) {
		if(this.media_source) {
			try {
				if(this.audio_source_buffer) {
					this.media_source.removeSourceBuffer(this.audio_source_buffer);
					this.audio_source_buffer = null;
				}
				if(this.media_source.readyState=="open") {
					this.media_source.endOfStream();
				}
			} catch(e) {
				this.exc(e, "audio media source EOS error");
			}
			this.media_source = null;
		}
		this._remove_audio_element();
	}
};

XpraClient.prototype._remove_audio_element = function() {
	if (this.audio!=null) {
		this.audio.src = "";
		this.audio.load();
		try {
			document.body.removeChild(this.audio);
		}
		catch (e) {
			this.debug("audio", "failed to remove audio from page:", e);
		}
		this.audio = null;
	}
};

XpraClient.prototype._process_sound_data = function(packet, ctx) {
	try {
		const codec = Utilities.s(packet[1]);
		const buf = packet[2];
		const options = packet[3];
		const metadata = packet[4];

		if (codec!=ctx.audio_codec) {
			ctx.error("invalid audio codec '"+codec+"' (expected "+ctx.audio_codec+"), stopping audio stream");
			ctx.close_audio();
			return;
		}

		if (options["start-of-stream"] == 1) {
			ctx._audio_start_stream();
		}

		if (buf && buf.length>0) {
			ctx.add_sound_data(codec, buf, metadata);
		}

		if (options["end-of-stream"] == 1) {
			ctx.log("received end-of-stream from server");
			ctx.close_audio();
		}
	}
	catch(e) {
		ctx.on_audio_state_change("error", ""+e);
		ctx.exc(e, "sound data error");
		ctx.close_audio();
	}
};

XpraClient.prototype.on_audio_state_change = function(newstate, details) {
	this.debug("on_audio_state_change:", newstate, details);
	this.audio_state = newstate;
	//can be overriden
};

XpraClient.prototype.add_sound_data = function(codec, buf, metadata) {
	let MIN_START_BUFFERS = 4;
	const MAX_BUFFERS = 250;
	const CONCAT = true;
	this.debug("audio", "sound-data: ", codec, ", ", buf.length, "bytes");
	if (this.audio_buffers.length>=MAX_BUFFERS) {
		this.warn("audio queue overflowing: "+this.audio_buffers.length+", stopping");
		this.on_audio_state_change("error", "queue overflow");
		this.close_audio();
		return;
	}
	if (metadata) {
		this.debug("audio", "audio metadata=", metadata);
		//push metadata first:
		for (let i = 0; i < metadata.length; i++) {
			this.debug("audio", "metadata[", i, "]=", metadata[i], ", length=", metadata[i].length, ", type=", Object.prototype.toString.call(metadata[i]));
			this.audio_buffers.push(Utilities.u(metadata[i]));
		}
		//since we have the metadata, we should be good to go:
		MIN_START_BUFFERS = 1;
	}
	if (buf != null) {
		this.audio_buffers.push(buf);
	}
	const ab = this.audio_buffers;
	if (this._audio_ready() && (this.audio_buffers_count>0 || ab.length >= MIN_START_BUFFERS)) {
		if (CONCAT) {
			if (ab.length==1) {
				//shortcut
				buf = ab[0];
			}
			else {
				//concatenate all pending buffers into one:
				let size = 0;
				for (let i=0,j=ab.length;i<j;++i) {
					size += ab[i].length;
				}
				buf = new Uint8Array(size);
				size = 0;
				for (let i=0,j=ab.length;i<j;++i) {
					const v = ab[i];
					if (v.length>0) {
						buf.set(v, size);
						size += v.length;
					}
				}
			}
			this.audio_buffers_count += 1;
			this.push_audio_buffer(buf);
		}
		else {
			this.audio_buffers_count += ab.length;
			for (let i=0,j=ab.length;i<j;++i) {
				this.push_audio_buffer(ab[i]);
			}
		}
		this.audio_buffers = [];
	}
};

XpraClient.prototype._audio_start_stream = function() {
	this.debug("audio", "audio start of "+this.audio_framework+" "+this.audio_codec+" stream");
	if (this.audio_state=="playing" || this.audio_state=="waiting") {
		//nothing to do: ready to play
		return;
	}
	const me = this;
	this.on_audio_state_change("waiting", ""+this.audio_framework+" playing "+this.audio_codec+" stream");
	if (this.audio_framework=="mediasource") {
		let play = this.audio.play();
		if (play==undefined) {
			this.on_audio_state_change("error", "no promise");
			this.close_audio();
			return;
		}
		play.then(function(result) {
			me.debug("audio", "stream playing", result);
		}, function(err) {
			me.on_audio_state_change("error", "stream failed:"+err);
			me.close_audio();
		});
	}
	else if (this.audio_framework=="http-stream") {
		this.log("invalid start-of-stream data for http-stream framework");
	}
	else if (this.audio_framework=="aurora") {
		this.audio_aurora_ctx.play();
	}
	else {
		this.on_audio_state_change("error", "unknown framework "+this.audio_framework);
		this.close_audio();
	}
};

XpraClient.prototype._audio_ready = function() {
	if (this.audio_framework=="mediasource") {
		//check media source buffer state:
		if (this.audio) {
			this.debug("audio", "mediasource state=", MediaSourceConstants.READY_STATE[this.audio.readyState], ", network state=", MediaSourceConstants.NETWORK_STATE[this.audio.networkState]);
			this.debug("audio", "audio paused=", this.audio.paused, ", queue size=", this.audio_buffers.length, ", source ready=", this.audio_source_ready, ", source buffer updating=", this.audio_source_buffer.updating);
		}
		const asb = this.audio_source_buffer;
		return (asb!=null) && (!asb.updating);
	}
	else {
		return (this.audio_aurora_ctx!=null);
	}
};

XpraClient.prototype.push_audio_buffer = function(buf) {
	if (this.audio_framework=="mediasource") {
		this.audio_source_buffer.appendBuffer(buf);
		const b = this.audio_source_buffer.buffered;
		if (b && b.length>=1) {
			//for (let i=0; i<b.length;i++) {
			//	this.clog("buffered[", i, "]=", b.start(i), b.end(i));
			//}
			const p = this.audio.played;
			//for (let i=0; i<p.length;i++) {
			//	this.clog("played[", i, "]=", p.start(i), p.end(i));
			//}
			const e = b.end(0);
			const buf_size = Math.round(1000*(e - this.audio.currentTime));
			this.debug("audio", "buffer size=", buf_size, "ms, currentTime=", this.audio.currentTime);
		}
	}
	else {
		this.audio_aurora_ctx.asset.source._on_data(buf);
		this.debug("audio", "playing=", this.audio_aurora_ctx.playing,
							"buffered=", this.audio_aurora_ctx.buffered,
							"currentTime=", this.audio_aurora_ctx.currentTime,
							"duration=", this.audio_aurora_ctx.duration);
		if (this.audio_aurora_ctx.format) {
			this.debug("audio", "formatID=", this.audio_aurora_ctx.format.formatID,
								"sampleRate=", this.audio_aurora_ctx.format.sampleRate);
		}
		this.debug("audio", "active=", this.audio_aurora_ctx.asset.active,
							"decoder=", this.audio_aurora_ctx.asset.decoder,
							"demuxer=", this.audio_aurora_ctx.demuxer);
							//"source=", this.audio_aurora_ctx.asset.source,
							//"events=", this.audio_aurora_ctx.asset.source.events);
	}
	this.on_audio_state_change("playing", "");
};


/**
 * Clipboard
 */
XpraClient.prototype.get_clipboard_buffer = function() {
	return this.clipboard_buffer;
};
XpraClient.prototype.get_clipboard_datatype = function() {
	return this.clipboard_datatype;
};

XpraClient.prototype.send_clipboard_token = function(data) {
	if (!this.clipboard_enabled || !this.connected) {
		return;
	}
	this.debug("clipboard", "sending clipboard token with data:", data);
	const claim = true;	//Boolean(navigator.clipboard && navigator.clipboard.readText && navigator.clipboard.writeText);
	const greedy = true;
	const synchronous = true;
	let packet;
	if (data) {
		packet = ["clipboard-token", "CLIPBOARD", ["UTF8_STRING", "text/plain"],
			"UTF8_STRING", "UTF8_STRING", 8, "bytes", data,
			claim, greedy, synchronous];
	}
	else {
		packet = ["clipboard-token", "CLIPBOARD", [],
			"", "", 8, "bytes", "",
			claim, greedy, synchronous];
	}
	this.send(packet);
};

XpraClient.prototype._process_clipboard_token = function(packet, ctx) {
	if (!ctx.clipboard_enabled) {
		return;
	}
	const selection = packet[1];
	let targets = [];
	let target = null;
	let dtype = null;
	let dformat = null;
	let wire_encoding = null;
	let wire_data = null;
	if (packet.length>=3) {
		targets = packet[2];
	}
	if (packet.length>=8) {
		target = packet[3];
		dtype = packet[4];
		dformat = packet[5];
		wire_encoding = packet[6];
		wire_data = packet[7];
		//always keep track of the latest server buffer
		ctx.clipboard_server_buffers[selection] = [target, dtype, dformat, wire_encoding, wire_data];
	}

	const is_valid_target = target && ctx.clipboard_targets.includes(target);
	ctx.debug("clipboard", "clipboard token received");
	ctx.debug("clipboard", "targets=", targets);
	ctx.debug("clipboard", "target=", target, "is valid:", is_valid_target);
	ctx.debug("clipboard", "dtype=", dtype, "dformat=", dformat, "wire-encoding=", wire_encoding);
	// if we have navigator.clipboard support in the browser,
	// we can just set the clipboard value here,
	// otherwise we don't actually set anything
	// because we can't (the browser security won't let us)
	// we just record the value and actually set the clipboard
	// when we get a click, control-C or control-X event
	// (when access to the clipboard is allowed)
	if (is_valid_target) {
		const is_text = dtype.toLowerCase().indexOf("text")>=0 || dtype.toLowerCase().indexOf("string")>=0;
		if (is_text) {
			try {
				wire_data = Utilities.Uint8ToString(wire_data);
			}
			catch (e) { }
			if (ctx.clipboard_buffer!=wire_data) {
				ctx.clipboard_datatype = dtype;
				ctx.clipboard_buffer = wire_data;
				ctx.clipboard_pending = true;
				if (navigator.clipboard && navigator.clipboard.writeText) {
					if (is_text) {
						navigator.clipboard.writeText(wire_data).then(function() {
							ctx.debug("clipboard", "writeText succeeded");
							ctx.clipboard_pending = false;
						}, function() {
							ctx.debug("clipboard", "writeText failed");
						});
					}
				}
			}
		}
		else if (CLIPBOARD_IMAGES && dtype=="image/png" && dformat==8 && wire_encoding=="bytes"
				&& navigator.clipboard && navigator.clipboard.hasOwnProperty("write")) {
			ctx.debug("clipboard", "png image received");
			const blob = new Blob([wire_data], {type: dtype});
			ctx.debug("clipboard", "created blob", blob);
			const item = new ClipboardItem({"image/png": blob});
			ctx.debug("clipboard", "created ClipboardItem", item);
			const items = [item];
			ctx.debug("clipboard", "created ClipboardItem list", items);
			navigator.clipboard.write(items).then(function() {
				ctx.debug("clipboard", "copied png image to clipboard");
			},
			function(err) {
				ctx.debug("clipboard", "failed to set png image", err);
			});
		}
	}
};

XpraClient.prototype._process_set_clipboard_enabled = function(packet, ctx) {
	if (!ctx.clipboard_enabled) {
		return;
	}
	ctx.clipboard_enabled = packet[1];
	ctx.log("server set clipboard state to "+packet[1]+" reason was: "+packet[2]);
};

XpraClient.prototype._process_clipboard_request = function(packet, ctx) {
	// we shouldn't be handling clipboard requests
	// unless we have support for navigator.clipboard:
	const request_id = packet[1],
		selection = packet[2];
	//target = packet[3];

	ctx.debug("clipboard", selection+" request");

	//we only handle CLIPBOARD requests,
	//PRIMARY is used read-only
	if (selection!="CLIPBOARD") {
		ctx.send_clipboard_string(request_id, selection, "");
		return;
	}

	if (navigator.clipboard) {
		if (navigator.clipboard.hasOwnProperty("read")) {
			ctx.debug("clipboard", "request using read()");
			navigator.clipboard.read().then(function(data) {
				let item = null;
				let itemtype = null;
				ctx.debug("clipboard", "request via read() data=", data);
				for (let i = 0; i < data.length; i++) {
					item = data[i];
					ctx.debug("clipboard", "item", i, "types:", item.types);
					for (let j = 0; j < item.types.length; j++) {
						itemtype = item.types[j];
						if (itemtype == "text/plain") {
							item.getType(itemtype).then(function(blob) {
								const fileReader = new FileReader();
								fileReader.onload = function(event) {
									ctx.send_clipboard_string(request_id, selection, event.target.result);
								};
								fileReader.readAsText(blob);
							}, function(err) {
								ctx.debug("clipboard", "getType('"+itemtype+"') failed", err);
								//send last server buffer instead:
								ctx.resend_clipboard_server_buffer();
							});
							return;
						}
						else if (itemtype == "image/png") {
							item.getType(itemtype).then(function(blob) {
								const fileReader = new FileReader();
								fileReader.onload = function(event) {
									ctx.send_clipboard_contents(request_id, selection, itemtype, 8, "bytes", event.target.result);
								};
								fileReader.readAsText(blob);
							}, function(err) {
								ctx.debug("clipboard", "getType('"+itemtype+"') failed", err);
								//send last server buffer instead:
								ctx.resend_clipboard_server_buffer(request_id, selection);
							});
							return;
						}
					}
				}
			}, function(err) {
				ctx.debug("clipboard", "read() failed:", err);
				//send last server buffer instead:
				ctx.resend_clipboard_server_buffer(request_id, selection);
			});
			return;
		}
		else if (navigator.clipboard.hasOwnProperty("readText")) {
			ctx.debug("clipboard", "clipboard request using readText()");
			navigator.clipboard.readText().then(function(text) {
				ctx.debug("clipboard", "clipboard request via readText() text=", text);
				const primary_server_buffer = ctx.clipboard_server_buffers["PRIMARY"];
				if (primary_server_buffer && primary_server_buffer[2]==8 && primary_server_buffer[3]=="bytes" && text==primary_server_buffer[4]) {
					//we have set the clipboard contents to the PRIMARY selection
					//and the server is asking for the CLIPBOARD selection
					//send it back the last value it gave us
					ctx.debug("clipboard request: using backup value");
					ctx.resend_clipboard_server_buffer(request_id, selection);
					return;
				}
				ctx.send_clipboard_string(request_id, selection, text);
			}, function(err) {
				ctx.debug("clipboard", "readText() failed:", err);
				//send last server buffer instead:
				ctx.resend_clipboard_server_buffer(request_id, selection);
			});
			return;
		}
	}
	const clipboard_buffer = ctx.get_clipboard_buffer() || "";
	ctx.send_clipboard_string(request_id, selection, clipboard_buffer, "UTF8_STRING");
};

XpraClient.prototype.resend_clipboard_server_buffer = function(request_id, selection) {
	const server_buffer = this.clipboard_server_buffers["CLIPBOARD"];
	this.debug("clipboard", "resend_clipboard_server_buffer:", server_buffer);
	if (!server_buffer) {
		this.send_clipboard_string(request_id, selection, "", "UTF8_STRING");
		return;
	}
	const target = server_buffer[0];
	const dtype = server_buffer[1];
	const dformat = server_buffer[2];
	const wire_encoding = server_buffer[3];
	const wire_data = server_buffer[4];
	this.send_clipboard_contents(request_id, selection, dtype, dformat, wire_encoding, wire_data);
};

XpraClient.prototype.send_clipboard_string = function(request_id, selection, clipboard_buffer, datatype) {
	let packet;
	if (clipboard_buffer == "") {
		packet = ["clipboard-contents-none", request_id, selection];
	} else {
		packet = ["clipboard-contents", request_id, selection, datatype || "UTF8_STRING", 8, "bytes", clipboard_buffer];
	}
	this.debug("clipboard", "send_clipboard_string: packet=", packet);
	this.send(packet);
};

XpraClient.prototype.send_clipboard_contents = function(request_id, selection, datatype, dformat, encoding, clipboard_buffer) {
	let packet;
	if (clipboard_buffer == "") {
		packet = ["clipboard-contents-none", request_id, selection];
	} else {
		packet = ["clipboard-contents", request_id, selection, datatype, dformat || 8, encoding || "bytes", clipboard_buffer];
	}
	this.send(packet);
};

/**
 * File transfers and printing
 */
XpraClient.prototype._process_send_file = function(packet, ctx) {
	const basefilename = packet[1];
	const mimetype = packet[2];
	const printit = packet[3];
	const datasize = packet[5];
	const data = packet[6];

	// check the data size for file
	if(data.length != datasize) {
		ctx.warn("send-file: invalid data size, received", data.length, "bytes, expected", datasize);
		return;
	}
	if (printit) {
		ctx.print_document(basefilename, data, mimetype);
	}
	else {
		ctx.save_file(basefilename, data, mimetype);
	}
};

XpraClient.prototype.save_file = function(filename, data, mimetype) {
	if (!this.file_transfer || !this.remote_file_transfer) {
		this.warn("Received file-transfer data but this is not enabled!");
		return;
	}
	if (mimetype == "") {
		mimetype = "application/octet-binary";
	}
	this.log("saving "+data.length+" bytes of "+mimetype+" data to filename "+filename);
	Utilities.saveFile(filename, data, {type : mimetype});
};

XpraClient.prototype.print_document = function(filename, data, mimetype) {
	if (!this.printing || !this.remote_printing) {
		this.warn("Received data to print but printing is not enabled!");
		return;
	}
	if (mimetype != "application/pdf") {
		this.warn("Received unsupported print data mimetype: "+mimetype);
		return;
	}
	this.log("got "+data.length+" bytes of PDF to print");
	var file = new Blob([data], { type: mimetype });
	var fileURL = URL.createObjectURL(file);
	const win = window.open(fileURL);
	if (!win || win.closed || typeof win.closed=='undefined') {
		this.warn("popup blocked, saving to file instead");
		Utilities.saveFile(filename, data, {type : mimetype});
	}
	else {
		win.print();
	}
};

XpraClient.prototype.do_send_file = function(filename, mimetype, size, buffer) {
	if (!this.file_transfer || !this.remote_file_transfer) {
		this.warn("cannot send file: file transfers are disabled!");
		return;
	}
	const packet = ["send-file", filename, mimetype, false, this.remote_open_files, size, buffer, {}];
	this.send(packet);
};

XpraClient.prototype.send_file = function(f) {
	clog("send_file:", f.name, ", type:", f.type, ", size:", f.size);
	const me = this;
	const fileReader = new FileReader();
	fileReader.onloadend = function (evt) {
		const u8a = new Uint8Array(evt.target.result);
		var buf = u8a;
		if (client.packet_encoder!="rencodeplus") {
			buf = Utilities.Uint8ToString(u8a);
		}
		me.do_send_file(f.name, f.type, f.size, buf);
	};
	fileReader.readAsArrayBuffer(f);
}
XpraClient.prototype.send_all_files = function(files) {
	for (let i = 0, f; f = files[i]; i++) {
		this.send_file(f);
	}
}

XpraClient.prototype.start_command = function(name, command, ignore) {
	const packet = ["start-command", name, command, ignore];
	this.send(packet);
};

XpraClient.prototype._process_open_url = function(packet, ctx) {
	const url = packet[1];
	//const send_id = packet[2];
	if (!ctx.open_url) {
		ctx.cwarn("Warning: received a request to open URL '%s'", url);
		ctx.clog(" but opening of URLs is disabled");
		return;
	}
	ctx.clog("opening url:", url);
	const new_window = window.open(url, '_blank');
	if(!new_window || new_window.closed || typeof new_window.closed=='undefined')
	{
		//Popup blocked, display link in notification
		const summary = "Open URL";
		const body = "<a href=\""+url+"\" rel=\"noopener\" target=\"_blank\">"+url+"</a>";
		const timeout = 10;
		window.doNotification("", 0, summary, body, timeout, null, null, null, null, null);
	}
};

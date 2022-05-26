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
const FILE_SIZE_LIMIT = 4 * 1024 * 1024 * 1024; //are we even allowed to allocate this much memory?
const FILE_CHUNKS_SIZE = 128 * 1024;
const MAX_CONCURRENT_FILES = 5;
const CHUNK_TIMEOUT = 10 * 1000;

class XpraClient {
  constructor(container) {
    // the container div is the "screen" on the HTML page where we
    // are able to draw our windows in.
    this.container = document.getElementById(container);
    if (!this.container) {
      throw new Error("invalid container element");
    }
    // assign callback for window resize event
    if (window.jQuery) {
      jQuery(window).resize(
        jQuery.debounce(250, (e) => this._screen_resized(e))
      );
    }

    this.protocol = null;

    this.init_settings();
    this.init_state();
  }

  init_settings() {
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
    this.supported_encodings = [
      "jpeg",
      "png",
      "png/P",
      "png/L",
      "rgb",
      "rgb32",
      "rgb24",
      "scroll",
      "void",
    ];
    //extra encodings we enable if validated via the decode worker:
    //(we also validate jpeg and png as a sanity check)
    this.check_encodings = [
      "jpeg",
      "png",
      "png/P",
      "png/L",
      "rgb",
      "rgb32",
      "rgb24",
      "scroll",
      "webp",
      "void",
      "avif",
    ];
    this.debug_categories = [];
    this.start_new_session = null;
    this.clipboard_enabled = false;
    this.file_transfer = false;
    this.remote_file_size_limit = 0;
    this.remote_file_chunks = 0;
    this.send_chunks_in_progress = new Map();
    this.receive_chunks_in_progress = new Map();
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
    this.reconnect_delay = 1000; //wait 1 second before retrying
    this.reconnect_attempt = 0;
    this.swap_keys = Utilities.isMacOS();
    this.HELLO_TIMEOUT = 30000;
    this.PING_TIMEOUT = 15000;
    this.PING_GRACE = 2000;
    this.PING_FREQUENCY = 5000;
    this.INFO_FREQUENCY = 1000;
    this.uuid = Utilities.getHexUUID();
    this.offscreen_api = DECODE_WORKER && XpraOffscreenWorker.isAvailable();
  }

  init_state() {
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
    this.audio_mediasource_enabled =
      MediaSourceUtil.getMediaSourceClass() != null;
    this.audio_aurora_enabled =
      typeof AV !== "undefined" &&
      AV != null &&
      AV.Decoder != null &&
      AV.Player.fromXpraSource != null;
    this.audio_codecs = {};
    this.audio_framework = null;
    this.audio_aurora_ctx = null;
    this.audio_codec = null;
    this.audio_context = new AudioContext();
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
    this.clipboard_direction =
      default_settings["clipboard_direction"] || "both";
    this.clipboard_datatype = null;
    this.clipboard_buffer = "";
    this.clipboard_server_buffers = {};
    this.clipboard_pending = false;
    this.clipboard_targets = ["UTF8_STRING", "TEXT", "STRING", "text/plain"];
    if (
      CLIPBOARD_IMAGES &&
      navigator.clipboard &&
      {}.hasOwnProperty.call(navigator.clipboard, "write")
    ) {
      this.clipboard_targets.push("image/png");
    } else {
      this.log(
        "no clipboard write support: no images, navigator.clipboard=",
        navigator.clipboard
      );
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
    screen_element.mousedown((e) => this.on_mousedown(e));
    screen_element.mouseup((e) => this.on_mouseup(e));
    screen_element.mousemove((e) => this.on_mousemove(e));

    const div = document.getElementById("screen");
    function on_mousescroll(e) {
      me.on_mousescroll(e);
      return e.preventDefault();
    }
    if (Utilities.isEventSupported("wheel")) {
      div.addEventListener("wheel", on_mousescroll, false);
    } else if (Utilities.isEventSupported("mousewheel")) {
      div.addEventListener("mousewheel", on_mousescroll, false);
    } else if (Utilities.isEventSupported("DOMMouseScroll")) {
      div.addEventListener("DOMMouseScroll", on_mousescroll, false); // for Firefox
    }
  }

  send() {
    this.debug("network", "sending a", arguments[0], "packet");
    if (this.protocol) {
      this.protocol.send.apply(this.protocol, arguments);
    }
  }

  send_log(level, args) {
    if (this.remote_logging && this.server_remote_logging && this.connected) {
      try {
        const sargs = [];
        for (let i = 0; i < args.length; i++) {
          sargs.push(unescape(encodeURIComponent(String(args[i]))));
        }
        this.send(["logging", level, sargs]);
      } catch (e) {
        this.cerror("remote logging failed");
        for (let i = 0; i < args.length; i++) {
          this.clog(" argument", i, typeof args[i], ":", "'" + args[i] + "'");
        }
      }
    }
  }
  exc() {
    //first argument is the exception:
    const exception = arguments[0];
    let args = Array.from(arguments);
    args = args.splice(1);
    if (args.length > 0) {
      this.cerror(args);
    }
    if (exception.stack) {
      try {
        //logging.ERROR = 40
        this.send_log(40, [exception.stack]);
      } catch (e) {
        //we tried our best
      }
    }
  }
  error() {
    //logging.ERROR = 40
    this.send_log(40, arguments);
    this.cerror.apply(this, arguments);
  }
  cerror() {
    Utilities.cerror.apply(Utilities, arguments);
  }
  warn() {
    //logging.WARN = 30
    this.send_log(30, arguments);
    this.cwarn.apply(this, arguments);
  }
  cwarn() {
    Utilities.cwarn.apply(Utilities, arguments);
  }
  log() {
    //logging.INFO = 20
    this.send_log(20, arguments);
    this.clog.apply(this, arguments);
  }
  clog() {
    Utilities.clog.apply(Utilities, arguments);
  }
  debug() {
    const category = arguments[0];
    let args = Array.from(arguments);
    if (this.debug_categories.includes(category)) {
      if (category != "network") {
        //logging.DEBUG = 10
        this.send_log(10, arguments);
      }
      this.cdebug.apply(this, arguments);
    }
  }
  cdebug() {
    Utilities.cdebug.apply(Utilities, arguments);
  }

  init(ignore_blacklist) {
    this.on_connection_progress("Initializing", "", 20);
    this.init_audio(ignore_blacklist);
    this.init_packet_handlers();
    this.init_keyboard();
    if (this.scale !== 1) {
      this.container.style.width = 100 * this.scale + "%";
      this.container.style.height = 100 * this.scale + "%";
      this.container.style.transform = "scale(" + 1 / this.scale + ")";
      this.container.style.transformOrigin = "top left";
    }
  }

  init_packet_handlers() {
    // the client holds a list of packet handlers
    this.packet_handlers = {
      open: this._process_open,
      close: this._process_close,
      error: this._process_error,
      disconnect: this._process_disconnect,
      challenge: this._process_challenge,
      "startup-complete": this._process_startup_complete,
      hello: this._process_hello,
      encodings: this._process_encodings,
      ping: this._process_ping,
      ping_echo: this._process_ping_echo,
      "info-response": this._process_info_response,
      "new-tray": this._process_new_tray,
      "new-window": this._process_new_window,
      "new-override-redirect": this._process_new_override_redirect,
      "window-metadata": this._process_window_metadata,
      "lost-window": this._process_lost_window,
      "raise-window": this._process_raise_window,
      "window-icon": this._process_window_icon,
      "window-resized": this._process_window_resized,
      "window-move-resize": this._process_window_move_resize,
      "initiate-moveresize": this._process_initiate_moveresize,
      "configure-override-redirect": this._process_configure_override_redirect,
      desktop_size: this._process_desktop_size,
      eos: this._process_eos,
      draw: this._process_draw,
      cursor: this._process_cursor,
      bell: this._process_bell,
      notify_show: this._process_notify_show,
      notify_close: this._process_notify_close,
      "sound-data": this._process_sound_data,
      "clipboard-token": this._process_clipboard_token,
      "set-clipboard-enabled": this._process_set_clipboard_enabled,
      "clipboard-request": this._process_clipboard_request,
      "send-file": this._process_send_file,
      "ack-file-chunk": this._process_ack_file_chunk,
      "send-file-chunk": this._process_send_file_chunk,
      "open-url": this._process_open_url,
      "setting-change": this._process_setting_change,
      "pointer-position": this._process_pointer_position,
    };
  }

  on_connection_progress(state, details, progress) {
    //can be overriden
    this.clog(state, details);
  }

  callback_close(reason) {
    if (reason === undefined) {
      reason = "unknown reason";
    }
    this.clog("connection closed: " + reason);
  }

  connect() {
    let details = this.host + ":" + this.port + this.path;
    if (this.ssl) {
      details += " with ssl";
    }
    this.on_connection_progress("Connecting to server", details, 40);
    // open the web socket, started it in a worker if available
    // check we have enough information for encryption
    if (
      this.encryption &&
      (!this.encryption_key || this.encryption_key == "")
    ) {
      this.callback_close("no key specified for encryption");
      return;
    }
    this.initialize_workers();
  }

  initialize_workers() {
    const safe_encodings = [
      "jpeg",
      "png",
      "png/P",
      "png/L",
      "rgb",
      "rgb32",
      "rgb24",
      "scroll",
      "void",
    ];
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
    const worker = new Worker("js/lib/wsworker_check.js");
    worker.addEventListener(
      "message",
      (e) => {
        const data = e.data;
        switch (data["result"]) {
          case true:
            // yey, we can use websocket in worker!
            this.clog("we can use websocket in webworker");
            this._do_connect(true);
            break;
          case false:
            this.clog(
              "we can't use websocket in webworker, won't use webworkers"
            );
            this._do_connect(false);
            break;
          default:
            this.clog("client got unknown message from worker");
            this._do_connect(false);
        }
      },
      false
    );
    // ask the worker to check for websocket support, when we receive a reply
    // through the eventlistener above, _do_connect() will finish the job
    worker.postMessage({ cmd: "check" });

    if (!DECODE_WORKER) {
      this.supported_encodings = safe_encodings;
      this.decode_worker = false;
      return;
    }
    let decode_worker;
    if (this.offscreen_api) {
      this.clog("using offscreen decode worker");
      decode_worker = new Worker("js/OffscreenDecodeWorker.js");
    } else {
      this.clog("using decode worker");
      decode_worker = new Worker("js/DecodeWorker.js");
    }
    decode_worker.addEventListener(
      "message",
      (e) => {
        const data = e.data;
        if (data["draw"]) {
          this.do_process_draw(data["draw"], data["start"]);
          return;
        }
        if (data["error"]) {
          const msg = data["error"],
            packet = data["packet"],
            wid = packet[1],
            width = packet[2],
            height = packet[3],
            coding = packet[6],
            packet_sequence = packet[8];
          this.clog(
            "decode error on ",
            coding,
            "packet sequence",
            packet_sequence,
            ":",
            msg
          );
          if (!this.offscreen_api) {
            this.clog(" pixel data:", packet[7]);
          }
          this.do_send_damage_sequence(
            packet_sequence,
            wid,
            width,
            height,
            -1,
            msg
          );
          return;
        }
        switch (data["result"]) {
          case true: {
            const formats = Array.from(data["formats"]);
            this.clog("we can decode using a worker:", decode_worker);
            this.supported_encodings = formats;
            this.clog(
              "full list of supported encodings:",
              this.supported_encodings
            );
            this.decode_worker = decode_worker;
            break;
          }
          case false:
            this.clog("we can't decode using a worker: " + data["errors"]);
            this.decode_worker = false;
            break;
          default:
            this.clog("client got unknown message from the decode worker");
            this.decode_worker = false;
        }
      },
      false
    );
    this.clog("decode worker will check:", this.check_encodings);
    decode_worker.postMessage({
      cmd: "check",
      encodings: this.check_encodings,
    });
  }

  _do_connect(with_worker) {
    if (with_worker && !XPRA_CLIENT_FORCE_NO_WORKER) {
      this.protocol = new XpraProtocolWorkerHost();
    } else {
      this.protocol = new XpraProtocol();
    }
    this.open_protocol();
  }

  open_protocol() {
    // set protocol to deliver packets to our packet router
    this.protocol.set_packet_handler((packet) => this._route_packet(packet));
    // make uri
    let uri = "ws://";
    if (this.ssl) uri = "wss://";
    uri += this.host;
    if (this.port) uri += ":" + this.port;
    uri += this.path;
    // do open
    this.uri = uri;
    this.on_connection_progress("Opening WebSocket connection", uri, 50);
    this.protocol.open(uri);
  }

  request_refresh(wid) {
    this.send([
      "buffer-refresh",
      wid,
      0,
      100,
      {
        "refresh-now": true,
        batch: { reset: true },
      },
      {}, //no client_properties
    ]);
  }

  redraw_windows() {
    for (const i in this.id_to_window) {
      const iwin = this.id_to_window[i];
      this.request_redraw(iwin);
    }
  }

  close_windows() {
    for (const i in this.id_to_window) {
      const iwin = this.id_to_window[i];
      window.removeWindowListItem(i);
      iwin.destroy();
    }
  }

  close_protocol() {
    this.connected = false;
    if (this.protocol) {
      this.protocol.close();
      this.protocol = null;
    }
  }

  clear_timers() {
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
  }

  set_encoding(encoding) {
    // add an encoding to our hello.encodings list
    this.clog("encoding:", encoding);
    this.encoding = encoding;
  }

  _route_packet(packet) {
    // ctx refers to `this` because we came through a callback
    const packet_type = Utilities.s(packet[0]);
    this.debug("network", "received a", packet_type, "packet");
    const fn = this.packet_handlers[packet_type];
    if (fn == undefined) {
      this.cerror("no packet handler for ", packet_type);
      this.clog(packet);
    } else {
      fn.call(this, packet);
    }
  }

  _screen_resized(event) {
    // send the desktop_size packet so server knows we changed size
    if (!this.connected) {
      return;
    }
    if (
      this.container.clientWidth == this.desktop_width &&
      this.container.clientHeight == this.desktop_height
    ) {
      return;
    }
    this.desktop_width = this.container.clientWidth;
    this.desktop_height = this.container.clientHeight;
    const newsize = [this.desktop_width, this.desktop_height];
    const packet = [
      "desktop_size",
      newsize[0],
      newsize[1],
      this._get_screen_sizes(),
    ];
    this.send(packet);
    // call the screen_resized function on all open windows
    for (const i in this.id_to_window) {
      const iwin = this.id_to_window[i];
      iwin.screen_resized();

      // Force fullscreen on a a given window name from the provided settings
      if (
        default_settings !== undefined &&
        default_settings.auto_fullscreen !== undefined &&
        default_settings.auto_fullscreen.length > 0
      ) {
        var pattern = new RegExp(
          ".*" + default_settings.auto_fullscreen + ".*"
        );
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
  }

  /**
   * Keyboard
   */
  init_keyboard() {
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
    document.addEventListener("keydown", (e) => {
      const preview_el = $("#window_preview");

      if (e.code === "Escape") {
        if (preview_el.is(":visible")) {
          client.toggle_window_preview();

          return e.stopPropagation() || e.preventDefault();
        }
      }
      if (e.code === "Tab") {
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
            setTimeout(() => {
              slick.goTo(next_index, true);
            }, 10);
          });
          return e.stopPropagation() || e.preventDefault();
        }
      }
      const r = this._keyb_onkeydown(e);
      if (!r) {
        e.preventDefault();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Tab" || e.code.startsWith("Alt")) {
        if ($("#window_preview").is(":visible")) {
          if (e.code.startsWith("Alt")) {
            client.toggle_window_preview();
          }
          return e.stopPropagation() || e.preventDefault();
        }
      }
      const r = this._keyb_onkeyup(e);
      if (!r) {
        e.preventDefault();
      }
    });
  }

  query_keyboard_map() {
    var keyboard = navigator.keyboard;
    this.keyboard_map = {};
    if (!navigator.keyboard) {
      return;
    }
    keyboard.getLayoutMap().then((keyboardLayoutMap) => {
      clog("got a keyboard layout map:", keyboardLayoutMap);
      clog("keys:", Array.from(keyboardLayoutMap.keys()));
      for (const key of keyboardLayoutMap.keys()) {
        const value = keyboardLayoutMap[key];
        cdebug("keyboard", key, "=", value);
        this.keyboard_map[key] = value;
      }
    });
    if (keyboard.addEventListener) {
      keyboard.addEventListener("layoutchange", () =>
        this.clog("keyboard layout has changed!")
      );
    }
  }

  _keyb_get_modifiers(event) {
    /**
     * Returns the modifiers set for the current event.
     * We get the list of modifiers using "get_event_modifiers"
     * then we translate them.
     */
    //convert generic modifiers "meta" and "alt" into their x11 name:
    const modifiers = get_event_modifiers(event);
    return this.translate_modifiers(modifiers);
  }

  translate_modifiers(modifiers) {
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
    if (index >= 0 && meta) new_modifiers[index] = meta;
    index = modifiers.indexOf("control");
    if (index >= 0 && control) new_modifiers[index] = control;
    index = modifiers.indexOf("alt");
    if (index >= 0 && alt) new_modifiers[index] = alt;
    index = modifiers.indexOf("numlock");
    if (index >= 0) {
      if (this.num_lock_modifier) {
        new_modifiers[index] = this.num_lock_modifier;
      } else {
        new_modifiers.splice(index, 1);
      }
    }
    index = modifiers.indexOf("capslock");
    if (index >= 0) {
      new_modifiers[index] = "lock";
    }

    //add altgr?
    if (this.altgr_state && altgr && !new_modifiers.includes(altgr)) {
      new_modifiers.push(altgr);
      //remove spurious modifiers:
      index = new_modifiers.indexOf(alt);
      if (index >= 0) new_modifiers.splice(index, 1);
      index = new_modifiers.indexOf(control);
      if (index >= 0) new_modifiers.splice(index, 1);
    }
    return new_modifiers;
  }

  _check_browser_language(key_layout) {
    /**
     * This function may send the new detected keyboard layout.
     * (ignoring the keyboard_layout preference)
     */
    const now = performance.now();
    if (now < this.browser_language_change_embargo_time) {
      return;
    }
    let new_layout;
    if (key_layout) {
      new_layout = key_layout;
    } else {
      //we may have used a different layout for a specific key,
      //and now this new key doesn't need it anymore,
      //so we may want to switch back to the original layout:
      const l = Utilities.getFirstBrowserLanguage();
      if (l && this.browser_language != l) {
        //if the browser language has changed,
        //this takes precedence over the configuration
        this.clog(
          "browser language changed from",
          this.browser_language,
          "to",
          l
        );
        this.browser_language = l;
        new_layout = Utilities.getKeyboardLayout();
      } else {
        //this will honour the setting supplied by the user on the connect page
        //or default to Utilities.getKeyboardLayout()
        new_layout = this._get_keyboard_layout() || "us";
      }
    }
    if (new_layout != null && this.key_layout != new_layout) {
      this.key_layout = new_layout;
      this.clog(
        "keyboard layout changed from",
        this.key_layout,
        "to",
        key_layout
      );
      this.send(["layout-changed", new_layout, ""]);
      //changing the language too quickly can cause problems server side,
      //wait a bit before checking again:
      this.browser_language_change_embargo_time = now + 1000;
    } else {
      //check again after 100ms minimum
      this.browser_language_change_embargo_time = now + 100;
    }
  }

  _keyb_process(pressed, event) {
    // MSIE hack
    return this.do_keyb_process(pressed, event || window.event);
  }

  do_keyb_process(pressed, event) {
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
    if (keycode == 229) {
      //this usually fires when we have received the event via "oninput" already
      return;
    }
    let str = event.key || String.fromCharCode(keycode);
    let unpress_now = false;
    this.debug(
      "keyboard",
      "last keycode pressed=",
      this.last_keycode_pressed,
      ", keycode=",
      keycode,
      ", pressed=",
      pressed,
      ", str=",
      str
    );
    const dead = str.toLowerCase() == "dead";
    if (
      dead &&
      ((this.last_keycode_pressed != keycode && !pressed) || pressed)
    ) {
      //dead key unpress without first getting a key pressed event,
      //or just a regular pressed dead key, in both cases send a pair:
      pressed = true;
      unpress_now = true;
    }

    if (pressed) {
      this.last_keycode_pressed = keycode;
    } else {
      this.last_keycode_pressed = 0;
    }

    this.debug(
      "keyboard",
      "processKeyEvent(",
      pressed,
      ", ",
      event,
      ") key=",
      keyname,
      "keycode=",
      keycode,
      "dead=",
      dead
    );

    //sync numlock
    if (keycode == 144 && pressed) {
      this.num_lock = !this.num_lock;
    }

    let key_language = null;
    //some special keys are better mapped by name:
    const map_str = this.keyboard_map[keyname];
    if (dead && map_str && map_str in DEAD_KEYS) {
      keyname = DEAD_KEYS[map_str];
      str = map_str;
      this.debug("keyboard", "dead key:", keyname);
    } else if (keyname in KEY_TO_NAME) {
      keyname = KEY_TO_NAME[keyname];
    } else if (keyname == "" && str in KEY_TO_NAME) {
      keyname = KEY_TO_NAME[str];
    }
    //special case for numpad,
    //try to distinguish arrowpad and numpad:
    //(for arrowpad, keyname==str)
    else if (keyname != str && str in NUMPAD_TO_NAME) {
      keyname = NUMPAD_TO_NAME[str];
      this.num_lock = "0123456789.".includes(keyname);
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
      if (
        event.getModifierState &&
        event.getModifierState("Shift") &&
        keycode in CHARCODE_TO_NAME_SHIFTED
      ) {
        keyname = CHARCODE_TO_NAME_SHIFTED[keycode];
      }
    }

    this._check_browser_language(key_language);

    const DOM_KEY_LOCATION_RIGHT = 2;
    if (keyname.match("_L$") && event.location == DOM_KEY_LOCATION_RIGHT)
      keyname = keyname.replace("_L", "_R");

    //AltGr: keep track of pressed state
    if (
      str == "AltGraph" ||
      (keyname == "Alt_R" && (Utilities.isWindows() || Utilities.isMacOS())) ||
      (keyname == "Alt_L" && Utilities.isMacOS())
    ) {
      this.altgr_state = pressed;
      keyname = "ISO_Level3_Shift";
      str = "AltGraph";
    }

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
      if (keyname == "Control_L") {
        keyname = "Meta_L";
        str = "meta";
      } else if (keyname == "Meta_L") {
        keyname = "Control_L";
        str = "control";
      } else if (keyname == "Control_R") {
        keyname = "Meta_R";
        str = "meta";
      } else if (keyname == "Meta_R") {
        keyname = "Control_R";
        str = "control";
      }
    }

    //macos will swallow the key release event if the meta modifier is pressed,
    //so simulate one immediately:
    if (
      pressed &&
      Utilities.isMacOS() &&
      raw_modifiers.includes("meta") &&
      ostr != "meta"
    ) {
      unpress_now = true;
    }

    let allow_default = false;
    if (this.clipboard_enabled && client.clipboard_direction !== "to-server") {
      //allow some key events that need to be seen by the browser
      //for handling the clipboard:
      let clipboard_modifier_keys = [
        "Control_L",
        "Control_R",
        "Shift_L",
        "Shift_R",
      ];
      let clipboard_modifier = "control";
      if (Utilities.isMacOS()) {
        //Apple does things differently, as usual:
        clipboard_modifier_keys = ["Meta_L", "Meta_R", "Shift_L", "Shift_R"];
        clipboard_modifier = "meta";
      }
      //let the OS see Control (or Meta on macos) and Shift:
      if (clipboard_modifier_keys.indexOf(keyname) >= 0) {
        this.debug(
          "keyboard",
          "passing clipboard modifier key event to browser:",
          keyname
        );
        allow_default = true;
      }
      //let the OS see Shift + Insert:
      if (shift && keyname == "Insert") {
        this.debug(
          "keyboard",
          "passing clipboard combination Shift+Insert to browser"
        );
        allow_default = true;
      }
      const clipboard_mod_set = raw_modifiers.includes(clipboard_modifier);
      if (clipboard_mod_set) {
        const l = keyname.toLowerCase();
        if (l == "c" || l == "x" || l == "v") {
          this.debug(
            "keyboard",
            "passing clipboard combination to browser:",
            clipboard_modifier,
            "+",
            keyname
          );
          allow_default = true;
          if (l == "v") {
            this.clipboard_delayed_event_time =
              performance.now() + CLIPBOARD_EVENT_DELAY;
          }
        }
      }
    }

    if (this.topwindow != null) {
      let packet = [
        "key-action",
        this.topwindow,
        keyname,
        pressed,
        modifiers,
        keyval,
        str,
        keycode,
        group,
      ];
      this.key_packets.push(packet);
      if (unpress_now) {
        packet = [
          "key-action",
          this.topwindow,
          keyname,
          false,
          modifiers,
          keyval,
          str,
          keycode,
          group,
        ];
        this.key_packets.push(packet);
      }

      //if there is a chance that we're in the process of handling
      //a clipboard event (a click or control-v)
      //then we send with a slight delay:
      let delay = 0;
      const now = performance.now();
      if (this.clipboard_delayed_event_time > now) {
        delay = this.clipboard_delayed_event_time - now;
      }
      const me = this;
      setTimeout(() => {
        while (this.key_packets.length > 0) {
          var key_packet = me.key_packets.shift();
          this.last_key_packet = key_packet;
          this.send(key_packet);
        }
      }, delay);
    }
    if (keyname == "F11") {
      this.debug("keyboard", "allowing default handler for", keyname);
      allow_default = true;
    }
    return allow_default;
  }

  _keyb_onkeydown(event) {
    return this._keyb_process(true, event);
  }
  _keyb_onkeyup(event) {
    return this._keyb_process(false, event);
  }

  _get_keyboard_layout() {
    this.debug(
      "keyboard",
      "_get_keyboard_layout() keyboard_layout=",
      this.keyboard_layout
    );
    if (this.keyboard_layout) return this.keyboard_layout;
    return Utilities.getKeyboardLayout();
  }

  _get_keycodes() {
    //keycodes.append((nn(keyval), nn(name), nn(keycode), nn(group), nn(level)))
    const keycodes = [];
    let kc;
    for (const keycode in CHARCODE_TO_NAME) {
      kc = parseInt(keycode);
      keycodes.push([kc, CHARCODE_TO_NAME[keycode], kc, 0, 0]);
    }
    return keycodes;
  }

  _get_desktop_size() {
    return [this.desktop_width, this.desktop_height];
  }

  _get_DPI() {
    "use strict";
    const dpi_div = document.getElementById("dpi");
    if (dpi_div != undefined) {
      if (dpi_div.offsetWidth > 0 && dpi_div.offsetHeight > 0)
        return Math.round((dpi_div.offsetWidth + dpi_div.offsetHeight) / 2.0);
    }
    //alternative:
    if ("deviceXDPI" in screen)
      return (screen.systemXDPI + screen.systemYDPI) / 2;
    //default:
    return 96;
  }

  _get_screen_sizes() {
    const dpi = this._get_DPI();
    const screen_size = [
      this.container.clientWidth,
      this.container.clientHeight,
    ];
    const wmm = Math.round((screen_size[0] * 25.4) / dpi);
    const hmm = Math.round((screen_size[1] * 25.4) / dpi);
    const monitor = ["Canvas", 0, 0, screen_size[0], screen_size[1], wmm, hmm];
    const screen = [
      "HTML",
      screen_size[0],
      screen_size[1],
      wmm,
      hmm,
      [monitor],
      0,
      0,
      screen_size[0],
      screen_size[1],
    ];
    //just a single screen:
    return [screen];
  }

  _update_capabilities(appendobj) {
    for (const attr in appendobj) {
      this.capabilities[attr] = appendobj[attr];
    }
  }

  /**
   * Ping
   */
  _check_server_echo(ping_sent_time) {
    const last = this.server_ok;
    this.server_ok = this.last_ping_echoed_time >= ping_sent_time;
    if (last != this.server_ok) {
      if (!this.server_ok) {
        this.clog("server connection is not responding, drawing spinners...");
      } else {
        this.clog("server connection is OK");
      }
      for (const i in this.id_to_window) {
        const iwin = this.id_to_window[i];
        iwin.set_spinner(this.server_ok);
      }
    }
  }

  _check_echo_timeout(ping_time) {
    if (this.reconnect_in_progress) {
      return;
    }
    if (
      this.last_ping_echoed_time > 0 &&
      this.last_ping_echoed_time < ping_time
    ) {
      if (this.reconnect && this.reconnect_attempt < this.reconnect_count) {
        this.warn("ping timeout - reconnecting");
        this.reconnect_attempt++;
        this.do_reconnect();
      } else {
        // no point in telling the server here...
        this.callback_close(
          "server ping timeout, waited " +
            this.PING_TIMEOUT +
            "ms without a response"
        );
      }
    }
  }

  _emit_event(event_type) {
    const event = document.createEvent("Event");
    event.initEvent(event_type, true, true);
    document.dispatchEvent(event);
  }
  emit_connection_lost(event_type) {
    this._emit_event("connection-lost");
  }
  emit_connection_established(event_type) {
    this._emit_event("connection-established");
  }

  /**
   * Hello
   */
  _send_hello(counter) {
    if (this.decode_worker == null) {
      counter = counter || 0;
      if (counter == 0) {
        this.on_connection_progress("Waiting for decode worker", "", 90);
        this.clog("waiting for decode worker to finish initializing");
      } else if (counter > 100) {
        //we have waited 10 seconds or more...
        //continue without:
        this.do_send_hello(null, null);
      }
      //try again later:
      setTimeout(() => this._send_hello(counter + 1), 100);
    } else {
      this.do_send_hello(null, null);
    }
  }

  do_send_hello(challenge_response, client_salt) {
    // make the base hello
    this._make_hello_base();
    // handle a challenge if we need to
    if (this.passwords.length > 0 && !challenge_response) {
      // tell the server we expect a challenge (this is a partial hello)
      this.capabilities["challenge"] = true;
      this.clog("sending partial hello");
    } else {
      this.clog("sending hello");
      // finish the hello
      this._make_hello();
    }
    if (challenge_response) {
      this._update_capabilities({
        challenge_response: challenge_response,
      });
      if (client_salt) {
        this._update_capabilities({
          challenge_client_salt: client_salt,
        });
      }
    }
    this.clog("sending hello capabilities", this.capabilities);
    // verify:
    for (const key in this.capabilities) {
      if (key == null) {
        throw new Error("invalid null key in hello packet data");
      }
      const value = this.capabilities[key];
      if (value == null) {
        throw new Error(
          "invalid null value for key " + key + " in hello packet data"
        );
      }
    }
    // send the packet
    this.send(["hello", this.capabilities]);
  }

  _make_hello_base() {
    this.capabilities = {};
    const digests = ["hmac", "hmac+md5", "xor", "keycloak"];
    if (typeof forge !== "undefined") {
      try {
        this.debug("network", "forge.md.algorithms=", forge.md.algorithms);
        for (const hash in forge.md.algorithms) {
          digests.push("hmac+" + hash);
        }
        this.debug("network", "digests:", digests);
      } catch (e) {
        this.cerror("Error probing forge crypto digests");
      }
    } else {
      this.clog("cryptography library 'forge' not found");
    }
    this._update_capabilities({
      // version and platform
      version: Utilities.VERSION,
      "build.revision": Utilities.REVISION,
      "build.local_modifications": Utilities.LOCAL_MODIFICATIONS,
      "build.branch": Utilities.BRANCH,
      platform: Utilities.getPlatformName(),
      "platform.name": Utilities.getPlatformName(),
      "platform.processor": Utilities.getPlatformProcessor(),
      "platform.platform": navigator.appVersion,
      "session-type": Utilities.getSimpleUserAgentString(),
      "session-type.full": navigator.userAgent,
      namespace: true,
      "clipboard.contents-slice-fix": true,
      share: this.sharing,
      steal: this.steal,
      client_type: "HTML5",
      "websocket.multi-packet": true,
      "setting-change": true,
      username: this.username,
      display: this.server_display || "",
      uuid: this.uuid,
      argv: [window.location.href],
      digest: digests,
      "salt-digest": digests,
      //compression bits:
      zlib: true,
      compression_level: 1,
      "mouse.show": true,
      // packet encoders
      //don't enable plain rencode (too many problems with bytes and strings)
      //"rencode" 					: rencode_ok,
      rencodeplus: rencode_ok,
      bencode: true,
      yaml: false,
      "open-url": this.open_url,
      "ping-echo-sourceid": true,
      vrefresh: this.vrefresh,
    });
    if (rencode_ok) {
      this._update_capabilities({
        "file-chunks": FILE_CHUNKS_SIZE,
      });
    }
    if (SHOW_START_MENU) {
      this._update_capabilities({
        "xdg-menu-update": true,
      });
    }
    if (this.bandwidth_limit > 0) {
      this._update_capabilities({
        "bandwidth-limit": this.bandwidth_limit,
      });
    }
    const ci = Utilities.getConnectionInfo();
    if (ci) {
      this._update_capabilities({
        "connection-data": ci,
      });
    }
    if (lz4.decode) {
      this._update_capabilities({
        lz4: true,
        "encoding.rgb_lz4": true,
      });
    }

    if (typeof BrotliDecode != "undefined" && !Utilities.isIE()) {
      this._update_capabilities({
        brotli: true,
      });
    }

    this._update_capabilities({
      "clipboard.preferred-targets": this.clipboard_targets,
    });

    if (this.encryption) {
      const enc = this.encryption.split("-")[0];
      if (enc != "AES") {
        throw "invalid encryption specified: '" + enc + "'";
      }
      const mode = this.encryption.split("-")[1] || "CBC";
      this.cipher_in_caps = {
        cipher: enc,
        "cipher.mode": mode,
        "cipher.iv": Utilities.getSecureRandomString(16),
        "cipher.key_salt": Utilities.getSecureRandomString(32),
        "cipher.key_size": 32, //256 bits
        "cipher.key_hash": "SHA1",
        "cipher.key_stretch_iterations": 1000,
        "cipher.padding.options": ["PKCS#7"],
      };
      this._update_capabilities(this.cipher_in_caps);
      this.protocol.set_cipher_in(this.cipher_in_caps, this.encryption_key);
    }
    if (this.start_new_session) {
      this._update_capabilities({
        "start-new-session": this.start_new_session,
      });
    }
  }

  _make_hello() {
    let selections;
    if (
      navigator.clipboard &&
      navigator.clipboard.readText &&
      navigator.clipboard.writeText
    ) {
      //we don't need the primary contents,
      //we can use the async clipboard
      selections = ["CLIPBOARD"];
      this.log("using new navigator.clipboard");
    } else {
      selections = ["CLIPBOARD", "PRIMARY"];
      this.log("legacy clipboard");
    }
    this.desktop_width = this.container.clientWidth;
    this.desktop_height = this.container.clientHeight;
    this.key_layout = this._get_keyboard_layout();
    if (this.supported_encodings.indexOf("scroll") > 0) {
      //support older servers which use a capability for enabling 'scroll' encoding:
      this._update_capabilities({
        "encoding.scrolling": true,
        "encoding.scrolling.min-percent": 50,
        "encoding.scrolling.preference": 20,
      });
    }
    this._update_capabilities({
      auto_refresh_delay: 500,
      randr_notify: true,
      "sound.server_driven": true,
      "server-window-resize": true,
      "screen-resize-bigger": false,
      "metadata.supported": [
        "fullscreen",
        "maximized",
        "iconic",
        "above",
        "below",
        "title",
        "size-hints",
        "class-instance",
        "transient-for",
        "window-type",
        "has-alpha",
        "decorations",
        "override-redirect",
        "tray",
        "modal",
        "opacity",
      ],
      encoding: this.encoding,
      encodings: this.supported_encodings,
      "encoding.icons.max_size": [30, 30],
      "encodings.core": this.supported_encodings,
      "encodings.rgb_formats": this.RGB_FORMATS,
      "encodings.window-icon": ["png"],
      "encodings.cursor": ["png"],
      "encoding.flush": true,
      "encoding.transparency": true,
      "encoding.decoder-speed": { video: 0 },
      "encodings.packet": true,
      //skipping some keys
      //ie: "encoding.min-quality": 50,
      //ie: "encoding.min-speed": 80,
      //ie: "encoding.non-scroll": ["rgb32", "png", "jpeg"],
      //video stuff:
      "encoding.color-gamut": Utilities.getColorGamut(),
      "encoding.video_scaling": true,
      "encoding.video_max_size": [1024, 768],
      "encoding.eos": true,
      "encoding.full_csc_modes": {
        mpeg1: ["YUV420P"],
        h264: ["YUV420P"],
        "mpeg4+mp4": ["YUV420P"],
        "h264+mp4": ["YUV420P"],
        "vp8+webm": ["YUV420P"],
        webp: ["BGRX", "BGRA"],
        jpeg: [
          "BGRX",
          "BGRA",
          "BGR",
          "RGBX",
          "RGBA",
          "RGB",
          "YUV420P",
          "YUV422P",
          "YUV444P",
        ],
      },
      //this is a workaround for server versions between 2.5.0 to 2.5.2 only:
      "encoding.x264.YUV420P.profile": "baseline",
      "encoding.h264.YUV420P.profile": "baseline",
      "encoding.h264.YUV420P.level": "2.1",
      "encoding.h264.cabac": false,
      "encoding.h264.deblocking-filter": false,
      "encoding.h264.fast-decode": true,
      "encoding.h264+mp4.YUV420P.profile": "baseline",
      "encoding.h264+mp4.YUV420P.level": "3.0",
      //prefer native video in mp4/webm container to broadway plain h264:
      "encoding.h264.score-delta": -20,
      "encoding.h264+mp4.score-delta": 50,
      "encoding.h264+mp4.": 50,
      "encoding.mpeg4+mp4.score-delta": 40,
      "encoding.vp8+webm.score-delta": 40,

      "sound.receive": true,
      "sound.send": false,
      "sound.decoders": Object.keys(this.audio_codecs),
      "sound.bundle-metadata": true,
      // encoding stuff
      "encoding.rgb_zlib": true,
      windows: true,
      "window.pre-map": true,
      //partial support:
      keyboard: true,
      xkbmap_layout: this.key_layout,
      xkbmap_keycodes: this._get_keycodes(),
      xkbmap_print: "",
      xkbmap_query: "",
      desktop_size: [this.desktop_width, this.desktop_height],
      desktop_mode_size: [this.desktop_width, this.desktop_height],
      screen_sizes: this._get_screen_sizes(),
      dpi: this._get_DPI(),
      //not handled yet, but we will:
      clipboard: this.clipboard_enabled,
      "clipboard.want_targets": true,
      "clipboard.greedy": true,
      "clipboard.selections": selections,
      notifications: true,
      "notifications.close": true,
      "notifications.actions": true,
      cursors: true,
      bell: true,
      system_tray: true,
      //we cannot handle this (GTK only):
      named_cursors: false,
      // printing
      "file-transfer": this.file_transfer,
      printing: this.printing,
      "file-size-limit": 4 * 1024,
      flush: true,
    });
  }

  on_first_ui_event() {
    //this hook can be overriden
  }

  _new_ui_event() {
    if (this.ui_events == 0) {
      this.on_first_ui_event();
    }
    this.ui_events++;
  }

  /**
   * Mouse handlers
   */
  getMouse(e) {
    // get mouse position take into account scroll
    let mx = e.clientX + jQuery(document).scrollLeft();
    let my = e.clientY + jQuery(document).scrollTop();

    if (this.scale !== 1) {
      mx = Math.round(mx * this.scale);
      my = Math.round(my * this.scale);
    }

    // check last mouse position incase the event
    // hasn't provided it - bug #854
    if (isNaN(mx) || isNaN(my)) {
      if (!isNaN(this.last_mouse_x) && !isNaN(this.last_mouse_y)) {
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
    if ("which" in e)
      // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
      mbutton = Math.max(0, e.which);
    else if ("button" in e)
      // IE, Opera (zero based)
      mbutton = Math.max(0, e.button) + 1;

    // We return a simple javascript object (a hash) with x and y defined
    return { x: mx, y: my, button: mbutton };
  }

  on_mousedown(e) {
    this.mousedown_event = e;
    this.do_window_mouse_click(e, null, true);
    e.preventDefault();
    return false;
  }

  on_mouseup(e) {
    this.do_window_mouse_click(e, null, false);
    e.preventDefault();
    return false;
  }

  on_mousemove(e, window) {
    if (this.server_readonly || this.mouse_grabbed || !this.connected) {
      return false;
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
    e.preventDefault();
    return false;
  }

  release_buttons(e, window) {
    const mouse = this.getMouse(e),
      x = Math.round(mouse.x),
      y = Math.round(mouse.y),
      modifiers = this._keyb_get_modifiers(e),
      wid = window.wid,
      pressed = false;
    for (let button of this.buttons_pressed) {
      this.send_button_action(wid, button, pressed, x, y, modifiers);
    }
  }

  do_window_mouse_click(e, window, pressed) {
    if (this.server_readonly || this.mouse_grabbed || !this.connected) {
      return;
    }
    // Skip processing if clicked on float menu
    if (
      $(e.target).attr("id") === "float_menu" ||
      $(e.target).parents("#float_menu").length > 0
    ) {
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
    if (wid > 0 && this.focus != wid) {
      this._window_set_focus(window);
    }
    let button = mouse.button;
    let lbe = this.last_button_event;
    if (lbe[0] == button && lbe[1] == pressed && lbe[2] == x && lbe[3] == y) {
      //duplicate!
      this.debug("mouse", "skipping duplicate click event");
      return;
    }
    this.last_button_event = [button, pressed, x, y];
    this.debug("mouse", "click:", button, pressed, x, y);
    if (button == 4) {
      button = 8;
    } else if (button == 5) {
      button = 9;
    }
    setTimeout(() => {
      this.clipboard_delayed_event_time =
        performance.now() + CLIPBOARD_EVENT_DELAY;
      this.send_button_action(wid, button, pressed, x, y, modifiers);
    }, send_delay);
  }

  send_button_action(wid, button, pressed, x, y, modifiers) {
    const buttons = [];
    if (pressed) {
      this.buttons_pressed.add(button);
    } else {
      this.buttons_pressed.delete(button);
    }
    this.send([
      "button-action",
      wid,
      button,
      pressed,
      [x, y],
      modifiers,
      buttons,
    ]);
  }

  // Source: https://deepmikoto.com/coding/1--javascript-detect-mouse-wheel-direction
  detect_vertical_scroll_direction(e, window) {
    if (!e) {
      //IE? In any case, detection won't work:
      return 0;
    }
    let delta = null;
    if (e.wheelDelta) {
      // will work in most cases
      delta = e.wheelDelta;
    } else if (e.detail) {
      // fallback for Firefox
      delta = -e.detail;
    }
    if (delta == null) {
      return 0;
    }
    if (delta > 0) {
      return -1;
    }
    if (delta < 0) {
      return 1;
    }
    return 0;
  }

  on_mousescroll(e, window) {
    if (this.server_readonly || this.mouse_grabbed || !this.connected) {
      return false;
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
    if (
      this.scroll_reverse_y === true ||
      (this.scroll_reverse_x == "auto" &&
        this.detect_vertical_scroll_direction(e, window) < 0 &&
        py > 0)
    ) {
      py = -py;
    }
    const apx = Math.abs(px);
    const apy = Math.abs(py);
    if (this.server_precise_wheel) {
      if (apx > 0) {
        const btn_x = px >= 0 ? 6 : 7;
        const xdist = Math.round((px * 1000) / 120);
        this.send([
          "wheel-motion",
          wid,
          btn_x,
          -xdist,
          [x, y],
          modifiers,
          buttons,
        ]);
      }
      if (apy > 0) {
        const btn_y = py >= 0 ? 5 : 4;
        const ydist = Math.round((py * 1000) / 120);
        this.send([
          "wheel-motion",
          wid,
          btn_y,
          -ydist,
          [x, y],
          modifiers,
          buttons,
        ]);
      }
      return;
    }
    //generate a single event if we can, or add to accumulators:
    if (apx >= 40 && apx <= 160) {
      this.wheel_delta_x = px > 0 ? 120 : -120;
    } else {
      this.wheel_delta_x += px;
    }
    if (apy >= 40 && apy <= 160) {
      this.wheel_delta_y = py > 0 ? 120 : -120;
    } else {
      this.wheel_delta_y += py;
    }
    //send synthetic click+release as many times as needed:
    let wx = Math.abs(this.wheel_delta_x);
    let wy = Math.abs(this.wheel_delta_y);
    const btn_x = this.wheel_delta_x >= 0 ? 6 : 7;
    const btn_y = this.wheel_delta_y >= 0 ? 5 : 4;
    while (wx >= 120) {
      wx -= 120;
      this.send([
        "button-action",
        wid,
        btn_x,
        true,
        [x, y],
        modifiers,
        buttons,
      ]);
      this.send([
        "button-action",
        wid,
        btn_x,
        false,
        [x, y],
        modifiers,
        buttons,
      ]);
    }
    while (wy >= 120) {
      wy -= 120;
      this.send([
        "button-action",
        wid,
        btn_y,
        true,
        [x, y],
        modifiers,
        buttons,
      ]);
      this.send([
        "button-action",
        wid,
        btn_y,
        false,
        [x, y],
        modifiers,
        buttons,
      ]);
    }
    //store left overs:
    this.wheel_delta_x = this.wheel_delta_x >= 0 ? wx : -wx;
    this.wheel_delta_y = this.wheel_delta_y >= 0 ? wy : -wy;
    e.preventDefault();
    return false;
  }

  init_clipboard() {
    window.addEventListener("paste", (e) => {
      let clipboardData = (e.originalEvent || e).clipboardData;
      //IE: must use window.clipboardData because the event clipboardData is null!
      if (!clipboardData) {
        clipboardData = window.clipboardData;
      }
      if (clipboardData && clipboardData.files) {
        const files = clipboardData.files;
        this.clog("paste got", files.length, "files");
        for (let i = 0; i < files.length; i++) {
          let file = files.item(i);
          this.send_file(file);
        }
        e.preventDefault();
        return;
      }
      let paste_data;
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(
          (text) => {
            this.cdebug("clipboard", "paste event, text=", text);
            const paste_data = unescape(encodeURIComponent(text));
            this.clipboard_buffer = paste_data;
            this.send_clipboard_token(paste_data);
          },
          (err) => this.cdebug("clipboard", "paste event failed:", err)
        );
      } else {
        let datatype = "text/plain";
        if (Utilities.isIE()) {
          datatype = "Text";
        }
        paste_data = unescape(
          encodeURIComponent(clipboardData.getData(datatype))
        );
        cdebug("clipboard", "paste event, data=", paste_data);
        this.clipboard_buffer = paste_data;
        this.send_clipboard_token(paste_data);
      }
    });
    window.addEventListener("copy", (e) => {
      const clipboard_buffer = this.get_clipboard_buffer();
      const pasteboard = $("#pasteboard");
      pasteboard.text(decodeURIComponent(escape(clipboard_buffer)));
      pasteboard.select();
      this.cdebug(
        "clipboard",
        "copy event, clipboard buffer=",
        clipboard_buffer
      );
      this.clipboard_pending = false;
    });
    window.addEventListener("cut", (e) => {
      const clipboard_buffer = this.get_clipboard_buffer();
      const pasteboard = $("#pasteboard");
      pasteboard.text(decodeURIComponent(escape(clipboard_buffer)));
      pasteboard.select();
      this.cdebug(
        "clipboard",
        "cut event, clipboard buffer=",
        clipboard_buffer
      );
      this.clipboard_pending = false;
    });
    $("#screen").on("click", (e) => this.may_set_clipboard());
    $("#screen").keypress(() => this.may_set_clipboard());
  }

  may_set_clipboard(e) {
    this.cdebug(
      "clipboard",
      "pending=",
      this.clipboard_pending,
      "buffer=",
      this.clipboard_buffer
    );
    if (!this.clipboard_pending) {
      return;
    }
    let clipboard_buffer = this.get_clipboard_buffer();
    const clipboard_datatype = (
      this.get_clipboard_datatype() || ""
    ).toLowerCase();
    const is_text =
      clipboard_datatype.indexOf("text") >= 0 ||
      clipboard_datatype.indexOf("string") >= 0;
    if (!is_text) {
      //maybe just abort here instead?
      clipboard_buffer = "";
    }
    const pasteboard = $("#pasteboard");
    pasteboard.text(clipboard_buffer);
    pasteboard.select();
    this.cdebug(
      "clipboard",
      "click event, with pending clipboard datatype=",
      clipboard_datatype,
      ", buffer=",
      clipboard_buffer
    );
    //for IE:
    let success = false;
    if (
      {}.hasOwnProperty.call(window, "clipboardData") &&
      {}.hasOwnProperty.call(window.clipboardData, "setData") &&
      typeof window.clipboardData.setData === "function"
    ) {
      try {
        if (Utilities.isIE()) {
          window.clipboardData.setData("Text", clipboard_buffer);
        } else {
          window.clipboardData.setData(clipboard_datatype, clipboard_buffer);
        }
        success = true;
      } catch (e) {
        success = false;
      }
    }
    if (!success && is_text) {
      success = document.execCommand("copy");
    } else {
      //probably no point in trying again?
    }
    if (success) {
      //clipboard_buffer may have been cleared if not set to text:
      this.clipboard_buffer = clipboard_buffer;
      this.clipboard_pending = false;
    }
  }

  _poll_clipboard(e) {
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
    if (raw_clipboard_buffer === null) {
      return false;
    }
    const clipboard_buffer = unescape(encodeURIComponent(raw_clipboard_buffer));
    this.debug("clipboard", "paste event, data=", clipboard_buffer);
    if (clipboard_buffer == this.clipboard_buffer) {
      return false;
    }
    this.debug("clipboard", "clipboard contents have changed");
    this.clipboard_buffer = clipboard_buffer;
    this.send_clipboard_token(clipboard_buffer);
    this.clipboard_delayed_event_time =
      performance.now() + CLIPBOARD_EVENT_DELAY;
    return true;
  }

  read_clipboard_text() {
    if (this.clipboard_enabled === false) {
      return;
    }
    client.debug("clipboard", "read_clipboard_text()");
    //warning: this can take a while,
    //so we may send the click before the clipboard contents...
    navigator.clipboard.readText().then(
      (text) => {
        this.debug("clipboard", "paste event, text=", text);
        const clipboard_buffer = unescape(encodeURIComponent(text));
        if (clipboard_buffer != this.clipboard_buffer) {
          this.debug("clipboard", "clipboard contents have changed");
          this.clipboard_buffer = clipboard_buffer;
          this.send_clipboard_token(clipboard_buffer);
          this.clipboard_delayed_event_time =
            performance.now() + CLIPBOARD_EVENT_DELAY;
        }
        this.clipboard_pending = false;
      },
      function (err) {
        this.debug("clipboard", "paste event failed:", err);
        this.clipboard_pending = false;
      }
    );
  }

  /**
   * Focus
   */
  _window_set_focus(win) {
    if (win == null || this.server_readonly || !this.connected) {
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
    if (this.focus == wid) {
      return;
    }

    // Keep DESKTOP-type windows per default setttings lower than all other windows.
    // Only allow focus if all other windows are minimized.
    if (
      default_settings !== undefined &&
      default_settings.auto_fullscreen_desktop_class !== undefined &&
      default_settings.auto_fullscreen_desktop_class.length > 0
    ) {
      var auto_fullscreen_desktop_class =
        default_settings.auto_fullscreen_desktop_class;
      if (
        win.windowtype == "DESKTOP" &&
        win.metadata["class-instance"].includes(auto_fullscreen_desktop_class)
      ) {
        for (let i in this.id_to_window) {
          const iwin = this.id_to_window[i];
          if (iwin.wid != win.wid && !iwin.minimized) {
            return;
          }
        }
      }
    }

    const top_stacking_layer = Object.keys(this.id_to_window).length;
    const old_stacking_layer = win.stacking_layer;
    const had_focus = this.focus;
    this.focus = wid;
    this.topwindow = wid;
    this.send(["focus", wid, []]);
    //set the focused flag on the window specified,
    //adjust stacking order:
    let iwin = null;
    for (const i in this.id_to_window) {
      iwin = this.id_to_window[i];
      iwin.focused = iwin.wid == wid;
      if (iwin.focused) {
        iwin.stacking_layer = top_stacking_layer;
        this.send_configure_window(iwin, { focused: true }, true);
      } else {
        //move it down to fill the gap:
        if (iwin.stacking_layer > old_stacking_layer) {
          iwin.stacking_layer--;
        }
        if (had_focus == i) {
          this.send_configure_window(iwin, { focused: false }, true);
        }
      }
      iwin.updateFocus();
      iwin.update_zindex();
    }
  }

  /*
   * detect DESKTOP-type window from settings
   */
  is_window_desktop(win) {
    if (
      default_settings !== undefined &&
      default_settings.auto_fullscreen_desktop_class !== undefined &&
      default_settings.auto_fullscreen_desktop_class.length > 0
    ) {
      var auto_fullscreen_desktop_class =
        default_settings.auto_fullscreen_desktop_class;
      if (
        win.windowtype == "DESKTOP" &&
        win.metadata["class-instance"].includes(auto_fullscreen_desktop_class)
      ) {
        return true;
      }
    }
    return false;
  }

  /*
   * Show/Hide the window preview list
   */
  toggle_window_preview(init_cb) {
    const preview_element = $("#window_preview");

    preview_element.on("init", (e, slick) => {
      if (init_cb) {
        init_cb(e, slick);
      }
    });

    preview_element.on("afterChange", (event, slick, currentSlide) => {
      const wid = $(".slick-current .window-preview-item-container").data(
        "wid"
      );
      if (!this.id_to_window[wid].minimized) {
        this._window_set_focus(this.id_to_window[wid]);
      }
    });

    $(window).on("click", this._handle_window_list_blur);
    $(window).on("contextmenu", this._handle_window_list_blur);

    if (preview_element.is(":visible")) {
      // Restore the current selection if it's minimized.
      const wid = $(".slick-current .window-preview-item-container").data(
        "wid"
      );
      this.clog("current wid: " + wid);
      if (client.id_to_window[wid].minimized) {
        this._window_set_focus(this.id_to_window[wid]);
      }

      // Clear the list of window elements.
      preview_element.children().remove();

      preview_element.slick("unslick");
      preview_element.children().remove();
      preview_element.hide();
      preview_element.off("afterChange");
      preview_element.off("init");
      $(window).off("click", this._handle_window_list_blur);
      $(window).off("contextmenu", this._handle_window_list_blur);
      return;
    }

    // Clear the list of window elements.
    preview_element.children().remove();

    // Sort windows by stacking order.;
    var windows_sorted = Object.values(client.id_to_window).filter((win) => {
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
    preview_element.css("width", container_width + "px");

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
      var img_el = $("<img>");
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
      centerPadding: "0px",
      slidesToShow: Math.max(1, Math.min(4, windows_sorted.length)),
      slidesToScroll: 1,
      infinite: true,
      adaptiveHeight: false,
      speed: 0,
      prevArrow: null,
      nextArrow: null,
      easing: "null",
      waitForAnimate: false,
    });
  }

  /*
   * Handle closing of window list if clickout outside of area.
   */
  _handle_window_list_blur(e) {
    if ($("#window_preview").is(":visible")) {
      if (e.target.id === "window_preview") {
        return;
      }
      if ($(e.target).parents("#window_preview").length > 0) {
        return;
      }
      if ($(e.target).hasClass("window-list-button")) {
        return;
      }
      if (
        $(e.target).parents("#float_menu").length > 0 &&
        $(e.target).parent().has("#open_windows_list")
      ) {
        return;
      }
      // Clicked outside window list, close it.
      client.toggle_window_preview();
    }
  }

  /*
   * packet processing functions start here
   */

  on_open() {
    //this hook can be overriden
  }

  _process_open() {
    // call the send_hello function
    this.on_connection_progress("WebSocket connection established", "", 80);
    // wait timeout seconds for a hello, then bomb
    this.schedule_hello_timer();
    this._send_hello();
    this.on_open();
  }

  schedule_hello_timer() {
    this.cancel_hello_timer();
    this.hello_timer = setTimeout(() => {
      this.disconnect_reason =
        "Did not receive hello before timeout reached, not an Xpra server?";
      this.close();
    }, this.HELLO_TIMEOUT);
  }
  cancel_hello_timer() {
    if (this.hello_timer) {
      clearTimeout(this.hello_timer);
      this.hello_timer = null;
    }
  }

  _process_error(packet) {
    const code = parseInt(packet[2]);
    let reconnect =
      this.reconnect || this.reconnect_attempt < this.reconnect_count;
    if (reconnect && code >= 0) {
      if ([0, 1006, 1008, 1010, 1014, 1015].indexOf(code) >= 0) {
        // don't re-connect unless we had actually managed to connect
        // (because these specific websocket error codes are likely permanent)
        reconnect = this.connected;
      }
    }
    this.cerror(
      "websocket error: ",
      packet[1],
      "code: ",
      code,
      "reason: ",
      this.disconnect_reason,
      ", connected: ",
      this.connected,
      ", reconnect: ",
      reconnect
    );
    if (this.reconnect_in_progress) {
      return;
    }
    this.packet_disconnect_reason(packet);
    this.close_audio();
    if (!reconnect) {
      // call the client's close callback
      this.callback_close(this.disconnect_reason);
    }
  }

  packet_disconnect_reason(packet) {
    if (!this.disconnect_reason && packet[1]) {
      const code = packet[2];
      if (
        !this.connected &&
        [0, 1006, 1008, 1010, 1014, 1015].indexOf(code) >= 0
      ) {
        this.disconnect_reason = "connection failed, invalid address?";
      } else {
        this.disconnect_reason = packet[1];
        let i = 2;
        while (packet.length > i && packet[i]) {
          this.disconnect_reason += "\n" + packet[i];
          i++;
        }
      }
    }
  }

  do_reconnect() {
    //try again:
    this.reconnect_in_progress = true;
    const protocol = this.protocol;
    setTimeout(() => {
      try {
        this.close_windows();
        this.close_audio();
        this.clear_timers();
        this.init_state();
        if (protocol) {
          this.protocol = null;
          protocol.terminate();
        }
        this.emit_connection_lost();
        this.connect();
      } finally {
        this.reconnect_in_progress = false;
      }
    }, this.reconnect_delay);
  }

  _process_close(packet) {
    this.clog(
      "websocket closed: ",
      packet[1],
      "reason: ",
      this.disconnect_reason,
      ", reconnect: ",
      this.reconnect,
      ", reconnect attempt: ",
      this.reconnect_attempt
    );
    if (this.reconnect_in_progress) {
      return;
    }
    this.packet_disconnect_reason(packet);
    if (this.reconnect && this.reconnect_attempt < this.reconnect_count) {
      this.emit_connection_lost();
      this.reconnect_attempt++;
      this.do_reconnect();
    } else {
      this.close();
    }
  }

  close() {
    this.clog("client closed");
    this.cancel_all_files();
    this.emit_connection_lost();
    this.close_windows();
    this.close_audio();
    this.clear_timers();
    this.close_protocol();
    // call the client's close callback
    this.callback_close(this.disconnect_reason);
  }

  _process_disconnect(packet) {
    this.debug("main", "disconnect reason:", packet[1]);
    if (this.reconnect_in_progress) {
      return;
    }
    // save the disconnect reason
    this.packet_disconnect_reason(packet);
    this.close();
    // call the client's close callback
    this.callback_close(this.disconnect_reason);
  }

  _process_startup_complete(packet) {
    this.log("startup complete");
    this.emit_connection_established();
  }

  _connection_change(e) {
    const ci = Utilities.getConnectionInfo();
    this.clog(
      "connection status - change event=",
      e,
      ", connection info=",
      ci,
      "tell server:",
      this.server_connection_data
    );
    if (ci && this.server_connection_data) {
      this.send(["connection-data", ci]);
    }
  }

  _process_hello(packet) {
    this.cancel_hello_timer();
    const hello = packet[1];
    this.clog("received hello capabilities", hello);
    this.server_display = hello["display"] || "";
    this.server_platform = hello["platform"] || "";
    this.server_remote_logging = hello["remote-logging.multi-line"];
    if (this.server_remote_logging && this.remote_logging) {
      //hook remote logging:
      Utilities.log = () => this.log(arguments);
      Utilities.warn = () => this.warn(arguments);
      Utilities.error = () => this.error(arguments);
      Utilities.exc = () => this.exc(arguments);
    }
    // check for server encryption caps update
    if (this.encryption) {
      this.cipher_out_caps = {};
      const CIPHER_CAPS = [
        "",
        ".mode",
        ".iv",
        ".key_salt",
        ".key_size",
        ".key_hash",
        ".key_stretch_iterations",
        ".padding",
        ".padding.options",
      ];
      for (let i = 0; i < CIPHER_CAPS.length; ++i) {
        const cipher_key = "cipher" + CIPHER_CAPS[i];
        let value = hello[cipher_key];
        if (typeof value === "object" && value.constructor === Uint8Array) {
          value = String.fromCharCode.apply(null, value);
        }
        this.cipher_out_caps[cipher_key] = value;
      }
      this.protocol.set_cipher_out(this.cipher_out_caps, this.encryption_key);
    }
    let PACKET_ENCODERS = ["bencode"];
    if (rencode_ok) {
      PACKET_ENCODERS = ["rencodeplus", "bencode"];
    }
    for (const i in PACKET_ENCODERS) {
      const packet_encoder = PACKET_ENCODERS[i];
      if (hello[packet_encoder]) {
        this.packet_encoder = packet_encoder;
        this.protocol.enable_packet_encoder(packet_encoder);
        Utilities.clog("packet encoder:", packet_encoder);
        break;
      }
    }
    //don't use offscreen or decode worker with 'rencodeplus':
    if (this.decode_worker && this.packet_encoder != "rencodeplus") {
      Utilities.clog(
        "turning off decode worker for " +
          this.packet_encoder +
          " packet encoder"
      );
      this.decode_worker = null;
      this.offscreen_api = false;
    }

    // find the modifier to use for Num_Lock
    const modifier_keycodes = hello["modifier_keycodes"];
    if (modifier_keycodes) {
      for (const modifier in modifier_keycodes) {
        if ({}.hasOwnProperty.call((modifier_keycodes, modifier))) {
          const mappings = modifier_keycodes[modifier];
          for (const keycode in mappings) {
            const keys = mappings[keycode];
            for (const index in keys) {
              const key = keys[index];
              if (key == "Num_Lock") {
                this.num_lock_modifier = modifier;
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
      for (let i = 0; i < vparts.length; i++) {
        vno[i] = parseInt(vparts[i]);
      }
      if (vno[0] <= 0 && vno[1] < 10) {
        this.callback_close("unsupported version: " + version);
        this.close();
        return;
      }
    } catch (e) {
      this.callback_close("error parsing version number '" + version + "'");
      this.close();
      return;
    }
    this.log("got hello: server version", version, "accepted our connection");
    //figure out "alt" and "meta" keys:
    if ("modifier_keycodes" in hello) {
      const modifier_keycodes = hello["modifier_keycodes"];
      for (const mod in modifier_keycodes) {
        const keys = modifier_keycodes[mod];
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          //the first value is usually the integer keycode,
          //the second one is the actual key name,
          //doesn't hurt to test both:
          for (let j = 0; j < key.length; j++) {
            if ("Alt_L" == key[j]) this.alt_modifier = mod;
            else if ("Meta_L" == key[j]) this.meta_modifier = mod;
            else if ("ISO_Level3_Shift" == key[j] || "Mode_switch" == key[j])
              this.altgr_modifier = mod;
            else if ("Control_L" == key[j]) this.control_modifier = mod;
          }
        }
      }
    }
    // stuff that must be done after hello
    if (this.audio_enabled) {
      if (!hello["sound.send"]) {
        this.error("server does not support speaker forwarding");
        this.audio_enabled = false;
      } else {
        this.server_audio_codecs = hello["sound.encoders"];
        if (!this.server_audio_codecs) {
          this.error("audio codecs missing on the server");
          this.audio_enabled = false;
        } else {
          this.log(
            "audio codecs supported by the server:",
            this.server_audio_codecs
          );
          if (!this.server_audio_codecs.includes(this.audio_codec)) {
            this.warn(
              "audio codec " +
                this.audio_codec +
                " is not supported by the server"
            );
            this.audio_codec = null;
            //find the best one we can use:
            for (
              let i = 0;
              i < MediaSourceConstants.PREFERRED_CODEC_ORDER.length;
              i++
            ) {
              const codec = MediaSourceConstants.PREFERRED_CODEC_ORDER[i];
              if (
                codec in this.audio_codecs &&
                this.server_audio_codecs.indexOf(codec) >= 0
              ) {
                if (this.mediasource_codecs[codec]) {
                  this.audio_framework = "mediasource";
                } else {
                  this.audio_framework = "aurora";
                }
                this.audio_codec = codec;
                this.log("using", this.audio_framework, "audio codec", codec);
                break;
              }
            }
            if (!this.audio_codec) {
              this.warn("audio codec: no matches found");
              this.audio_enabled = false;
            }
          }
        }
        //with Firefox, we have to wait for a user event..
        if (this.audio_enabled && !Utilities.isFirefox()) {
          this._sound_start_receiving();
        }
      }
    }
    if (SHOW_START_MENU) {
      this.xdg_menu = hello["xdg-menu"];
      if (this.xdg_menu) {
        this.process_xdg_menu();
      }
    }

    this.server_is_desktop = Boolean(hello["desktop"]);
    this.server_is_shadow = Boolean(hello["shadow"]);
    this.server_readonly = Boolean(hello["readonly"]);
    if (this.server_is_desktop || this.server_is_shadow) {
      jQuery("body").addClass("desktop");
    }
    this.server_resize_exact = hello["resize_exact"] || false;
    this.server_screen_sizes = hello["screen-sizes"] || [];
    this.clog("server screen sizes:", this.server_screen_sizes);

    this.server_precise_wheel = hello["wheel.precise"] || false;

    this.remote_open_files = Boolean(hello["open-files"]);
    this.remote_file_transfer = Boolean(hello["file-transfer"]);
    this.remote_printing = Boolean(hello["printing"]);
    if (this.remote_printing && this.printing) {
      // send our printer definition
      const printers = {
        "HTML5 client": {
          "printer-info": "Print to PDF in client browser",
          "printer-make-and-model": "HTML5 client version",
          mimetypes: ["application/pdf"],
        },
      };
      this.send(["printers", printers]);
    }
    this.server_connection_data = hello["connection-data"];
    if ({}.hasOwnProperty.call((navigator, "connection"))) {
      navigator.connection.onchange = this._connection_change;
      this._connection_change();
    }

    // file transfer attributes:
    this.remote_file_size_limit = hello["file-size-limit"] || 0;
    this.remote_file_chunks = Math.max(
      0,
      Math.min(
        this.remote_file_size_limit * 1024 * 1024,
        hello["file-chunks"] || 0
      )
    );

    // start sending our own pings
    this._send_ping();
    this.ping_timer = setInterval(this._send_ping, this.PING_FREQUENCY);
    this.reconnect_attempt = 0;
    // Drop start_new_session to avoid creating new displays
    // on reconnect
    this.start_new_session = null;
    this.on_connection_progress("Session started", "", 100);
    this.on_connect();
    this.connected = true;
  }

  _process_encodings(packet) {
    const caps = packet[1];
    this.log("update encodings:", Object.keys(caps));
  }

  process_xdg_menu() {
    this.log("received xdg start menu data");
    let key;
    //remove current menu:
    $("#startmenu li").remove();
    const startmenu = document.getElementById("startmenu");
    for (key in this.xdg_menu) {
      const category = this.xdg_menu[key];
      const li = document.createElement("li");
      li.className = "-hasSubmenu";

      const catDivLeft = document.createElement("div");
      catDivLeft.className = "menu-divleft";
      catDivLeft.appendChild(
        this.xdg_image(category.IconData, category.IconType)
      );

      const a = document.createElement("a");
      a.appendChild(catDivLeft);
      a.appendChild(document.createTextNode(this.xdg_menu[key].Name));
      a.href = "#";
      li.appendChild(a);

      const ul = document.createElement("ul");

      //TODO need to figure out how to do this properly
      a.onmouseenter = function () {
        this.parentElement.childNodes[1].className = "-visible";
      };
      a.onmouseleave = function () {
        this.parentElement.childNodes[1].className = "";
      };

      const xdg_menu_cats = category.Entries;
      for (key in xdg_menu_cats) {
        const entry = xdg_menu_cats[key];
        const li2 = document.createElement("li");
        const a2 = document.createElement("a");

        let name = entry.Name;
        name = Utilities.trimString(name, 15);
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
        a2.onclick = function () {
          const ignore = "False";
          me.start_command(this.innerText, this.title, ignore);
          document.getElementById("menu_list").className = "-hide";
        };
        a2.onmouseenter = function () {
          this.parentElement.parentElement.className = "-visible";
        };
        a2.onmouseleave = function () {
          this.parentElement.parentElement.className = "";
        };

        li2.appendChild(a2);
        ul.appendChild(li2);
      }
      li.appendChild(ul);
      startmenu.appendChild(li);
    }
  }

  _process_setting_change(packet) {
    const setting = packet[1],
      value = packet[2];
    if (setting == "xdg-menu" && SHOW_START_MENU) {
      this.xdg_menu = value;
      if (this.xdg_menu) {
        this.process_xdg_menu();
        $("#startmenuentry").show();
      }
    }
  }

  xdg_image(icon_data, icon_type) {
    const img = new Image();
    if (typeof icon_data !== "undefined") {
      if (typeof icon_data === "string") {
        icon_data = Utilities.StringToUint8(icon_data);
      }
      if (icon_type == "svg") {
        img.src =
          "data:image/svg+xml;base64," +
          Utilities.ArrayBufferToBase64(icon_data);
      } else if (icon_type == "png" || icon_type == "jpeg") {
        img.src =
          "data:image/" +
          icon_type +
          ";base64," +
          Utilities.ArrayBufferToBase64(icon_data);
      }
    }
    img.className = "menu-content-left";
    img.height = 24;
    img.width = 24;
    return img;
  }

  on_connect() {
    //this hook can be overriden
  }

  _process_challenge(packet) {
    if (this.encryption) {
      if (packet.length >= 3) {
        this.cipher_out_caps = packet[2];
        this.protocol.set_cipher_out(this.cipher_out_caps, this.encryption_key);
      } else {
        this.callback_close(
          "challenge does not contain encryption details to use for the response"
        );
        return;
      }
    }
    const digest = Utilities.s(packet[3]);
    const server_salt = Utilities.s(packet[1]);
    const salt_digest = Utilities.s(packet[4]) || "xor";
    const prompt = (Utilities.s(packet[5]) || "password").replace(
      /[^a-zA-Z0-9.,:+/]/gi,
      ""
    );
    this.clog("process challenge:", digest);
    function call_do_process_challenge(password) {
      if (!this || !this.connected) {
        return;
      }
      if (password == null) {
        this.disconnect_reason = "password prompt cancelled";
        this.close();
        return;
      }
      const challenge_digest = digest.startsWith("keycloak") ? "xor" : digest;
      this.do_process_challenge(
        challenge_digest,
        server_salt,
        salt_digest,
        password
      );
    }
    if (this.passwords.length > 0) {
      const password = this.passwords.shift();
      call_do_process_challenge(password);
      return;
    }
    if (digest.startsWith("keycloak") && this.keycloak_prompt_fn) {
      this.cancel_hello_timer();
      this.keycloak_prompt_fn(server_salt, call_do_process_challenge);
      return;
    } else if (this.password_prompt_fn) {
      const address = "" + client.host + ":" + client.port;
      this.cancel_hello_timer();
      this.password_prompt_fn(
        "The server at " + address + " requires a " + prompt,
        call_do_process_challenge
      );
      return;
    }
    this.callback_close("No password specified for authentication challenge");
  }

  do_process_challenge(digest, server_salt, salt_digest, password) {
    this.schedule_hello_timer();
    let client_salt = null;
    let l = server_salt.length;
    if (salt_digest == "xor") {
      //don't use xor over unencrypted connections unless explicitly allowed:
      if (digest == "xor") {
        if (
          !this.ssl &&
          !this.encryption &&
          !this.insecure &&
          this.host != "localhost" &&
          this.host != "127.0.0.1"
        ) {
          this.callback_close(
            "server requested digest xor, cowardly refusing to use it without encryption with " +
              this.host
          );
          return;
        }
      }
      if (l < 16 || l > 256) {
        this.callback_close("invalid server salt length for xor digest:" + l);
        return;
      }
    } else {
      //other digest, 32 random bytes is enough:
      l = 32;
    }
    client_salt = Utilities.getSecureRandomString(l);
    this.clog("challenge using salt digest", salt_digest);
    const salt = this._gendigest(salt_digest, client_salt, server_salt);
    if (!salt) {
      this.callback_close(
        "server requested an unsupported salt digest " + salt_digest
      );
      return;
    }
    this.clog("challenge using digest", digest);
    const challenge_response = this._gendigest(digest, password, salt);
    if (challenge_response) {
      this.do_send_hello(challenge_response, client_salt);
    } else {
      this.callback_close("server requested an unsupported digest " + digest);
    }
  }

  _gendigest(digest, password, salt) {
    if (digest.startsWith("hmac")) {
      let hash = "md5";
      if (digest.indexOf("+") > 0) {
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
  }

  _send_ping() {
    if (this.reconnect_in_progress || !this.connected) {
      return;
    }
    const now_ms = Math.ceil(performance.now());
    this.send(["ping", now_ms]);
    // add timeout to wait for ping timout
    this.ping_timeout_timer = setTimeout(
      () => this._check_echo_timeout(now_ms),
      this.PING_TIMEOUT
    );
    // add timeout to detect temporary ping miss for spinners
    const wait = 2000;
    this.ping_grace_timer = setTimeout(
      () => this._check_server_echo(now_ms),
      wait
    );
  }

  _process_ping(packet) {
    const echotime = packet[1];
    this.last_ping_server_time = echotime;
    if (packet.length > 2) {
      //prefer system time (packet[1] is monotonic)
      this.last_ping_server_time = packet[2];
    }
    let sid = "";
    if (packet.length >= 4) {
      sid = packet[3];
    }
    this.last_ping_local_time = new Date().getTime();
    const l1 = 0,
      l2 = 0,
      l3 = 0;
    this.send(["ping_echo", echotime, l1, l2, l3, 0, sid]);
  }

  _process_ping_echo(packet) {
    this.last_ping_echoed_time = packet[1];
    const l1 = packet[2],
      l2 = packet[3],
      l3 = packet[4];
    this.client_ping_latency = packet[5];
    this.server_ping_latency =
      Math.ceil(performance.now()) - this.last_ping_echoed_time;
    this.server_load = [l1 / 1000.0, l2 / 1000.0, l3 / 1000.0];
    // make sure server goes OK immediately instead of waiting for next timeout
    this._check_server_echo(0);
  }

  /**
   * Info
   */
  start_info_timer() {
    if (this.info_timer == null) {
      this.info_timer = setInterval(() => {
        if (this.info_timer != null) {
          this.send_info_request();
        }
      }, this.INFO_FREQUENCY);
    }
  }
  send_info_request() {
    if (!this.info_request_pending) {
      this.send(["info-request", [this.uuid], [], []]);
      this.info_request_pending = true;
    }
  }
  _process_info_response(packet) {
    this.info_request_pending = false;
    this.server_last_info = packet[1];
    this.debug("network", "info-response:", this.server_last_info);
    const event = document.createEvent("Event");
    event.initEvent("info-response", true, true);
    event.data = this.server_last_info;
    document.dispatchEvent(event);
  }
  stop_info_timer() {
    if (this.info_timer) {
      clearTimeout(this.info_timer);
      this.info_timer = null;
      this.info_request_pending = false;
    }
  }

  /**
   * System Tray forwarding
   */

  position_float_menu() {
    const float_menu_element = $("#float_menu");
    var toolbar_width = float_menu_element.width();
    var left = float_menu_element.offset().left || 0;
    var top = float_menu_element.offset().top || 0;
    var screen_width = $("#screen").width();
    if (this.toolbar_position == "custom") {
      //no calculations needed
    } else if (this.toolbar_position == "top-left") {
      //no calculations needed
    } else if (this.toolbar_position == "top") {
      left = screen_width / 2 - toolbar_width / 2;
    } else if (this.toolbar_position == "top-right") {
      left = screen_width - toolbar_width - 100;
    }
    float_menu_element.offset({ top: top, left: left });
  }

  _process_new_tray(packet) {
    const wid = packet[1];
    const metadata = packet[4];
    const mydiv = document.createElement("div");
    mydiv.id = String(wid);
    const mycanvas = document.createElement("canvas");
    mydiv.appendChild(mycanvas);

    const float_tray = document.getElementById("float_tray");
    const float_menu = document.getElementById("float_menu");
    const float_menu_element = $("#float_menu");
    float_menu_element.children().show();
    //increase size for tray icon
    const new_width =
      float_menu_width + float_menu_item_size - float_menu_padding + 5;
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
    this.id_to_window[wid] = new XpraWindow(
      this,
      mycanvas,
      wid,
      x,
      y,
      w,
      h,
      metadata,
      false,
      true,
      {},
      //TODO: send new tray geometry to the server using send_tray_configure
      () => this.debug("tray", "tray geometry changed (ignored)"),
      (event, window) => this.on_mousemove(event, window),
      (event, window) => this.on_mousedown(event, window),
      (event, window) => this.on_mouseup(event, window),
      (event, window) => this.on_mousescroll(event, window),
      () => this.debug("tray", "tray set focus (ignored)"),
      () => this.debug("tray", "tray closed (ignored)"),
      this.scale
    );
    this.send_tray_configure(wid);
  }
  send_tray_configure(wid) {
    const div = jQuery("#" + String(wid));
    const x = Math.round(div.offset().left);
    const y = Math.round(div.offset().top);
    const w = float_menu_item_size,
      h = float_menu_item_size;
    this.clog("tray", wid, "position:", x, y);
    this.send(["configure-window", Number(wid), x, y, w, h, {}]);
  }

  reconfigure_all_trays() {
    const float_menu = document.getElementById("float_menu");
    float_menu_width = float_menu_item_size * 4 + float_menu_padding;
    for (const twid in this.id_to_window) {
      const twin = this.id_to_window[twid];
      if (twin && twin.tray) {
        float_menu_width = float_menu_width + float_menu_item_size;
        this.send_tray_configure(twid);
      }
    }

    // only set if float_menu is visible
    if ($("#float_menu").width() > 0) {
      float_menu.style.width = float_menu_width;
      this.position_float_menu();
    }
  }

  suspend() {
    const window_ids = Object.keys(client.id_to_window).map(Number);
    this.send(["suspend", true, window_ids]);
    for (const i in this.id_to_window) {
      let iwin = this.id_to_window[i];
      iwin.suspend();
    }
  }

  resume() {
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
  _new_window(wid, x, y, w, h, metadata, override_redirect, client_properties) {
    // each window needs their own DIV that contains a canvas
    const mydiv = document.createElement("div");
    mydiv.id = String(wid);

    const screen = document.getElementById("screen");
    screen.appendChild(mydiv);
    // create the XpraWindow object to own the new div
    const win = new XpraWindow(
      this,
      wid,
      x,
      y,
      w,
      h,
      metadata,
      override_redirect,
      false,
      client_properties,
      (window) => this.send_configure_window(window, {}, false),
      (event, window) => this.on_mousemove(event, window),
      (event, window) => this.on_mousedown(event, window),
      (event, window) => this.on_mouseup(event, window),
      (event, window) => this.on_mousescroll(event, window),
      (window) => this._window_set_focus(window),
      (window) => this.send(["close-window", window.wid]),
      this.scale
    );
    if (win && !override_redirect && win.metadata["window-type"] == "NORMAL") {
      const trimmedTitle = Utilities.trimString(win.title, 30);
      window.addWindowListItem(wid, trimmedTitle);
    }
    this.id_to_window[wid] = win;
    if (!override_redirect) {
      const geom = win.get_internal_geometry();
      this.send([
        "map-window",
        wid,
        geom.x,
        geom.y,
        geom.w,
        geom.h,
        win.client_properties,
      ]);
      this._window_set_focus(win);
    }
  }

  _new_window_common(packet, override_redirect) {
    const wid = packet[1];
    let x = packet[2];
    let y = packet[3];
    let w = packet[4];
    let h = packet[5];
    const metadata = packet[6];
    if (wid in this.id_to_window)
      throw new Error("we already have a window " + wid);
    if (w <= 0 || h <= 0) {
      this.error("window dimensions are wrong:", w, h);
      w = 1;
      h = 1;
    }
    let client_properties = {};
    if (packet.length >= 8) client_properties = packet[7];
    if (x == 0 && y == 0 && !metadata["set-initial-position"]) {
      //find a good position for it
      const l = Object.keys(this.id_to_window).length;
      if (l == 0) {
        //first window: center it
        if (w <= this.desktop_width) {
          x = Math.round((this.desktop_width - w) / 2);
        }
        if (h <= this.desktop_height) {
          y = Math.round((this.desktop_height - h) / 2);
        }
      } else {
        x = Math.min(l * 10, Math.max(0, this.desktop_width - 100));
        y = 96;
      }
    }
    this._new_window(
      wid,
      x,
      y,
      w,
      h,
      metadata,
      override_redirect,
      client_properties
    );
    this._new_ui_event();
  }

  send_configure_window(win, state, skip_geometry) {
    const geom = win.get_internal_geometry();
    const wid = win.wid;
    let packet = [
      "configure-window",
      wid,
      geom.x,
      geom.y,
      geom.w,
      geom.h,
      win.client_properties,
      0,
      state,
      skip_geometry,
    ];
    this.send(packet);
  }

  _process_new_window(packet) {
    this._new_window_common(packet, false);
  }

  _process_new_override_redirect(packet) {
    this._new_window_common(packet, true);
  }

  _process_window_metadata(packet) {
    const wid = packet[1],
      metadata = packet[2],
      win = this.id_to_window[wid];
    if (win != null) {
      win.update_metadata(metadata);
    }
  }

  _process_initiate_moveresize(packet) {
    const wid = packet[1],
      win = this.id_to_window[wid];
    if (!win) {
      this.log("cannot initiate moveresize, window", wid, "not found");
      return;
    }
    const x_root = packet[2],
      y_root = packet[3],
      direction = packet[4],
      button = packet[5],
      source_indication = packet[6];
    this.log(
      "initiate moveresize on",
      win,
      "mousedown_event=",
      this.mousedown_event
    );
    win.initiate_moveresize(
      this.mousedown_event,
      x_root,
      y_root,
      direction,
      button,
      source_indication
    );
  }

  _process_pointer_position(packet) {
    const wid = packet[1];
    let x = packet[2],
      y = packet[3];
    const win = this.id_to_window[wid];
    if (packet.length >= 6) {
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
      cursor_url =
        "data:image/png;base64," + window.btoa(win.png_cursor_data[4]);
    } else {
      w = 32;
      h = 32;
      xhot = 8;
      yhot = 3;
      cursor_url = "icons/default_cursor.png";
    }
    x -= xhot;
    y -= yhot;
    style.width = w + "px";
    style.height = h + "px";
    shadow_pointer.src = cursor_url;
    style.left = x + "px";
    style.top = y + "px";
    style.display = "inline";
  }

  on_last_window() {
    //this hook can be overriden
  }

  _process_lost_window(packet) {
    const wid = packet[1];
    const win = this.id_to_window[wid];
    if (
      win &&
      !win.override_redirect &&
      win.metadata["window-type"] == "NORMAL"
    ) {
      window.removeWindowListItem(wid);
    }
    try {
      delete this.id_to_window[wid];
    } catch (e) {}
    if (win != null) {
      win.destroy();
      this.clog("lost window, was tray=", win.tray);
      if (win.tray) {
        //other trays may have moved:
        this.reconfigure_all_trays();
      }
    }
    this.clog(
      "lost window",
      wid,
      ", remaining: ",
      Object.keys(this.id_to_window)
    );
    if (Object.keys(this.id_to_window).length == 0) {
      this.on_last_window();
    } else if (win && win.focused) {
      //it had focus, find the next highest:
      this.auto_focus();
    }
    if (this.decode_worker) {
      this.decode_worker.postMessage({ cmd: "remove", wid: wid });
    }
  }

  auto_focus() {
    let highest_window = null;
    let highest_stacking = -1;
    for (const i in this.id_to_window) {
      let iwin = this.id_to_window[i];
      if (
        !iwin.minimized &&
        iwin.stacking_layer > highest_stacking &&
        !iwin.tray
      ) {
        highest_window = iwin;
        highest_stacking = iwin.stacking_layer;
      }
    }
    if (highest_window) {
      this._window_set_focus(highest_window);
    } else {
      this.focus = 0;
      this.send(["focus", 0, []]);
    }
  }

  _process_raise_window(packet) {
    const wid = packet[1];
    const win = this.id_to_window[wid];
    if (win != null) {
      this._window_set_focus(win);
    }
  }

  _process_window_resized(packet) {
    const wid = packet[1];
    const width = packet[2];
    const height = packet[3];
    const win = this.id_to_window[wid];
    if (win != null) {
      win.resize(width, height);
    }
  }

  _process_window_move_resize(packet) {
    const wid = packet[1];
    const x = packet[2];
    const y = packet[3];
    const width = packet[4];
    const height = packet[5];
    const win = this.id_to_window[wid];
    if (win != null) {
      win.move_resize(x, y, width, height);
    }
  }

  _process_configure_override_redirect(packet) {
    const wid = packet[1];
    const x = packet[2];
    const y = packet[3];
    const width = packet[4];
    const height = packet[5];
    const win = this.id_to_window[wid];
    if (win != null) {
      win.move_resize(x, y, width, height);
    }
  }

  _process_desktop_size(packet) {
    //we don't use this yet,
    //we could use this to clamp the windows to a certain area
  }

  _process_bell(packet) {
    const percent = packet[3];
    const pitch = packet[4];
    const duration = packet[5];
    if (this.audio_context != null) {
      const oscillator = this.audio_context.createOscillator();
      const gainNode = this.audio_context.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(this.audio_context.destination);
      gainNode.gain.setValueAtTime(percent, this.audio_context.currentTime);
      oscillator.frequency.setValueAtTime(
        pitch,
        this.audio_context.currentTime
      );
      oscillator.start();
      setTimeout(oscillator.stop, duration);
    } else {
      const snd = new Audio(
        "data:audio/wav;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7xA4Tvh9Rz/y8QADBwMWgQAZG/ILNAARQ4GLTcDeIIIhxGOBAuD7hOfBB3/94gcJ3w+o5/5eIAIAAAVwWgQAVQ2ORaIQwEMAJiDg95G4nQL7mQVWI6GwRcfsZAcsKkJvxgxEjzFUgfHoSQ9Qq7KNwqHwuB13MA4a1q/DmBrHgPcmjiGoh//EwC5nGPEmS4RcfkVKOhJf+WOgoxJclFz3kgn//dBA+ya1GhurNn8zb//9NNutNuhz31f////9vt///z+IdAEAAAK4LQIAKobHItEIYCGAExBwe8jcToF9zIKrEdDYIuP2MgOWFSE34wYiR5iqQPj0JIeoVdlG4VD4XA67mAcNa1fhzA1jwHuTRxDUQ//iYBczjHiTJcIuPyKlHQkv/LHQUYkuSi57yQT//uggfZNajQ3Vmz+Zt//+mm3Wm3Q576v////+32///5/EOgAAADVghQAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQRLCgwpBGMlJkIz8jKhGvj4k6jzRnqasNKIeoh5gI7BJaC1A1AoNBjJgbyApVS4IDlZgDU5WUAxEKDNmmALHzZp0Fkz1FMTmGFl1FMEyodIavcCAUHDWrKAIA4aa2oCgILEBupZgHvAhEBcZ6joQBxS76AgccrFlczBvKLC0QI2cBoCFvfTDAo7eoOQInqDPBtvrDEZBNYN5xwNwxQRfw8ZQ5wQVLvO8OYU+mHvFLlDh05Mdg7BT6YrRPpCBznMB2r//xKJjyyOh+cImr2/4doscwD6neZjuZR4AgAABYAAAABy1xcdQtxYBYYZdifkUDgzzXaXn98Z0oi9ILU5mBjFANmRwlVJ3/6jYDAmxaiDG3/6xjQQCCKkRb/6kg/wW+kSJ5//rLobkLSiKmqP/0ikJuDaSaSf/6JiLYLEYnW/+kXg1WRVJL/9EmQ1YZIsv/6Qzwy5qk7/+tEU0nkls3/zIUMPKNX/6yZLf+kFgAfgGyLFAUwY//uQZAUABcd5UiNPVXAAAApAAAAAE0VZQKw9ISAAACgAAAAAVQIygIElVrFkBS+Jhi+EAuu+lKAkYUEIsmEAEoMeDmCETMvfSHTGkF5RWH7kz/ESHWPAq/kcCRhqBtMdokPdM7vil7RG98A2sc7zO6ZvTdM7pmOUAZTnJW+NXxqmd41dqJ6mLTXxrPpnV8avaIf5SvL7pndPvPpndJR9Kuu8fePvuiuhorgWjp7Mf/PRjxcFCPDkW31srioCExivv9lcwKEaHsf/7ow2Fl1T/9RkXgEhYElAoCLFtMArxwivDJJ+bR1HTKJdlEoTELCIqgEwVGSQ+hIm0NbK8WXcTEI0UPoa2NbG4y2K00JEWbZavJXkYaqo9CRHS55FcZTjKEk3NKoCYUnSQ0rWxrZbFKbKIhOKPZe1cJKzZSaQrIyULHDZmV5K4xySsDRKWOruanGtjLJXFEmwaIbDLX0hIPBUQPVFVkQkDoUNfSoDgQGKPekoxeGzA4DUvnn4bxzcZrtJyipKfPNy5w+9lnXwgqsiyHNeSVpemw4bWb9psYeq//uQZBoABQt4yMVxYAIAAAkQoAAAHvYpL5m6AAgAACXDAAAAD59jblTirQe9upFsmZbpMudy7Lz1X1DYsxOOSWpfPqNX2WqktK0DMvuGwlbNj44TleLPQ+Gsfb+GOWOKJoIrWb3cIMeeON6lz2umTqMXV8Mj30yWPpjoSa9ujK8SyeJP5y5mOW1D6hvLepeveEAEDo0mgCRClOEgANv3B9a6fikgUSu/DmAMATrGx7nng5p5iimPNZsfQLYB2sDLIkzRKZOHGAaUyDcpFBSLG9MCQALgAIgQs2YunOszLSAyQYPVC2YdGGeHD2dTdJk1pAHGAWDjnkcLKFymS3RQZTInzySoBwMG0QueC3gMsCEYxUqlrcxK6k1LQQcsmyYeQPdC2YfuGPASCBkcVMQQqpVJshui1tkXQJQV0OXGAZMXSOEEBRirXbVRQW7ugq7IM7rPWSZyDlM3IuNEkxzCOJ0ny2ThNkyRai1b6ev//3dzNGzNb//4uAvHT5sURcZCFcuKLhOFs8mLAAEAt4UWAAIABAAAAAB4qbHo0tIjVkUU//uQZAwABfSFz3ZqQAAAAAngwAAAE1HjMp2qAAAAACZDgAAAD5UkTE1UgZEUExqYynN1qZvqIOREEFmBcJQkwdxiFtw0qEOkGYfRDifBui9MQg4QAHAqWtAWHoCxu1Yf4VfWLPIM2mHDFsbQEVGwyqQoQcwnfHeIkNt9YnkiaS1oizycqJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU="
      );
      snd.play();
    }
  }

  /**
   * Notifications
   */
  _process_notify_show(packet) {
    //TODO: add UI switch to disable notifications
    const nid = packet[2];
    const replaces_nid = packet[4];
    const summary = Utilities.s(packet[6]);
    const body = Utilities.s(packet[7]);
    const expire_timeout = packet[8];
    const icon = packet[9];
    const actions = packet[10];
    const hints = packet[11];
    if (window.closeNotification) {
      if (replaces_nid > 0) {
        window.closeNotification(replaces_nid);
      }
      window.closeNotification(nid);
    }

    const ctx = this;
    function notify() {
      let icon_url = "";
      if (icon && icon[0] == "png") {
        icon_url = "data:image/png;base64," + Utilities.ToBase64(icon[3]);
        this.clog("notification icon_url=", icon_url);
      }
      const notification = new Notification(summary, {
        body: body,
        icon: icon_url,
      });
      const reason = 2; //closed by the user - best guess...
      notification.onclose = () =>
        ctx.send(["notification-close", nid, reason, ""]);
      notification.onclick = () => ctx.log("user clicked on notification", nid);
    }

    if ("Notification" in window && actions.length == 0) {
      //we have notification support in the browser
      if (Notification.permission === "granted") {
        notify();
        return;
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission(function (permission) {
          if (permission === "granted") {
            notify();
          }
        });
        return;
      }
    }

    if (window.doNotification) {
      window.doNotification(
        "info",
        nid,
        summary,
        body,
        expire_timeout,
        icon,
        actions,
        hints,
        function (nid, action_id) {
          ctx.send(["notification-action", nid, action_id]);
        },
        function (nid, reason, text) {
          ctx.send(["notification-close", nid, reason, text || ""]);
        }
      );
    }
    ctx._new_ui_event();
  }

  _process_notify_close(packet) {
    const nid = packet[1];
    if (window.closeNotification) {
      window.closeNotification(nid);
    }
  }

  /**
   * Cursors
   */
  reset_cursor() {
    for (const wid in this.id_to_window) {
      const window = this.id_to_window[wid];
      window.reset_cursor();
    }
  }

  _process_cursor(packet) {
    if (packet.length < 9) {
      this.reset_cursor();
      return;
    }
    //we require a png encoded cursor packet:
    const encoding = packet[1];
    if (encoding != "png") {
      this.warn("invalid cursor encoding: " + encoding);
      return;
    }
    const w = packet[4];
    const h = packet[5];
    const xhot = packet[6];
    const yhot = packet[7];
    const img_data = packet[9];
    for (const wid in this.id_to_window) {
      const window = this.id_to_window[wid];
      window.set_cursor(encoding, w, h, xhot, yhot, img_data);
    }
  }

  _process_window_icon(packet) {
    const wid = packet[1];
    const w = packet[2];
    const h = packet[3];
    const encoding = packet[4];
    const img_data = packet[5];
    this.debug("main", "window-icon: ", encoding, " size ", w, "x", h);
    const win = this.id_to_window[wid];
    if (win) {
      const src = win.update_icon(w, h, encoding, img_data);
      //update favicon too:
      if (
        wid == this.focus ||
        this.server_is_desktop ||
        this.server_is_shadow
      ) {
        jQuery("#favicon").attr("href", src);
      }
    }
  }

  /**
   * Window Painting
   */
  _process_draw(packet) {
    //ensure that the pixel data is in a byte array:
    const coding = Utilities.s(packet[6]);
    let img_data = packet[7];
    const raw_buffers = [];
    const now = performance.now();
    if (coding != "scroll") {
      if (!(img_data instanceof Uint8Array)) {
        //the legacy bencoder can give us a string here
        img_data = Utilities.StringToUint8(img_data);
        packet[7] = img_data;
      }
      raw_buffers.push(img_data.buffer);
    }
    if (this.decode_worker) {
      this.decode_worker.postMessage(
        { cmd: "decode", packet: packet, start: now },
        raw_buffers
      );
      //the worker draw event will call do_process_draw
    } else {
      this.do_process_draw(packet, now);
    }
  }

  _process_eos(packet) {
    this.do_process_draw(packet, 0);
    const wid = packet[1];
    if (this.decode_worker) {
      this.decode_worker.postMessage({ cmd: "eos", wid: wid });
    }
  }

  request_redraw(win) {
    if (document.hidden) {
      this.debug("draw", "not redrawing, document.hidden=", document.hidden);
      return;
    }

    if (this.offscreen_api) {
      this.decode_worker.postMessage({ cmd: "redraw", wid: win.wid });
      return;
    }
    // request that drawing to screen takes place at next available opportunity if possible
    this.debug("draw", "request_redraw for", win);
    win.swap_buffers();
    if (!window.requestAnimationFrame) {
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
    window.requestAnimationFrame(() => {
      this.draw_pending_list();
    });
  }

  draw_pending_list() {
    this.debug(
      "draw",
      "animation frame:",
      this.pending_redraw.length,
      "windows to paint, processing delay",
      performance.now() - this.draw_pending,
      "ms"
    );
    this.draw_pending = 0;
    // draw all the windows in the list:
    while (this.pending_redraw.length > 0) {
      const w = this.pending_redraw.shift();
      w.draw();
    }
  }

  do_send_damage_sequence(
    packet_sequence,
    wid,
    width,
    height,
    decode_time,
    message
  ) {
    const protocol = this.protocol;
    if (!protocol) {
      return;
    }
    const packet = [
      "damage-sequence",
      packet_sequence,
      wid,
      width,
      height,
      decode_time,
      message,
    ];
    if (decode_time < 0) {
      this.cwarn("decode error packet:", packet);
    }
    protocol.send(packet);
  }

  do_process_draw(packet, start) {
    if (!packet) {
      //no valid draw packet, likely handle errors for that here
      return;
    }
    const ptype = packet[0],
      wid = packet[1];
    const win = this.id_to_window[wid];
    if (ptype == "eos") {
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
      me.do_send_damage_sequence(
        packet_sequence,
        wid,
        width,
        height,
        decode_time,
        message
      );
    }
    const client = this;
    function decode_result(error) {
      const flush = options["flush"] || 0;
      let decode_time = Math.round(1000 * performance.now() - 1000 * start);
      if (flush == 0) {
        client.request_redraw(win);
      }
      if (error || start == 0) {
        this.request_redraw(win);
        decode_time = -1;
      }
      client.debug(
        "draw",
        "decode time for ",
        coding,
        " sequence ",
        packet_sequence,
        ": ",
        decode_time,
        ", flush=",
        flush
      );
      send_damage_sequence(decode_time, error || "");
    }
    if (!win) {
      this.debug("draw", "cannot paint, window not found:", wid);
      send_damage_sequence(-1, "window " + wid + " not found");
      return;
    }
    if (coding == "offscreen-painted") {
      const decode_time = options["decode_time"];
      send_damage_sequence(decode_time || 0, "");
      return;
    }
    try {
      win.paint(packet, decode_result);
    } catch (e) {
      this.exc(e, "error painting", coding, "sequence no", packet_sequence);
      send_damage_sequence(-1, String(e));
      //there may be other screen updates pending:
      win.paint_pending = 0;
      win.may_paint_now();
      this.request_redraw(win);
    }
  }

  /**
   * Audio
   */
  init_audio(ignore_audio_blacklist) {
    this.debug(
      "audio",
      "init_audio() enabled=",
      this.audio_enabled,
      ", mediasource enabled=",
      this.audio_mediasource_enabled,
      ", aurora enabled=",
      this.audio_aurora_enabled
    );
    if (this.audio_mediasource_enabled) {
      this.mediasource_codecs = MediaSourceUtil.getMediaSourceAudioCodecs(
        ignore_audio_blacklist
      );
      for (const codec_option in this.mediasource_codecs) {
        this.audio_codecs[codec_option] = this.mediasource_codecs[codec_option];
      }
    }
    if (this.audio_aurora_enabled) {
      this.aurora_codecs = MediaSourceUtil.getAuroraAudioCodecs();
      for (const codec_option in this.aurora_codecs) {
        if (codec_option in this.audio_codecs) {
          //we already have native MediaSource support!
          continue;
        }
        this.audio_codecs[codec_option] = this.aurora_codecs[codec_option];
      }
    }
    this.debug("audio", "codecs:", this.audio_codecs);
    if (!this.audio_codecs) {
      this.audio_codec = null;
      this.audio_enabled = false;
      this.warn("no valid audio codecs found");
      return;
    }
    if (!(this.audio_codec in this.audio_codecs)) {
      if (this.audio_codec) {
        this.warn("invalid audio codec: " + this.audio_codec);
        this.warn("codecs found: " + this.audio_codecs);
      }
      this.audio_codec = MediaSourceUtil.getDefaultAudioCodec(
        this.audio_codecs
      );
      if (this.audio_codec) {
        if (
          this.audio_mediasource_enabled &&
          this.audio_codec in this.mediasource_codecs
        ) {
          this.audio_framework = "mediasource";
        } else if (this.audio_aurora_enabled && !Utilities.isIE()) {
          this.audio_framework = "aurora";
        }
        if (this.audio_framework) {
          this.log(
            "using " +
              this.audio_framework +
              " audio codec: " +
              this.audio_codec
          );
        } else {
          this.warn("no valid audio framework - cannot enable audio");
          this.audio_enabled = false;
        }
      } else {
        this.warn("no valid audio codec found");
        this.audio_enabled = false;
      }
    } else {
      this.log(
        "using " + this.audio_framework + " audio codec: " + this.audio_codec
      );
    }
    this.log("audio codecs: ", Object.keys(this.audio_codecs));
  }

  _sound_start_receiving() {
    if (!this.audio_framework || !this.audio_codec) {
      //choose a codec + framework to use
      const codecs_supported = MediaSourceUtil.get_supported_codecs(
        this.audio_mediasource_enabled,
        this.audio_aurora_enabled,
        false
      );
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
      if (this.audio_framework == "mediasource") {
        this._sound_start_mediasource();
      } else {
        this._sound_start_aurora();
      }
    } catch (e) {
      this.exc(e, "error starting audio player");
    }
  }

  _send_sound_start() {
    this.log(
      "audio: requesting " + this.audio_codec + " stream from the server"
    );
    this.send(["sound-control", "start", this.audio_codec]);
  }

  _sound_start_aurora() {
    this.audio_aurora_ctx = AV.Player.fromXpraSource();
    this._send_sound_start();
  }

  _sound_start_mediasource() {
    const me = this;
    function audio_error(event) {
      if (!me.media_source) {
        //already closed
        me.debug(
          "audio",
          "media_source is closed, ignoring audio error: " + event
        );
        return;
      }
      if (me.audio) {
        me.error(event + " error: " + me.audio.error);
        if (me.audio.error) {
          me.error(MediaSourceConstants.ERROR_CODE[me.audio.error.code]);
        }
      } else {
        me.error(event + " error");
      }
      me.close_audio();
    }

    //Create a MediaSource:
    this.media_source = MediaSourceUtil.getMediaSource();
    if (this.debug) {
      MediaSourceUtil.addMediaSourceEventDebugListeners(
        this.media_source,
        "audio"
      );
    }
    this.media_source.addEventListener("error", (e) =>
      audio_error("audio source")
    );

    //Create an <audio> element:
    this.audio = document.createElement("audio");
    this.audio.setAttribute("autoplay", true);
    if (this.debug) {
      MediaSourceUtil.addMediaElementEventDebugListeners(this.audio, "audio");
    }
    this.audio.addEventListener("play", () => this.clog("audio play!"));
    this.audio.addEventListener("error", () => audio_error("audio"));
    document.body.appendChild(this.audio);

    //attach the MediaSource to the <audio> element:
    this.audio.src = window.URL.createObjectURL(this.media_source);
    this.audio_buffers = [];
    this.audio_buffers_count = 0;
    this.audio_source_ready = false;
    this.clog("audio waiting for source open event on", this.media_source);
    this.media_source.addEventListener("sourceopen", () => {
      this.log("audio media source open");
      if (this.audio_source_ready) {
        this.warn("ignoring: source already open");
        return;
      }
      //ie: codec_string = "audio/mp3";
      const codec_string = MediaSourceConstants.CODEC_STRING[this.audio_codec];
      if (codec_string == null) {
        this.error("invalid codec '" + this.audio_codec + "'");
        this.close_audio();
        return;
      }
      this.log(
        "using audio codec string for " + this.audio_codec + ": " + codec_string
      );

      //Create a SourceBuffer:
      let asb;
      try {
        asb = this.media_source.addSourceBuffer(codec_string);
      } catch (e) {
        this.exc(e, "audio setup error for", codec_string);
        this.close_audio();
        return;
      }
      this.audio_source_buffer = asb;
      asb.mode = "sequence";
      if (this.debug_categories.includes("audio")) {
        MediaSourceUtil.addSourceBufferEventDebugListeners(asb, "audio");
      }
      asb.addEventListener("error", (e) => audio_error("audio buffer"));
      this.audio_source_ready = true;
      this._send_sound_start();
    });
  }

  _send_sound_stop() {
    this.log("audio: stopping stream");
    this.send(["sound-control", "stop"]);
  }

  close_audio() {
    if (this.connected) {
      this._send_sound_stop();
    }
    if (this.audio_framework == "mediasource") {
      this._close_audio_mediasource();
    } else {
      this._close_audio_aurora();
    }
    this.on_audio_state_change("stopped", "closed");
  }

  _close_audio_aurora() {
    if (this.audio_aurora_ctx) {
      if (this.audio_aurora_ctx.context) {
        try {
          this.audio_aurora_ctx.context.close();
        } catch (e) {
          this.debug("audio", "error closing context", e);
        }
      }
      this.audio_aurora_ctx = null;
    }
  }

  _close_audio_mediasource() {
    this.log(
      "close_audio_mediasource: audio_source_buffer=" +
        this.audio_source_buffer +
        ", media_source=" +
        this.media_source +
        ", audio=" +
        this.audio
    );
    this.audio_source_ready = false;
    if (this.audio) {
      if (this.media_source) {
        try {
          if (this.audio_source_buffer) {
            this.media_source.removeSourceBuffer(this.audio_source_buffer);
            this.audio_source_buffer = null;
          }
          if (this.media_source.readyState == "open") {
            this.media_source.endOfStream();
          }
        } catch (e) {
          this.exc(e, "audio media source EOS error");
        }
        this.media_source = null;
      }
      this._remove_audio_element();
    }
  }

  _remove_audio_element() {
    if (this.audio != null) {
      this.audio.src = "";
      this.audio.load();
      try {
        document.body.removeChild(this.audio);
      } catch (e) {
        this.debug("audio", "failed to remove audio from page:", e);
      }
      this.audio = null;
    }
  }

  _process_sound_data(packet) {
    try {
      const codec = Utilities.s(packet[1]),
        buf = packet[2],
        options = packet[3],
        metadata = packet[4];

      if (codec != this.audio_codec) {
        this.error(
          "invalid audio codec '" +
            codec +
            "' (expected " +
            this.audio_codec +
            "), stopping audio stream"
        );
        this.close_audio();
        return;
      }

      if (options["start-of-stream"] == 1) {
        this._audio_start_stream();
      }

      if (buf && buf.length > 0) {
        this.add_sound_data(codec, buf, metadata);
      }

      if (options["end-of-stream"] == 1) {
        this.log("received end-of-stream from server");
        this.close_audio();
      }
    } catch (e) {
      this.on_audio_state_change("error", "" + e);
      this.exc(e, "sound data error");
      this.close_audio();
    }
  }

  on_audio_state_change(newstate, details) {
    this.debug("on_audio_state_change:", newstate, details);
    this.audio_state = newstate;
    //can be overriden
  }

  add_sound_data(codec, buf, metadata) {
    let MIN_START_BUFFERS = 4;
    const MAX_BUFFERS = 250;
    const CONCAT = true;
    this.debug("audio", "sound-data: ", codec, ", ", buf.length, "bytes");
    if (this.audio_buffers.length >= MAX_BUFFERS) {
      this.warn(
        "audio queue overflowing: " + this.audio_buffers.length + ", stopping"
      );
      this.on_audio_state_change("error", "queue overflow");
      this.close_audio();
      return;
    }
    if (metadata) {
      this.debug("audio", "audio metadata=", metadata);
      //push metadata first:
      for (let i = 0; i < metadata.length; i++) {
        this.debug(
          "audio",
          "metadata[",
          i,
          "]=",
          metadata[i],
          ", length=",
          metadata[i].length,
          ", type=",
          Object.prototype.toString.call(metadata[i])
        );
        this.audio_buffers.push(Utilities.StringToUint8(metadata[i]));
      }
      //since we have the metadata, we should be good to go:
      MIN_START_BUFFERS = 1;
    }
    if (buf != null) {
      this.audio_buffers.push(buf);
    }
    const ab = this.audio_buffers;
    if (
      this._audio_ready() &&
      (this.audio_buffers_count > 0 || ab.length >= MIN_START_BUFFERS)
    ) {
      if (CONCAT) {
        if (ab.length == 1) {
          //shortcut
          buf = ab[0];
        } else {
          //concatenate all pending buffers into one:
          let size = 0;
          for (let i = 0, j = ab.length; i < j; ++i) {
            size += ab[i].length;
          }
          buf = new Uint8Array(size);
          size = 0;
          for (let i = 0, j = ab.length; i < j; ++i) {
            const v = ab[i];
            if (v.length > 0) {
              buf.set(v, size);
              size += v.length;
            }
          }
        }
        this.audio_buffers_count += 1;
        this.push_audio_buffer(buf);
      } else {
        this.audio_buffers_count += ab.length;
        for (let i = 0, j = ab.length; i < j; ++i) {
          this.push_audio_buffer(ab[i]);
        }
      }
      this.audio_buffers = [];
    }
  }

  _audio_start_stream() {
    this.debug(
      "audio",
      "audio start of " +
        this.audio_framework +
        " " +
        this.audio_codec +
        " stream"
    );
    if (this.audio_state == "playing" || this.audio_state == "waiting") {
      //nothing to do: ready to play
      return;
    }
    const me = this;
    this.on_audio_state_change(
      "waiting",
      "" + this.audio_framework + " playing " + this.audio_codec + " stream"
    );
    if (this.audio_framework == "mediasource") {
      let play = this.audio.play();
      if (play == undefined) {
        this.on_audio_state_change("error", "no promise");
        this.close_audio();
        return;
      }
      play.then(
        (result) => {
          this.debug("audio", "stream playing", result);
        },
        (err) => {
          this.on_audio_state_change("error", "stream failed:" + err);
          this.close_audio();
        }
      );
    } else if (this.audio_framework == "http-stream") {
      this.log("invalid start-of-stream data for http-stream framework");
    } else if (this.audio_framework == "aurora") {
      this.audio_aurora_ctx.play();
    } else {
      this.on_audio_state_change(
        "error",
        "unknown framework " + this.audio_framework
      );
      this.close_audio();
    }
  }

  _audio_ready() {
    if (this.audio_framework == "mediasource") {
      //check media source buffer state:
      if (this.audio) {
        this.debug(
          "audio",
          "mediasource state=",
          MediaSourceConstants.READY_STATE[this.audio.readyState],
          ", network state=",
          MediaSourceConstants.NETWORK_STATE[this.audio.networkState]
        );
        this.debug(
          "audio",
          "audio paused=",
          this.audio.paused,
          ", queue size=",
          this.audio_buffers.length,
          ", source ready=",
          this.audio_source_ready,
          ", source buffer updating=",
          this.audio_source_buffer.updating
        );
      }
      const asb = this.audio_source_buffer;
      return asb != null && !asb.updating;
    } else {
      return this.audio_aurora_ctx != null;
    }
  }

  push_audio_buffer(buf) {
    if (this.audio_framework == "mediasource") {
      this.audio_source_buffer.appendBuffer(buf);
      const b = this.audio_source_buffer.buffered;
      if (b && b.length >= 1) {
        const p = this.audio.played;
        const e = b.end(0);
        const buf_size = Math.round(1000 * (e - this.audio.currentTime));
        this.debug(
          "audio",
          "buffer size=",
          buf_size,
          "ms, currentTime=",
          this.audio.currentTime
        );
      }
    } else {
      this.audio_aurora_ctx.asset.source._on_data(buf);
      this.debug(
        "audio",
        "playing=",
        this.audio_aurora_ctx.playing,
        "buffered=",
        this.audio_aurora_ctx.buffered,
        "currentTime=",
        this.audio_aurora_ctx.currentTime,
        "duration=",
        this.audio_aurora_ctx.duration
      );
      if (this.audio_aurora_ctx.format) {
        this.debug(
          "audio",
          "formatID=",
          this.audio_aurora_ctx.format.formatID,
          "sampleRate=",
          this.audio_aurora_ctx.format.sampleRate
        );
      }
      this.debug(
        "audio",
        "active=",
        this.audio_aurora_ctx.asset.active,
        "decoder=",
        this.audio_aurora_ctx.asset.decoder,
        "demuxer=",
        this.audio_aurora_ctx.demuxer
      );
    }
    this.on_audio_state_change("playing", "");
  }

  /**
   * Clipboard
   */
  get_clipboard_buffer() {
    return this.clipboard_buffer;
  }
  get_clipboard_datatype() {
    return this.clipboard_datatype;
  }

  send_clipboard_token(data) {
    if (!this.clipboard_enabled || !this.connected) {
      return;
    }
    this.debug("clipboard", "sending clipboard token with data:", data);
    const claim = true; //Boolean(navigator.clipboard && navigator.clipboard.readText && navigator.clipboard.writeText);
    const greedy = true;
    const synchronous = true;
    let packet;
    if (data) {
      packet = [
        "clipboard-token",
        "CLIPBOARD",
        ["UTF8_STRING", "text/plain"],
        "UTF8_STRING",
        "UTF8_STRING",
        8,
        "bytes",
        data,
        claim,
        greedy,
        synchronous,
      ];
    } else {
      packet = [
        "clipboard-token",
        "CLIPBOARD",
        [],
        "",
        "",
        8,
        "bytes",
        "",
        claim,
        greedy,
        synchronous,
      ];
    }
    this.send(packet);
  }

  _process_clipboard_token(packet) {
    if (!this.clipboard_enabled) {
      return;
    }
    const selection = packet[1];
    let targets = [];
    let target = null;
    let dtype = null;
    let dformat = null;
    let wire_encoding = null;
    let wire_data = null;
    if (packet.length >= 3) {
      targets = packet[2];
    }
    if (packet.length >= 8) {
      target = packet[3];
      dtype = packet[4];
      dformat = packet[5];
      wire_encoding = packet[6];
      wire_data = packet[7];
      //always keep track of the latest server buffer
      this.clipboard_server_buffers[selection] = [
        target,
        dtype,
        dformat,
        wire_encoding,
        wire_data,
      ];
    }

    const is_valid_target = target && this.clipboard_targets.includes(target);
    this.debug("clipboard", "clipboard token received");
    this.debug("clipboard", "targets=", targets);
    this.debug("clipboard", "target=", target, "is valid:", is_valid_target);
    this.debug(
      "clipboard",
      "dtype=",
      dtype,
      "dformat=",
      dformat,
      "wire-encoding=",
      wire_encoding
    );
    // if we have navigator.clipboard support in the browser,
    // we can just set the clipboard value here,
    // otherwise we don't actually set anything
    // because we can't (the browser security won't let us)
    // we just record the value and actually set the clipboard
    // when we get a click, control-C or control-X event
    // (when access to the clipboard is allowed)
    if (is_valid_target) {
      const is_text =
        dtype.toLowerCase().indexOf("text") >= 0 ||
        dtype.toLowerCase().indexOf("string") >= 0;
      if (is_text) {
        try {
          wire_data = Utilities.Uint8ToString(wire_data);
        } catch (e) {}
        if (this.clipboard_buffer != wire_data) {
          this.clipboard_datatype = dtype;
          this.clipboard_buffer = wire_data;
          this.clipboard_pending = true;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            if (is_text) {
              navigator.clipboard.writeText(wire_data).then(
                () => {
                  this.debug("clipboard", "writeText succeeded");
                  this.clipboard_pending = false;
                },
                () => this.debug("clipboard", "writeText failed")
              );
            }
          }
        }
      } else if (
        CLIPBOARD_IMAGES &&
        dtype == "image/png" &&
        dformat == 8 &&
        wire_encoding == "bytes" &&
        navigator.clipboard &&
        {}.hasOwnProperty.call(navigator.clipboard, "write")
      ) {
        this.debug("clipboard", "png image received");
        const blob = new Blob([wire_data], { type: dtype });
        this.debug("clipboard", "created blob", blob);
        const item = new ClipboardItem({ "image/png": blob });
        this.debug("clipboard", "created ClipboardItem", item);
        const items = [item];
        this.debug("clipboard", "created ClipboardItem list", items);
        navigator.clipboard.write(items).then(
          () => this.debug("clipboard", "copied png image to clipboard"),
          (err) => this.debug("clipboard", "failed to set png image", err)
        );
      }
    }
  }

  _process_set_clipboard_enabled(packet) {
    if (!this.clipboard_enabled) {
      return;
    }
    this.clipboard_enabled = packet[1];
    this.log(
      "server set clipboard state to " + packet[1] + " reason was: " + packet[2]
    );
  }

  _process_clipboard_request(packet) {
    // we shouldn't be handling clipboard requests
    // unless we have support for navigator.clipboard:
    const request_id = packet[1],
      selection = packet[2];

    this.debug("clipboard", selection + " request");

    //we only handle CLIPBOARD requests,
    //PRIMARY is used read-only
    if (selection != "CLIPBOARD") {
      this.send_clipboard_string(request_id, selection, "");
      return;
    }

    if (navigator.clipboard) {
      if ({}.hasOwnProperty.call((navigator.clipboard, "read"))) {
        this.debug("clipboard", "request using read()");
        navigator.clipboard.read().then(
          (data) => {
            let item = null;
            let itemtype = null;
            this.debug("clipboard", "request via read() data=", data);
            for (let i = 0; i < data.length; i++) {
              item = data[i];
              this.debug("clipboard", "item", i, "types:", item.types);
              for (let j = 0; j < item.types.length; j++) {
                itemtype = item.types[j];
                if (itemtype == "text/plain") {
                  item.getType(itemtype).then(
                    (blob) => {
                      const fileReader = new FileReader();
                      fileReader.onload = (event) =>
                        this.send_clipboard_string(
                          request_id,
                          selection,
                          event.target.result
                        );
                      fileReader.readAsText(blob);
                    },
                    (err) => {
                      this.debug(
                        "clipboard",
                        "getType('" + itemtype + "') failed",
                        err
                      );
                      //send last server buffer instead:
                      this.resend_clipboard_server_buffer();
                    }
                  );
                  return;
                } else if (itemtype == "image/png") {
                  item.getType(itemtype).then(
                    (blob) => {
                      const fileReader = new FileReader();
                      fileReader.onload = (event) =>
                        this.send_clipboard_contents(
                          request_id,
                          selection,
                          itemtype,
                          8,
                          "bytes",
                          event.target.result
                        );
                      fileReader.readAsText(blob);
                    },
                    (err) => {
                      this.debug(
                        "clipboard",
                        "getType('" + itemtype + "') failed",
                        err
                      );
                      //send last server buffer instead:
                      this.resend_clipboard_server_buffer(
                        request_id,
                        selection
                      );
                    }
                  );
                  return;
                }
              }
            }
          },
          (err) => {
            this.debug("clipboard", "read() failed:", err);
            //send last server buffer instead:
            this.resend_clipboard_server_buffer(request_id, selection);
          }
        );
        return;
      } else if ({}.hasOwnProperty.call((navigator.clipboard, "readText"))) {
        this.debug("clipboard", "clipboard request using readText()");
        navigator.clipboard.readText().then(
          (text) => {
            this.debug(
              "clipboard",
              "clipboard request via readText() text=",
              text
            );
            const primary_server_buffer =
              this.clipboard_server_buffers["PRIMARY"];
            if (
              primary_server_buffer &&
              primary_server_buffer[2] == 8 &&
              primary_server_buffer[3] == "bytes" &&
              text == primary_server_buffer[4]
            ) {
              //we have set the clipboard contents to the PRIMARY selection
              //and the server is asking for the CLIPBOARD selection
              //send it back the last value it gave us
              this.debug("clipboard request: using backup value");
              this.resend_clipboard_server_buffer(request_id, selection);
              return;
            }
            this.send_clipboard_string(request_id, selection, text);
          },
          (err) => {
            this.debug("clipboard", "readText() failed:", err);
            //send last server buffer instead:
            this.resend_clipboard_server_buffer(request_id, selection);
          }
        );
        return;
      }
    }
    const clipboard_buffer = this.get_clipboard_buffer() || "";
    this.send_clipboard_string(
      request_id,
      selection,
      clipboard_buffer,
      "UTF8_STRING"
    );
  }

  resend_clipboard_server_buffer(request_id, selection) {
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
    this.send_clipboard_contents(
      request_id,
      selection,
      dtype,
      dformat,
      wire_encoding,
      wire_data
    );
  }

  send_clipboard_string(request_id, selection, clipboard_buffer, datatype) {
    let packet;
    if (clipboard_buffer == "") {
      packet = ["clipboard-contents-none", request_id, selection];
    } else {
      packet = [
        "clipboard-contents",
        request_id,
        selection,
        datatype || "UTF8_STRING",
        8,
        "bytes",
        clipboard_buffer,
      ];
    }
    this.debug("clipboard", "send_clipboard_string: packet=", packet);
    this.send(packet);
  }

  send_clipboard_contents(
    request_id,
    selection,
    datatype,
    dformat,
    encoding,
    clipboard_buffer
  ) {
    let packet;
    if (clipboard_buffer == "") {
      packet = ["clipboard-contents-none", request_id, selection];
    } else {
      packet = [
        "clipboard-contents",
        request_id,
        selection,
        datatype,
        dformat || 8,
        encoding || "bytes",
        clipboard_buffer,
      ];
    }
    this.send(packet);
  }

  /**
   * File transfers and printing
   */
  _process_send_file(packet) {
    const basefilename = Utilities.s(packet[1]);
    const mimetype = Utilities.s(packet[2]);
    const printit = packet[3];
    const filesize = packet[5];
    const data = packet[6];
    const options = packet[7] || {};
    const send_id = Utilities.s(packet[8]);

    // check the data size for file
    if (filesize <= 0 || filesize > FILE_SIZE_LIMIT) {
      this.error(
        "send-file: invalid data size, received",
        data.length,
        "bytes, expected",
        filesize
      );
      return;
    }
    let digest = null;
    for (let hash_fn of ["sha512", "sha384", "sha256", "sha224", "sha1"]) {
      if (options[hash_fn]) {
        try {
          digest = forge.md[hash_fn].create();
          break;
        } catch (e) {
          this.error("Error: no", hash_fn, "checksum available:", e);
        }
      }
    }
    if (data.length == filesize) {
      //got the whole file
      if (digest) {
        digest.update(Utilities.Uint8ToString(data));
        this.log("digest.update(", data, ")");
        this.log("digest update string:", Utilities.Uint8ToString(data));
        if (!this.verify_digest(digest, options[digest.algorithm])) {
          return;
        }
      }
      this._got_file(basefilename, data, printit, mimetype, options);
      return;
    }
    if (!send_id) {
      this.cerror("send-file: partial file is missing send-id");
      return;
    }
    const chunk_id = Utilities.s(options["file-chunk-id"] || "");
    if (!chunk_id) {
      this.cerror("send-file: partial file is missing file-chunk-id");
      return;
    }
    const chunk = 0;
    if (this.receive_chunks_in_progress.size > MAX_CONCURRENT_FILES) {
      this.cancel_file(
        chunk_id,
        "too many concurrent files being downloaded",
        chunk
      );
      return;
    }
    //start receiving chunks:
    let writer = null;
    try {
      //try to use a stream saver:
      this.debug("file", "streamSaver=", streamSaver);
      streamSaver.mitm = "../mitm.html";
      const fileStream = streamSaver.createWriteStream(basefilename, {
        size: filesize,
      });
      writer = fileStream.getWriter();
      this.debug("file", "stream writer=", writer);
    } catch (e) {
      writer = [];
      this.error("cannot use streamSaver:", e);
    }
    const timer = setTimeout(
      () => this._check_chunk_receiving(chunk_id, chunk),
      CHUNK_TIMEOUT
    );
    const openit = true;
    const chunk_state = [
      Date.now(),
      writer,
      basefilename,
      mimetype,
      printit,
      openit,
      filesize,
      options,
      digest,
      0,
      false,
      send_id,
      timer,
      chunk,
    ];
    this.receive_chunks_in_progress.set(chunk_id, chunk_state);
    this.send(["ack-file-chunk", chunk_id, true, "", chunk]);
    this.log(
      "receiving chunks for",
      basefilename,
      "with transfer id",
      chunk_id
    );
  }

  _check_chunk_receiving(chunk_id, chunk_no) {
    const chunk_state = this.receive_chunks_in_progress.get(chunk_id);
    this.debug(
      "file",
      "check_chunk_receiving(",
      chunk_id,
      ",",
      chunk_no,
      ") chunk_state=",
      chunk_state
    );
    if (!chunk_state) {
      return;
    }
    if (chunk_state[10]) {
      //transfer has been cancelled
      return;
    }
    chunk_state[12] = 0; //this timer has been used
    if (chunk_state[13] == 0) {
      this.cerror("Error: chunked file transfer", chunk_id, "timed out");
      this.receive_chunks_in_progress.delete(chunk_id);
    }
  }

  cancel_all_files(reason = "closing") {
    this.clog(
      "cancel_all_files(",
      reason,
      ") will cancel:",
      Array.from(this.receive_chunks_in_progress.keys())
    );
    for (let chunk_id of this.receive_chunks_in_progress.keys()) {
      this.cancel_file(chunk_id, reason);
    }
  }

  active_file_transfers() {
    return this.receive_chunks_in_progress.size;
  }

  cancel_file(chunk_id, message, chunk) {
    const chunk_state = this.receive_chunks_in_progress.get(chunk_id);
    if (chunk_state) {
      //mark it as cancelled:
      chunk_state[10] = true;
      //free the buffers
      const writer = chunk_state[1];
      if (writer.abort) {
        writer.abort();
      }
      chunk_state[1] = null;
      //stop the timer
      const timer = chunk_state[12];
      if (timer) {
        clearTimeout(timer);
        chunk_state[12] = 0;
      }
      //remove this transfer after a little while,
      //so in-flight packets won't cause errors
      setTimeout(() => this.receive_chunks_in_progress.delete(chunk_id), 20000);
    }
    this.send(["ack-file-chunk", chunk_id, false, message, chunk]);
  }

  _process_send_file_chunk(packet) {
    const chunk_id = Utilities.s(packet[1]),
      chunk = packet[2],
      file_data = packet[3],
      has_more = packet[4];
    this.debug(
      "file",
      "_process_send_file_chunk(",
      chunk_id,
      chunk,
      "" + file_data.length + " bytes",
      has_more,
      ")"
    );
    const chunk_state = this.receive_chunks_in_progress.get(chunk_id);
    if (!chunk_state) {
      this.error("Error: cannot find the file transfer id", chunk_id);
      this.cancel_file(
        chunk_id,
        "file transfer id" + chunk_id + "not found",
        chunk
      );
      return;
    }
    if (chunk_state[10]) {
      this.debug(
        "file",
        "got chunk for a cancelled file transfer, ignoring it"
      );
      return;
    }
    const filesize = chunk_state[6];
    if (chunk_state[13] + 1 != chunk) {
      this.cancel_file(
        chunk_id,
        "chunk number mismatch, expected " +
          (chunk_state[13] + 1) +
          " but got " +
          chunk
      );
      return;
    }
    //update chunk number:
    chunk_state[13] = chunk;
    const written = chunk_state[9] + file_data.length;
    if (written > filesize) {
      this.cancel_file(chunk_id, "too much data received");
      return;
    }
    const writer = chunk_state[1];
    if (writer.write) {
      //this is a file stream writer:
      try {
        const p = writer.write(file_data);
        //depending on the implementation,
        //this may be a promise:
        if (p) {
          p.then(
            () => {
              chunk_state[9] = written;
              this.file_chunk_written(packet);
            },
            (err) => {
              let msg = "cannot write file data, download cancelled?";
              if (err) {
                this.clog("write failed:", err);
                msg =
                  "cannot write file data: " + err + ", download cancelled?";
              }
              this.cancel_file(chunk_id, msg);
            }
          );
          //we will continue when the promise resolves, see above
          return;
        }
        this.clog("write(..)=", p);
      } catch (e) {
        const msg = "cannot write file data - download cancelled?";
        this.error(e);
        this.cancel_file(chunk_id, msg);
        return;
      }
    } else {
      //just a plain array:
      writer.push(file_data);
    }
    chunk_state[9] = written;
    this.file_chunk_written(packet);
  }

  file_chunk_written(packet) {
    const chunk_id = Utilities.s(packet[1]),
      chunk = packet[2],
      file_data = packet[3],
      has_more = packet[4];
    const chunk_state = this.receive_chunks_in_progress.get(chunk_id),
      writer = chunk_state[1],
      filesize = chunk_state[6],
      digest = chunk_state[8],
      written = chunk_state[9];
    if (digest) {
      digest.update(Utilities.Uint8ToString(file_data));
    }
    this.send(["ack-file-chunk", chunk_id, true, "", chunk]);
    if (has_more) {
      const timer = chunk_state[12];
      if (timer) {
        clearTimeout(timer);
      }
      //remote end will send more after receiving the ack
      chunk_state[12] = setTimeout(
        () => this._check_chunk_receiving(chunk_id, chunk),
        CHUNK_TIMEOUT
      );
      return;
    }
    this.receive_chunks_in_progress.delete(chunk_id);
    //check file size and digest then process it:
    if (written != filesize) {
      this.cancel_file(
        chunk_id,
        "file size mismatch: expected a file of " +
          filesize +
          " bytes but got " +
          written
      );
      return;
    }
    const options = chunk_state[7];
    if (digest && !this.verify_digest(digest, options[digest.algorithm])) {
      this.cancel_file(chunk_id, "" + digest.algorithm + " checksum mismatch");
      return;
    }
    const start_time = chunk_state[0];
    const elapsed = Date.now() - start_time;
    this.clog(
      filesize,
      "bytes received in",
      chunk,
      "chunks, took",
      Math.round(elapsed * 1000),
      "ms"
    );
    const filename = chunk_state[2];
    const mimetype = chunk_state[3];
    const printit = chunk_state[4];
    //join all the data into a single typed array:
    const data = new Uint8Array(filesize);
    let start = 0;
    if (writer.close) {
      writer.close();
    } else {
      const chunks = chunk_state[1];
      for (let i = 0; i < chunks.length; ++i) {
        data.set(chunks[i], start);
        start += chunks[i].length;
      }
      this._got_file(filename, data, mimetype, printit, mimetype, options);
    }
  }

  verify_digest(digest, expected_value) {
    const algo = digest.algorithm;
    const value = digest.digest().data;
    const hex_value = Utilities.convertToHex(value);
    if (hex_value != expected_value.toLowerCase()) {
      this.error("Error verifying", algo, "file checksum");
      this.error(" expected", expected_value, "but got", hex_value);
      return false;
    }
    this.log("verified", algo, "digest of file transfer");
    return true;
  }

  _got_file(basefilename, data, printit, mimetype, options) {
    if (printit) {
      this.print_document(basefilename, data, mimetype);
    } else {
      this.save_file(basefilename, data, mimetype);
    }
  }

  save_file(filename, data, mimetype) {
    if (!this.file_transfer || !this.remote_file_transfer) {
      this.warn("Received file-transfer data but this is not enabled!");
      return;
    }
    if (mimetype == "") {
      mimetype = "application/octet-binary";
    }
    this.log(
      "saving " +
        data.length +
        " bytes of " +
        mimetype +
        " data to filename " +
        filename
    );
    Utilities.saveFile(filename, data, { type: mimetype });
  }

  print_document(filename, data, mimetype) {
    if (!this.printing || !this.remote_printing) {
      this.warn("Received data to print but printing is not enabled!");
      return;
    }
    if (mimetype != "application/pdf") {
      this.warn("Received unsupported print data mimetype: " + mimetype);
      return;
    }
    this.log("got " + data.length + " bytes of PDF to print");
    var file = new Blob([data], { type: mimetype });
    var fileURL = URL.createObjectURL(file);
    const win = window.open(fileURL);
    if (!win || win.closed || typeof win.closed == "undefined") {
      this.warn("popup blocked, saving to file instead");
      Utilities.saveFile(filename, data, { type: mimetype });
    } else {
      win.print();
    }
  }

  send_all_files(files) {
    for (let i = 0, f; (f = files[i]); i++) {
      this.send_file(f);
    }
  }

  send_file(f) {
    clog("send_file:", f.name, ", type:", f.type, ", size:", f.size);
    const me = this;
    const fileReader = new FileReader();
    fileReader.onloadend = (evt) => {
      const u8a = new Uint8Array(evt.target.result);
      var buf = u8a;
      if (client.packet_encoder != "rencodeplus") {
        buf = Utilities.Uint8ToString(u8a);
      }
      this.do_send_file(f.name, f.type, f.size, buf);
    };
    fileReader.readAsArrayBuffer(f);
  }

  do_send_file(filename, mimetype, size, buffer) {
    if (!this.file_transfer || !this.remote_file_transfer) {
      this.warn("cannot send file: file transfers are disabled!");
      return;
    }
    let cdata = buffer;
    const options = {};
    const chunk_size = Math.min(FILE_CHUNKS_SIZE, this.remote_file_chunks || 0);
    if (chunk_size > 0 && size > chunk_size) {
      if (this.send_chunks_in_progress.size >= MAX_CONCURRENT_FILES) {
        throw Exception(
          "too many file transfers in progress:" +
            this.send_chunks_in_progress.size
        );
      }
      //chunking is supported and the file is big enough
      const chunk_id = Utilities.getHexUUID();
      options["file-chunk-id"] = chunk_id;
      //timer to check that the other end is requesting more chunks:
      const timer = setTimeout(() => {
        this._check_chunk_sending(chunk_id, 0);
      }, CHUNK_TIMEOUT);
      const chunk_state = [Date.now(), buffer, chunk_size, timer, 0];
      this.send_chunks_in_progress.set(chunk_id, chunk_state);
      cdata = "";
      this.debug(
        "file",
        "using chunks, sending initial file-chunk-id=",
        chunk_id,
        ", for chunk size",
        chunk_size
      );
    } else {
      //send everything now:
      this.debug(
        "file",
        "sending full file:",
        size,
        "bytes, chunk size",
        chunk_size
      );
    }
    const packet = [
      "send-file",
      filename,
      mimetype,
      false,
      this.remote_open_files,
      size,
      cdata,
      options,
    ];
    this.send(packet);
  }

  _check_chunk_sending(chunk_id, chunk_no) {
    const chunk_state = this.send_chunks_in_progress.get(chunk_id);
    this.debug(
      "file",
      "chunk id",
      chunk_id,
      "chunk_no",
      chunk_no,
      "found chunk_state",
      new Boolean(chunk_state)
    );
    if (!chunk_state) {
      return;
    }
    chunk_state[3] = 0; //timer has fired
    if (chunk_state[13] == chunk_no) {
      this.error("Error: chunked file transfer", chunk_id, "timed out");
      this.error(" on chunk", chunk_no);
      this.cancel_sending(chunk_id);
    }
  }

  cancel_sending(chunk_id) {
    const chunk_state = this.send_chunks_in_progress.get(chunk_id);
    this.debug(
      "file",
      "cancel_sending",
      chunk_id,
      "chunk state found:",
      new Boolean(chunk_state)
    );
    if (!chunk_state) {
      return;
    }
    const timer = chunk_state[3];
    if (timer) {
      chunk_state[3] = 0;
      clearTimeout(timer);
    }
    this.send_chunks_in_progress.delete(chunk_id);
  }

  _process_ack_file_chunk(packet) {
    //the other end received our send-file or send-file-chunk,
    //send some more file data
    this.debug("file", "ack-file-chunk: ", packet);
    const chunk_id = Utilities.s(packet[1]),
      state = packet[2],
      error_message = packet[3];
    let chunk = packet[4];
    if (!state) {
      this.debug("file", "the remote end is cancelling the file transfer:");
      this.debug("file", " %s", Utilities.s(error_message));
      this.cancel_sending(chunk_id);
      return;
    }
    const chunk_state = this.send_chunks_in_progress.get(chunk_id);
    if (!chunk_state) {
      this.error("Error: cannot find the file transfer id '%r'", chunk_id);
      return;
    }
    if (chunk_state[4] != chunk) {
      this.error("Error: chunk number mismatch", chunk_state, "vs", chunk);
      this.cancel_sending(chunk_id);
      return;
    }
    const start_time = chunk_state[0],
      chunk_size = chunk_state[2];
    let timer = chunk_state[3],
      data = chunk_state[1];
    if (!data) {
      //all sent!
      const elapsed = Date.now() - start_time;
      this.log(
        chunk,
        "chunks of",
        chunk_size,
        "bytes sent in",
        Math.round(elapsed),
        "ms",
        (8 * chunk * chunk_size) / elapsed,
        "bps"
      );
      this.cancel_sending(chunk_id);
      return;
    }
    if (chunk_size <= 0) {
      throw Exception("invalid chunk size " + chunk_size);
    }
    //carve out another chunk:
    const cdata = data.subarray(0, chunk_size);
    data = data.subarray(chunk_size);
    chunk += 1;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(
      () => this._check_chunk_sending(chunk_id, chunk),
      CHUNK_TIMEOUT
    );
    this.send_chunks_in_progress.set(chunk_id, [
      start_time,
      data,
      chunk_size,
      timer,
      chunk,
    ]);
    this.send(["send-file-chunk", chunk_id, chunk, cdata, data.length > 0]);
  }

  start_command(name, command, ignore) {
    const packet = ["start-command", name, command, ignore];
    this.send(packet);
  }

  _process_open_url(packet) {
    const url = packet[1];
    if (!this.open_url) {
      this.cwarn("Warning: received a request to open URL", url);
      this.clog(" but opening of URLs is disabled");
      return;
    }
    this.clog("opening url:", url);
    const new_window = window.open(url, "_blank");
    if (
      !new_window ||
      new_window.closed ||
      typeof new_window.closed == "undefined"
    ) {
      //Popup blocked, display link in notification
      const summary = "Open URL";
      const body =
        '<a href="' + url + '" rel="noopener" target="_blank">' + url + "</a>";
      const timeout = 10;
      window.doNotification(
        "",
        0,
        summary,
        body,
        timeout,
        null,
        null,
        null,
        null,
        null
      );
    }
  }
}

/*
 * Copyright (c) 2013-2019 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015 Spikes, Inc.
 * Portions based on websock.js by Joel Martin
 * Copyright (C) 2012 Joel Martin
 *
 * Licensed under MPL 2.0
 *
 * xpra wire protocol with worker support
 *
 * requires:
 *  lz4.js
 *  brotli_decode.js
 */

const CONNECT_TIMEOUT = 15_000;

if (!Object.hasOwn) {
    Object.hasOwn = Object.call.bind(Object.hasOwnProperty);
}

/*
A stub class to facilitate communication with the protocol when
it is loaded in a worker
*/
class XpraProtocolWorkerHost {
  constructor() {
    this.worker = null;
    this.packet_handler = null;
  }

  open(uri) {
    if (this.worker) {
      //re-use the existing worker:
      this.worker.postMessage({ c: "o", u: uri });
      return;
    }
    this.worker = new Worker("js/Protocol.js");
    this.worker.addEventListener(
      "message",
      (e) => {
        const data = e.data;
        switch (data.c) {
          case "r":
            this.worker.postMessage({ c: "o", u: uri });
            break;
          case "p":
            if (this.packet_handler) {
              this.packet_handler(data.p);
            }
            break;
          case "l":
            this.log(data.t);
            break;
          default:
            this.error("got unknown command from worker");
            this.error(e.data);
        }
      },
      false
    );
  }

  close = function () {
    this.worker.postMessage({ c: "c" });
  };

  terminate = function () {
    this.worker.postMessage({ c: "t" });
  };

  send = function (packet) {
    this.worker.postMessage({ c: "s", p: packet });
  };

  set_packet_handler = function (callback) {
    this.packet_handler = callback;
  };

  set_cipher_in = function (caps, key) {
    this.worker.postMessage({ c: "z", p: caps, k: key });
  };

  set_cipher_out = function (caps, key) {
    this.worker.postMessage({ c: "x", p: caps, k: key });
  };

  enable_packet_encoder = function (packet_encoder) {
    this.worker.postMessage({ c: "p", pe: packet_encoder });
  };
}

/*
The main Xpra wire protocol
*/
class XpraProtocol {
  constructor() {
    this.verify_connected_timer = 0;
    this.is_worker = false;
    this.packet_handler = null;
    this.websocket = null;
    this.raw_packets = [];
    this.cipher_in = null;
    this.cipher_in_block_size = null;
    this.cipher_out = null;
    this.rQ = []; // Receive queue
    this.sQ = []; // Send queue
    this.mQ = []; // Worker message queue
    this.header = [];

    //Queue processing via intervals
    this.process_interval = 0; //milliseconds
    this.packet_encoder = "rencodeplus";
  }

  close_event_str(event) {
    const code_mappings = {
      1000: "Normal Closure",
      1001: "Going Away",
      1002: "Protocol Error",
      1003: "Unsupported Data",
      1004: "(For future)",
      1005: "No Status Received",
      1006: "Abnormal Closure",
      1007: "Invalid frame payload data",
      1008: "Policy Violation",
      1009: "Message too big",
      1010: "Missing Extension",
      1011: "Internal Error",
      1012: "Service Restart",
      1013: "Try Again Later",
      1014: "Bad Gateway",
      1015: "TLS Handshake",
    };
    let message = "";
    if (event.code) {
      try {
        message +=
          typeof code_mappings[event.code] !== "undefined"
            ? `'${code_mappings[event.code]}' (${event.code})`
            : `${event.code}`;
        if (event.reason) {
          message += `: '${event.reason}'`;
        }
      } catch (error) {
        this.error("cannot parse websocket event:", error);
        message = "unknown reason";
      }
    } else {
      message = "unknown reason (no websocket error code)";
    }
    return message;
  }

  open(uri) {
    const me = this;
    // (re-)init
    this.raw_packets = [];
    this.rQ = [];
    this.sQ = [];
    this.mQ = [];
    this.header = [];
    this.websocket = null;
    function handle(packet) {
      me.packet_handler(packet);
    }
    this.verify_connected_timer = setTimeout(
      () => handle(["error", "connection timed out", 0]),
      CONNECT_TIMEOUT
    );
    // connect the socket
    try {
      this.websocket = new WebSocket(uri, "binary");
    } catch (error) {
      handle(["error", `${error}`, 0]);
      return;
    }
    this.websocket.binaryType = "arraybuffer";
    this.websocket.addEventListener("open", function () {
      if (me.verify_connected_timer) {
        clearTimeout(me.verify_connected_timer);
        me.verify_connected_timer = 0;
      }
      handle(["open"]);
    });
    this.websocket.addEventListener("close", (event) =>
      handle(["close", me.close_event_str(event)])
    );
    this.websocket.onerror = (event) =>
      handle(["error", me.close_event_str(event), event.code || 0]);
    this.websocket.onmessage = function (e) {
      // push arraybuffer values onto the end
      me.rQ.push(new Uint8Array(e.data));
      setTimeout(function () {
        me.process_receive_queue();
      }, this.process_interval);
    };
  }

  close() {
    if (this.websocket) {
      this.websocket.onopen = null;
      this.websocket.onclose = null;
      this.websocket.onerror = null;
      this.websocket.onmessage = null;
      this.websocket.close();
      this.websocket = null;
    }
  }

  protocol_error(message) {
    this.error("protocol error:", message);
    //make sure we stop processing packets and events:
    this.websocket.onopen = null;
    this.websocket.onclose = null;
    this.websocket.onerror = null;
    this.websocket.onmessage = null;
    this.header = [];
    this.rQ = [];
    //and just tell the client to close (it may still try to re-connect):
    this.packet_handler(["close", message]);
  }

  process_receive_queue() {
    while (this.websocket && this.do_process_receive_queue());
  }

  error() {
    console.error.apply(console, arguments);
  }
  log() {
    console.log.apply(console, arguments);
  }

  do_process_receive_queue() {
    if (this.header.length < 8 && this.rQ.length > 0) {
      //add from receive queue data to header until we get the 8 bytes we need:
      while (this.header.length < 8 && this.rQ.length > 0) {
        const slice = this.rQ[0];
        const needed = 8 - this.header.length;
        const n = Math.min(needed, slice.length);
        this.header.push(...slice.subarray(0, n));
        if (slice.length > needed) {
          //replace the slice with what is left over:
          this.rQ[0] = slice.subarray(n);
        } else {
          //this slice has been fully consumed already:
          this.rQ.shift();
        }
      }

      //verify the header format:
      if (this.header[0] !== 80) {
        let message = `invalid packet header format: ${this.header[0]}`;
        if (this.header.length > 1) {
          let hex = "";
          for (let p of this.header) {
            const v = p.toString(16);
            hex += v.length < 2 ? `0${v}` : v;
          }
          message += `: 0x${hex}`;
        }
        this.protocol_error(message);
        return false;
      }
    }

    if (this.header.length < 8) {
      //we need more data to continue
      return false;
    }

    let proto_flags = this.header[1];
    const proto_crypto = proto_flags & 0x2;
    if (proto_crypto) {
      proto_flags = proto_flags & ~0x2;
    }

    if (proto_flags & 0x8) {
      //this flag is unused client-side, so just ignore it:
      proto_flags = proto_flags & ~0x8;
    }

    if (proto_flags > 1 && proto_flags != 0x10) {
      this.protocol_error(
        `we can't handle this protocol flag yet: ${proto_flags}`
      );
      return;
    }

    const level = this.header[2];
    if (level & 0x20) {
      this.protocol_error("lzo compression is not supported");
      return false;
    }
    const index = this.header[3];
    if (index >= 20) {
      this.protocol_error(`invalid packet index: ${index}`);
      return false;
    }
    let packet_size = [4, 5, 6, 7].reduce(
      (accumulator, value) => accumulator * 0x1_00 + this.header[value],
      0
    );

    // work out padding if necessary
    let padding = 0;
    if (proto_crypto && this.cipher_in_block_size > 0) {
      padding =
        this.cipher_in_block_size - (packet_size % this.cipher_in_block_size);
      packet_size += padding;
    }

    // verify that we have enough data for the full payload:
    let rsize = this.rQ.reduce(
      (accumulator, value) => accumulator + value.length,
      0
    );
    if (rsize < packet_size) {
      return false;
    }

    // done parsing the header, the next packet will need a new one:
    this.header = [];

    let packet_data;
    if (this.rQ[0].length == packet_size) {
      //exact match: the payload is in a buffer already:
      packet_data = this.rQ.shift();
    } else {
      //aggregate all the buffers into "packet_data" until we get exactly "packet_size" bytes:
      packet_data = new Uint8Array(packet_size);
      rsize = 0;
      while (rsize < packet_size) {
        const slice = this.rQ[0];
        const needed = packet_size - rsize;
        if (slice.length > needed) {
          //add part of this slice:
          packet_data.set(slice.subarray(0, needed), rsize);
          rsize += needed;
          this.rQ[0] = slice.subarray(needed);
        } else {
          //add this slice in full:
          packet_data.set(slice, rsize);
          rsize += slice.length;
          this.rQ.shift();
        }
      }
    }

    // decrypt if needed
    if (proto_crypto) {
      this.cipher_in.update(forge.util.createBuffer(uintToString(packet_data)));
      const decrypted = this.cipher_in.output.getBytes();
      if (!decrypted || decrypted.length < packet_size - padding) {
        this.error("error decrypting packet using", this.cipher_in);
        if (decrypted.length < packet_size - padding) {
          this.error(
            ` expected ${packet_size - padding} bytes, but got ${
              decrypted.length
            }`
          );
        } else {
          this.error(" decrypted:", decrypted);
        }
        this.raw_packets = [];
        return this.rQ.length > 0;
      }
      packet_data = Utilities.StringToUint8(
        decrypted.slice(0, packet_size - padding)
      );
    }

    //decompress it if needed:
    if (level != 0) {
      let inflated;
      if (level & 0x10) {
        inflated = lz4.decode(packet_data);
      } else if (level & 0x40) {
        inflated = new Uint8Array(BrotliDecode(packet_data));
      } else {
        throw "zlib is no longer supported";
      }
      packet_data = inflated;
    }

    //save it for later? (partial raw packet)
    if (index > 0) {
      this.raw_packets[index] = packet_data;
      if (this.raw_packets.length >= 4) {
        this.protocol_error(`too many raw packets: ${this.raw_packets.length}`);
        return false;
      }
    } else {
      //decode raw packet string into objects:
      let packet = null;
      try {
        if (proto_flags == 0x1) {
          packet = rdecodelegacy(packet_data);
        } else if (proto_flags == 0x10) {
          packet = rdecodeplus(packet_data);
        } else {
          throw `invalid packet encoder flags ${proto_flags}`;
        }
        for (const index in this.raw_packets) {
          packet[index] = this.raw_packets[index];
        }
        this.raw_packets = {};
      } catch (error) {
        //FIXME: maybe we should error out and disconnect here?
        this.error("error decoding packet", error);
        this.error(`packet=${packet_data}`);
        this.error(`protocol flags=${proto_flags}`);
        this.raw_packets = [];
        return this.rQ.length > 0;
      }
      try {
        // pass to our packet handler
        if (this.is_worker) {
          this.mQ[this.mQ.length] = packet;
          setTimeout(() => this.process_message_queue(), this.process_interval);
        } else {
          this.packet_handler(packet);
        }
      } catch (error) {
        //FIXME: maybe we should error out and disconnect here?
        this.error(`error processing packet ${packet[0]}: ${error}`);
        this.error(` packet data: ${packet_data}`)
      }
    }
    return this.rQ.length > 0;
  }

  enable_packet_encoder(packet_encoder) {
    this.packet_encoder = packet_encoder;
  }

  process_send_queue() {
    while (this.sQ.length > 0 && this.websocket) {
      const packet = this.sQ.shift();
      if (!packet) {
        return;
      }
      if (this.packet_encoder != "rencodeplus") {
        throw `invalid packet encoder: ${this.packet_encoder}`;
      }
      let proto_flags = 0x10;
      let bdata = null;
      try {
        bdata = rencodeplus(packet);
      } catch (error) {
        this.error("Error: failed to encode packet:", packet);
        this.error(" with packet encoder", this.packet_encoder);
        this.error(error);
        continue;
      }
      const payload_size = bdata.length;
      // encryption
      if (this.cipher_out) {
        proto_flags |= 0x2;
        const padding_size =
          this.cipher_out_block_size -
          (payload_size % this.cipher_out_block_size);
        let input_data =
          typeof bdata === "string" ? bdata : Utilities.Uint8ToString(bdata);
        if (padding_size) {
          const padding_char = String.fromCharCode(padding_size);
          input_data += padding_char.repeat(padding_size);
        }
        this.cipher_out.update(forge.util.createBuffer(input_data), "utf8");
        bdata = this.cipher_out.output.getBytes();
      }
      const actual_size = bdata.length;

      const packet_data = new Uint8Array(actual_size + 8);
      const level = 0;
      //header:
      packet_data[0] = "P".charCodeAt(0);
      packet_data[1] = proto_flags;
      packet_data[2] = level;
      packet_data[3] = 0;
      //size header:
      for (let index = 0; index < 4; index++) {
        packet_data[7 - index] = (payload_size >> (8 * index)) & 0xff;
      }
      if (typeof bdata === "object" && bdata.constructor === Uint8Array) {
        packet_data.set(bdata, 8);
      } else {
        //copy string one character at a time..
        for (let index = 0; index < actual_size; index++) {
          packet_data[8 + index] = ord(bdata[index]);
        }
      }
      // put into buffer before send
      if (this.websocket) {
        this.websocket.send(new Uint8Array(packet_data).buffer);
      }
    }
  }

  process_message_queue() {
    while (this.mQ.length > 0) {
      const packet = this.mQ.shift();

      if (!packet) {
        return;
      }

      const raw_buffers = [];
      if (packet[0] === "draw" && "buffer" in packet[7]) {
        raw_buffers.push(packet[7].buffer);
      } else if (
        packet[0] === "sound-data" &&
        Object.hasOwn(packet[2], "buffer")
      ) {
        raw_buffers.push(packet[2].buffer);
      }
      postMessage({ c: "p", p: packet }, raw_buffers);
    }
  }

  send(packet) {
    this.sQ[this.sQ.length] = packet;
    setTimeout(() => this.process_send_queue(), this.process_interval);
  }

  set_packet_handler(callback) {
    this.packet_handler = callback;
  }

  set_cipher_in(caps, key) {
    this.setup_cipher(caps, key, (cipher, block_size, secret, iv) => {
      this.cipher_in_block_size = block_size;
      this.cipher_in = forge.cipher.createDecipher(cipher, secret);
      this.cipher_in.start({ iv });
    });
  }

  set_cipher_out(caps, key) {
    this.setup_cipher(caps, key, (cipher, block_size, secret, iv) => {
      this.cipher_out_block_size = block_size;
      this.cipher_out = forge.cipher.createCipher(cipher, secret);
      this.cipher_out.start({ iv });
    });
  }

  setup_cipher(caps, key, setup_function) {
    if (!key) {
      throw "missing encryption key";
    }
    const cipher = caps["cipher"] || "AES";
    if (cipher != "AES") {
      throw `unsupported encryption specified: '${cipher}'`;
    }
    let key_salt = caps["cipher.key_salt"];
    if (typeof key_salt !== "string") {
      key_salt = String.fromCharCode.apply(null, key_salt);
    }
    const iterations = caps["cipher.key_stretch_iterations"];
    if (iterations < 0) {
      throw `invalid number of iterations: ${iterations}`;
    }
    const DEFAULT_KEYSIZE = 32;
    const key_size = caps["cipher.key_size"] || DEFAULT_KEYSIZE;
    if (![32, 24, 16].includes(key_size)) {
      throw `invalid key size '${key_size}'`;
    }
    const key_stretch = caps["cipher.key_stretch"] || "PBKDF2";
    if (key_stretch.toUpperCase() != "PBKDF2") {
      throw `invalid key stretching function ${key_stretch}`;
    }
    const DEFAULT_KEY_HASH = "SHA1";
    const key_hash = (
      caps["cipher.key_hash"] || DEFAULT_KEY_HASH
    ).toLowerCase();
    const secret = forge.pkcs5.pbkdf2(
      key,
      key_salt,
      iterations,
      key_size,
      key_hash
    );
    const DEFAULT_MODE = "CBC";
    const mode = caps["cipher.mode"] || DEFAULT_MODE;
    let block_size = 0;
    if (mode == "CBC") {
      block_size = 32;
    } else if (!["CFB", "CTR"].includes(mode)) {
      throw `unsupported AES mode '${mode}'`;
    }
    // start the cipher
    const iv = caps["cipher.iv"];
    if (!iv) {
      throw "missing IV";
    }
    //ie: setup_fn("AES-CBC", "THESTRETCHEDKEYVALUE", "THEIVVALUE");
    setup_function(`${cipher}-${mode}`, block_size, secret, iv);
  }
}

/*
If we are in a web worker, set up an instance of the protocol
*/
if (
  !(
    typeof window == "object" &&
    typeof document == "object" &&
    window.document === document
  )
) {
  // some required imports
  // worker imports are relative to worker script path
  importScripts(
    "lib/lz4.js",
    "lib/brotli_decode.js",
    "lib/forge.js",
    "lib/rencode.js"
  );
  // make protocol instance
  const protocol = new XpraProtocol();
  protocol.is_worker = true;
  // we create a custom packet handler which posts packet as a message
  protocol.set_packet_handler((packet) => {
    let raw_buffer = [];
    if (packet[0] === "draw" && Object.hasOwn(packet[7], "buffer")) {
      //zero-copy the draw buffer
      raw_buffer = packet[7].buffer;
      packet[7] = null;
    } else if (
      packet[0] === "send-file-chunk" &&
      Object.hasOwn(packet[3], "buffer")
    ) {
      //zero-copy the file data buffer
      raw_buffer = packet[3].buffer;
      packet[3] = null;
    }
    postMessage({ c: "p", p: packet }, raw_buffer);
  }, null);
  // attach listeners from main thread
  self.addEventListener(
    "message",
    (e) => {
      const data = e.data;
      switch (data.c) {
        case "o":
          protocol.open(data.u);
          break;
        case "s":
          protocol.send(data.p);
          break;
        case "p":
          protocol.enable_packet_encoder(data.pe);
          break;
        case "x":
          protocol.set_cipher_out(data.p, data.k);
          break;
        case "z":
          protocol.set_cipher_in(data.p, data.k);
          break;
        case "c":
          // close the connection
          protocol.close();
          break;
        case "t":
          // terminate the worker
          self.close();
          break;
        default:
          postMessage({ c: "l", t: "got unknown command from host" });
      }
    },
    false
  );
  // tell host we are ready
  postMessage({ c: "r" });
}

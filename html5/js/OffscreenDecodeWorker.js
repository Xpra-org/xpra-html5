/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2022 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

/*
 * Worker for offscreen decoding and painting.
 */

importScripts("./lib/lz4.js");
importScripts("./lib/broadway/Decoder.js");
importScripts("./VideoDecoder.js");
importScripts("./BitmapDecoder.js");
importScripts("./RgbHelpers.js");
importScripts("./Constants.js");

// WindowDecoder for each window we have control over:
const offscreen_canvas = new Map();

const image_coding = [
  "rgb",
  "rgb32",
  "rgb24",
  "jpeg",
  "png",
  "png/P",
  "png/L",
  "webp",
  "avif",
];
const video_coding = [];
if (XpraVideoDecoderLoader.hasNativeDecoder) {
  // We can support native H264 decoding
  video_coding.push("h264");
} else {
  console.warn("Offscreen decoding is available for images only. Please consider using Google Chrome 94+ in a secure (SSL or localhost) context h264 offscreen decoding support.");
}



const all_encodings = new Set([
  "void",
  "scroll",
  ...image_coding,
  ...video_coding,
]);

function send_decode_error(packet, error) {
  packet[7] = null;
  self.postMessage({ error: `${error}`, packet });
}


class WindowDecoder {
  constructor(canvas, debug) {
    this.canvas = canvas;
    this.debug = debug;
    this.init();
  }
  init() {
    this.image_decoder = new XpraBitmapDecoder();
    this.video_decoder = new XpraVideoDecoder();

    this.decode_queue = [];
    this.decode_queue_draining = false;
  }

  decode_error(packet, error) {
    const coding = packet[6];
    const packet_sequence = packet[8];
    const message = `failed to decode '${coding}' draw packet sequence ${packet_sequence}: ${error}`;
    console.error(message);
    packet[7] = null;
    send_decode_error(packet, message);
  }

  queue_draw_packet(packet) {
    if (this.closed) {
      return;
    }
    this.decode_queue.push(packet);
    if (!this.decode_queue_draining) {
      this.proccess_decode_queue();
    }
  }

  proccess_decode_queue() {
    this.decode_queue_draining = true;
    const packet = this.decode_queue.shift();
    this.proccess_packet(packet).then(() => {
      if (this.decode_queue.length > 0) {
        // Next
        this.proccess_decode_queue();
      } else {
        this.decode_queue_draining = false;
      }
    })
  }

  async proccess_packet(packet) {
    let coding = packet[6];

    const start = performance.now();
    if (coding == "eos" && this.video_decoder) {
      this.video_decoder._close();
      return;
    }
    else if (image_coding.includes(coding) && !(coding == "scroll" || coding == "void")) {
      await this.image_decoder.convertToBitmap(packet);
    } else if (video_coding.includes(coding)) {
      if (!this.video_decoder.initialized) {
        // Init with width and heigth of this packet.
        // TODO: Use video max-size? It does not seem to matter.
        this.video_decoder.init(packet[4], packet[5]);
      }
      await this.video_decoder.queue_frame(packet);
    } else {
      this.decode_error(packet, `unsupported encoding: '${coding}'`);
    }

    // Update the coding propery
    coding = packet[6];
    const x = packet[2];
    const y = packet[3];
    const width = packet[4];
    const height = packet[5];
    const data = packet[7];

    let context = this.canvas.getContext("2d");
    if (coding.startsWith("bitmap")) {
      // Bitmap paint
      context.imageSmoothingEnabled = false;
      context.clearRect(x, y, width, height);
      context.drawImage(data, x, y, width, height);
      this.paint_box(coding, context, x, y, width, height);
    } else if (coding == "scroll") {
      context.imageSmoothingEnabled = false;
      for (let index = 0, stop = data.length; index < stop; ++index) {
        const scroll_data = data[index];
        const sx = scroll_data[0];
        const sy = scroll_data[1];
        const sw = scroll_data[2];
        const sh = scroll_data[3];
        const xdelta = scroll_data[4];
        const ydelta = scroll_data[5];
        context.drawImage(
          this.canvas,
          sx,
          sy,
          sw,
          sh,
          sx + xdelta,
          sy + ydelta,
          sw,
          sh
        );
        this.paint_box(coding, context, sx, sy, sw, sh);
      }
    } else if (coding.startsWith("frame")) {
      let enc_width = width;
      let enc_height = height;
      const options = packet[10] || {};
      const scaled_size = options["scaled_size"];
      if (scaled_size && (enc_width > width || enc_height > height)) {
        enc_width = scaled_size[0];
        enc_height = scaled_size[1];
      }
      context.drawImage(data, x, y, enc_width, enc_height);
      data.close();
      this.paint_box(coding, context, x, y, enc_width, enc_height);
    }

    // Decode ok.
    const options = packet[10] || {};
    const decode_time = Math.round(1000 * (performance.now() - start));
    options["decode_time"] = Math.max(0, decode_time);
    packet[6] = "offscreen-painted";
    packet[7] = null;
    packet[10] = options;
    self.postMessage({ draw: packet, start });
  }

  paint_box(coding, context, px, py, pw, ph) {
    if (!this.debug) {
      return;
    }
    const source_encoding = coding.split(":")[1] || ""; //ie: "rgb24"
    const box_color = DEFAULT_BOX_COLORS[source_encoding];
    if (box_color) {
      context.strokeStyle = box_color;
      context.lineWidth = 2;
      context.strokeRect(px, py, pw, ph);
    }
  }

  eos() {
    // Add eos packet to queue to prevent closing the decoder before all packets are proceeded
    const packet = [];
    packet[6] = "eos";
    this.decode_queue.push(packet);
  }

  update_geometry(w, h) {
    if (this.closed) {
      return;
    }
    if (this.canvas.width == w && this.canvas.height == h) {
      //unchanged
      return;
    }
    this.canvas.width = w;
    this.canvas.height = h;
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this.eos();
    }
  }
}

onmessage = function (e) {
  const data = e.data;
  let wd = null;
  switch (data.cmd) {
    case "check": {
      // Check if we support the given encodings.
      const encodings = [...data.encodings];
      const common = encodings.filter((value) => all_encodings.has(value));
      self.postMessage({ result: true, formats: common });
      break;
    }
    case "eos":
      wd = offscreen_canvas.get(data.wid);
      if (wd) {
        wd.eos();
      }
      break;
    case "remove":
      wd = offscreen_canvas.get(data.wid);
      if (wd) {
        wd.close();
        offscreen_canvas.delete(data.wid);
      }
      break;
    case "decode": {
      const packet = data.packet;
      const wid = packet[1];
      wd = offscreen_canvas.get(wid);
      if (wd) {
        wd.queue_draw_packet(packet);
      } else {
        send_decode_error(packet, `no window decoder found for wid ${wid}, only:${[...offscreen_canvas.keys(),].join(",")}`);
      }
      break;
    }
    case "redraw":
      wd = offscreen_canvas.get(data.wid);
      if (wd) {
        //wd.redraw();
      }
      break;
    case "canvas":
      console.log(
        "canvas transfer for window",
        data.wid,
        ":",
        data.canvas,
        data.debug
      );
      if (data.canvas) {
        offscreen_canvas.set(
          data.wid,
          new WindowDecoder(data.canvas, data.debug)
        );
      }
      break;
    case "canvas-geo":
      wd = offscreen_canvas.get(data.wid);
      if (wd) {
        wd.update_geometry(data.w, data.h);
      } else {
        console.warn(
          "cannot update canvas geometry, window",
          data.wid,
          "not found"
        );
      }
      break;
    default:
      console.error(`Offscreen decode worker got unknown message: ${data.cmd}`);
  }
};

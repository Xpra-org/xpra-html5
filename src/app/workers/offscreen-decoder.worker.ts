/// <reference lib="webworker" />
/*
 * This file is part of Xpra.
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2022 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

import { XpraImageDecoder } from '../decoders/image-decoder';
import { XpraVideoDecoder, XpraVideoDecoderLoader } from '../decoders/video-decoder';

/*
 * Worker for offscreen decoding.
 */

// importScripts("./lib/lz4.js");
// importScripts("./lib/broadway/Decoder.js");

// WindowDecoder for each window we have control over:
const window_decoders = new Map<string, WindowDecoder>();

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
const video_coding: string[] = [];
if (XpraVideoDecoderLoader.hasNativeDecoder()) {
  // We can support native H264 & VP8 decoding
  video_coding.push("h264");
  video_coding.push("vp8");
  video_coding.push("vp9");
} else {
  console.warn(
    "Offscreen decoding is available for images only. Please consider using Google Chrome 94+ in a secure (SSL or localhost) context h264 offscreen decoding support."
  );
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

const paint_worker = new Worker(new URL("./paint.worker", import.meta.url));

class WindowDecoder {
  image_decoder: any;
  video_decoder: any;
  decode_queue: any[];
  decode_queue_draining: boolean;
  closed: any;

  constructor(private wid, canvas, debug) {

    paint_worker.postMessage(
      {
        cmd: "canvas",
        wid,
        canvas,
        debug,
      },
      [canvas]
    );

    this.image_decoder = new XpraImageDecoder();
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
      this.process_decode_queue();
    }
  }

  process_decode_queue() {
    this.decode_queue_draining = true;
    const packet = this.decode_queue.shift();
    this.process_packet(packet).then(
      () => {
        if (this.decode_queue.length > 0) {
          // Next
          this.process_decode_queue();
        } else {
          this.decode_queue_draining = false;
        }
      },
      (error) => {
        send_decode_error(packet, error);
      }
    );
  }

  async process_packet(packet) {
    let coding = packet[6];
    const start = performance.now();
    if (coding == "eos" && this.video_decoder) {
      this.video_decoder._close();
      return;
    } else if (coding == "scroll" || coding == "void") {
      // Nothing to do
    } else if (image_coding.includes(coding)) {
      await this.image_decoder.convertToBitmap(packet);
    } else if (video_coding.includes(coding)) {
      if (coding == "vp9") {
        // Prepare the VP9 codec (if needed)
        const csc = packet[10]["csc"];
        this.video_decoder.prepareVP9params(csc);
      }

      if (!this.video_decoder.initialized) {
        this.video_decoder.init(coding);
      }
      await this.video_decoder.queue_frame(packet);
    } else {
      this.decode_error(packet, `unsupported encoding: '${coding}'`);
    }

    // Fake packet to send back
    const options = packet[10] || {};
    const decode_time = Math.round(1000 * (performance.now() - start));
    options["decode_time"] = Math.max(0, decode_time);
    // Copy without data
    const clonepacket = packet.map((x, i) => {
      if (i !== 7) {
        return x;
      }
    });
    clonepacket[6] = "offscreen-painted";
    clonepacket[10] = options;

    // Tell the server we are done with this packet
    self.postMessage({ draw: clonepacket, start });

    // Paint the packet on screen refresh (if we can use requestAnimationFrame in the worker)
    paint_worker.postMessage(
      {
        cmd: "paint",
        image: packet[7],
        wid: packet[1],
        coding: packet[6],
        x: packet[2],
        y: packet[3],
        w: packet[4],
        h: packet[5],
      },
      [packet[7]]
    );
  }

  eos() {
    // Add eos packet to queue to prevent closing the decoder before all packets are proceeded
    const packet: any[] = [];
    packet[6] = "eos";
    this.decode_queue.push(packet);
  }

  close() {
    paint_worker.postMessage({
      cmd: "remove",
      wid: this.wid,
    });
    if (!this.closed) {
      this.closed = true;
      this.eos();
    }
  }
}

onmessage = function (e) {
  const data = e.data;
  let wd: WindowDecoder;
  switch (data.cmd) {
    case "check": {
      // Check if we support the given encodings.
      const encodings = [...data.encodings];
      const common = encodings.filter((value) => all_encodings.has(value));
      self.postMessage({ result: true, formats: common });
      break;
    }
    case "eos":
      wd = window_decoders.get(data.wid) as WindowDecoder;
      if (wd) {
        wd.eos();
      }
      break;
    case "remove":
      wd = window_decoders.get(data.wid) as WindowDecoder;
      if (wd) {
        wd.close();
        window_decoders.delete(data.wid);
      }
      break;
    case "decode": {
      const packet = data.packet;
      const wid = packet[1];
      wd = window_decoders.get(wid) as WindowDecoder;
      if (wd) {
        wd.queue_draw_packet(packet);
      } else {
        send_decode_error(
          packet,
          `no window decoder found for wid ${wid}, only:${[
            ...window_decoders.keys(),
          ].join(",")}`
        );
      }
      break;
    }
    case "redraw":
      paint_worker.postMessage({
        cmd: data.cmd,
        wid: data.wid,
      });
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
        window_decoders.set(
          data.wid,
          new WindowDecoder(data.wid, data.canvas, data.debug)
        );
      }
      break;
    case "canvas-geo":
      paint_worker.postMessage({
        cmd: data.cmd,
        w: data.w,
        h: data.h,
        wid: data.wid,
      });
      break;
    default:
      console.error(`Offscreen decode worker got unknown message: ${data.cmd}`);
  }
};

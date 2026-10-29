/*
 * This file is part of Xpra.
 * Copyright (C) 2026 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 * Run with: node --test tests/
 */

import assert from "node:assert/strict";
import {
  readFileSync
} from "node:fs";
import {
  test
} from "node:test";
import vm from "node:vm";

function load_video_decoder(createImageBitmap, globals = {}) {
  const source = readFileSync(new URL("../html5/js/VideoDecoder.js", import.meta.url), "utf8");
  const warnings = [];
  const context = vm.createContext({
    console: {
      warn: (...args) => warnings.push(args.join(" ")),
      error: () => {},
    },
    createImageBitmap,
    setTimeout,
    clearTimeout,
    ...globals,
  });
  vm.runInContext(`${source}\nthis.XpraVideoDecoder = XpraVideoDecoder;`, context);
  return {
    XpraVideoDecoder: context.XpraVideoDecoder,
    warnings
  };
}

function fake_frame(displayWidth, displayHeight) {
  return {
    displayWidth,
    displayHeight,
    closed: false,
    close() {
      this.closed = true;
    },
  };
}

test("frames with the expected size are drawn as they are", async () => {
  let converted = false;
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {
    converted = true;
  });
  const frame = fake_frame(546, 278);
  const image = await XpraVideoDecoder.crop_padded_frame(frame, 546, 278);
  assert.equal(image, frame);
  assert.equal(converted, false);
  assert.equal(frame.closed, false);
});

test("padded frames are converted to a bitmap and closed", async () => {
  const bitmap = {
    width: 576,
    height: 288
  };
  let source = null;
  const {
    XpraVideoDecoder
  } = load_video_decoder(async (frame) => {
    source = frame;
    return bitmap;
  });
  const frame = fake_frame(576, 288);
  const image = await XpraVideoDecoder.crop_padded_frame(frame, 546, 278);
  assert.equal(image, bitmap);
  assert.equal(source, frame);
  assert.equal(frame.closed, true);
});

test("padding in a single dimension is enough to convert", async () => {
  const bitmap = {
    width: 768,
    height: 192
  };
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => bitmap);
  const frame = fake_frame(768, 192);
  assert.equal(await XpraVideoDecoder.crop_padded_frame(frame, 768, 186), bitmap);
});

test("the frame is kept when the conversion fails", async () => {
  const {
    XpraVideoDecoder,
    warnings
  } = load_video_decoder(async () => {
    throw new Error("not supported");
  });
  const frame = fake_frame(576, 288);
  const image = await XpraVideoDecoder.crop_padded_frame(frame, 546, 278);
  assert.equal(image, frame);
  assert.equal(frame.closed, false);
  assert.equal(warnings.length, 1);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("source_size is the packet size without scaling", () => {
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {});
  const packet = [];
  packet[4] = 2054;
  packet[5] = 1113;
  packet[10] = {};
  assert.deepEqual([...XpraVideoDecoder.source_size(packet)], [2054, 1113]);
});

test("source_size is the scaled size the server encoded", () => {
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {});
  const packet = [];
  packet[4] = 2054;
  packet[5] = 1113;
  packet[10] = {
    scaled_size: [1056, 576]
  };
  assert.deepEqual([...XpraVideoDecoder.source_size(packet)], [1056, 576]);
});

test("scaled frames of the encoded size are drawn as they are", async () => {
  let converted = false;
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {
    converted = true;
  });
  const frame = fake_frame(1056, 576);
  assert.equal(await XpraVideoDecoder.crop_padded_frame(frame, 1056, 576), frame);
  assert.equal(converted, false);
  assert.equal(frame.closed, false);
});

test("with_deadline resolves with the value when it arrives in time", async () => {
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {});
  let released = null;
  const value = await XpraVideoDecoder.with_deadline(
    sleep(5).then(() => "frame"), 200, (v) => {
      released = v;
    });
  assert.equal(value, "frame");
  await sleep(10);
  assert.equal(released, null);
});

test("with_deadline rejects when nothing arrives and releases the late value", async () => {
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {});
  let released = null;
  const late = sleep(60).then(() => "late frame");
  await assert.rejects(
    XpraVideoDecoder.with_deadline(late, 20, (v) => {
      released = v;
    }),
    /no decoded frame after 20ms/
  );
  await late;
  await sleep(0);
  assert.equal(released, "late frame");
});

test("with_deadline passes errors through without releasing anything", async () => {
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {});
  let released = false;
  await assert.rejects(
    XpraVideoDecoder.with_deadline(Promise.reject(new Error("decode failed")), 200, () => {
      released = true;
    }),
    /decode failed/
  );
  assert.equal(released, false);
});

// a decoder that accepts chunks but never outputs a frame,
// like one suspended or reclaimed by the browser:
class StuckVideoDecoder {
  constructor() {
    this.state = "unconfigured";
    this.decodeQueueSize = 0;
  }
  configure() {
    this.state = "configured";
  }
  decode() {
    this.decodeQueueSize += 1;
  }
  close() {
    this.state = "closed";
  }
}

test("queue_frame stops waiting when the decoder is closed", async () => {
  const {
    XpraVideoDecoder
  } = load_video_decoder(async () => {}, {
    VideoDecoder: StuckVideoDecoder,
    VideoColorSpace: class {},
    EncodedVideoChunk: class {
      constructor(init) {
        Object.assign(this, init);
      }
    },
  });
  const decoder = new XpraVideoDecoder();
  decoder.init("h264");
  const packet = [];
  packet[6] = "h264";
  packet[7] = new Uint8Array(4);
  packet[8] = 42;
  packet[10] = {
    frame: 0,
    type: "IDR"
  };
  const waiting = decoder.queue_frame(packet);
  await sleep(10);
  decoder._close();
  await assert.rejects(waiting, /video decoder was reset/);
});

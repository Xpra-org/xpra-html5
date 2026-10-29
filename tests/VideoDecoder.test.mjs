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

function load_video_decoder(createImageBitmap) {
  const source = readFileSync(new URL("../html5/js/VideoDecoder.js", import.meta.url), "utf8");
  const warnings = [];
  const context = vm.createContext({
    console: {
      warn: (...args) => warnings.push(args.join(" "))
    },
    createImageBitmap,
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

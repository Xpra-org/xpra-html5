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

const SCRIPTS = new Set(["./VideoDecoder.js", "./Constants.js"]);

function load_worker() {
  const context = vm.createContext({
    console: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    setTimeout,
    clearTimeout,
    // looks like a browser with WebCodecs, so video codings are enabled:
    VideoDecoder: class {},
    self: {
      postMessage: () => {},
    },
    importScripts: (path) => {
      if (SCRIPTS.has(path)) {
        const source = readFileSync(new URL(`../html5/js/${path.slice(2)}`, import.meta.url), "utf8");
        vm.runInContext(source, context);
      }
    },
  });
  context.XpraImageDecoder = class {};
  const source = readFileSync(new URL("../html5/js/OffscreenDecodeWorker.js", import.meta.url), "utf8");
  vm.runInContext(`${source}\nthis.WindowDecoder = WindowDecoder;`, context);
  return context.WindowDecoder;
}

function recording_canvas() {
  const calls = [];
  const context = {
    imageSmoothingEnabled: true,
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    drawImage: (image, ...args) => calls.push(["drawImage", ...args]),
  };
  return {
    calls,
    context,
    canvas: {
      getContext: () => context,
    },
  };
}

function window_decoder() {
  const WindowDecoder = load_worker();
  const {
    calls,
    context,
    canvas
  } = recording_canvas();
  return {
    decoder: new WindowDecoder(1, canvas, false),
    calls,
    context,
  };
}

test("unscaled bitmaps are drawn from the top-left area of the window size", () => {
  const {
    decoder,
    calls,
    context
  } = window_decoder();
  // a padded frame converted to a bitmap: 576x288 for a 546x278 area
  decoder.do_paint_packet(1, "bitmap:h264", {}, 10, 20, 546, 278, [546, 278]);
  assert.deepEqual(calls, [
    ["clearRect", 10, 20, 546, 278],
    ["drawImage", 0, 0, 546, 278, 10, 20, 546, 278],
  ]);
  assert.equal(context.imageSmoothingEnabled, false);
});

test("scaled bitmaps are stretched over the whole area", () => {
  const {
    decoder,
    calls,
    context
  } = window_decoder();
  decoder.do_paint_packet(1, "bitmap:h264", {}, 0, 0, 2054, 1113, [1056, 576]);
  assert.deepEqual(calls, [
    ["clearRect", 0, 0, 2054, 1113],
    ["drawImage", 0, 0, 1056, 576, 0, 0, 2054, 1113],
  ]);
  assert.equal(context.imageSmoothingEnabled, true);
});

test("scaled video frames are stretched over the whole area and closed", () => {
  const {
    decoder,
    calls,
    context
  } = window_decoder();
  let closed = false;
  const frame = {
    close: () => {
      closed = true;
    }
  };
  decoder.do_paint_packet(1, "frame:h264", frame, 0, 0, 2054, 1113, [1376, 768]);
  assert.deepEqual(calls, [
    ["drawImage", 0, 0, 1376, 768, 0, 0, 2054, 1113],
  ]);
  assert.equal(context.imageSmoothingEnabled, true);
  assert.equal(closed, true);
});

test("image bitmaps without a source size are drawn at the area size", () => {
  const {
    decoder,
    calls,
    context
  } = window_decoder();
  decoder.do_paint_packet(1, "bitmap:png", {}, 5, 6, 300, 200);
  assert.deepEqual(calls, [
    ["clearRect", 5, 6, 300, 200],
    ["drawImage", 0, 0, 300, 200, 5, 6, 300, 200],
  ]);
  assert.equal(context.imageSmoothingEnabled, false);
});

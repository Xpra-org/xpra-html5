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

function load_helper(userAgent) {
  const context = vm.createContext({
    console,
    navigator: {
      userAgent
    },
    OffscreenCanvas: class {},
    Utilities: {
      isSafari: () => /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent),
      isWebkit: () => true,
      isChrome: () => /Chrome/i.test(userAgent),
      isFirefox: () => /Firefox/i.test(userAgent),
    },
  });
  const source = readFileSync(new URL("../html5/js/OffscreenDecodeWorkerHelper.js", import.meta.url), "utf8");
  vm.runInContext(`${source}\nthis.XpraOffscreenWorker = XpraOffscreenWorker;`, context);
  return context.XpraOffscreenWorker;
}

test("Safari below 26 is treated as unsupported for offscreen decode", () => {
  const worker = load_helper("Mozilla/5.0 Version/25.1 Safari/605.1.15");
  assert.equal(worker.isSafariVersionSupported(), false);
  assert.equal(worker.isAvailable(true), false);
});

test("Safari 26 and newer can use offscreen decode over https", () => {
  const worker = load_helper("Mozilla/5.0 Version/26.0 Safari/605.1.15");
  assert.equal(worker.isSafariVersionSupported(), true);
  assert.equal(worker.isAvailable(true), true);
});

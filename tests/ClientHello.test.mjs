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

function load_client() {
  const context = vm.createContext({
    window: {},
    console,
  });
  const source = readFileSync(new URL("../html5/js/Client.js", import.meta.url), "utf8");
  vm.runInContext(`${source}\nthis.XpraClient = XpraClient;`, context);
  return context.XpraClient;
}

// just the encoding state the hello is built from:
function fake_client() {
  const XpraClient = load_client();
  const client = Object.create(XpraClient.prototype);
  client.clog = () => {};
  client.encoding = "auto";
  client.encoding_options = {
    "": client.encoding
  };
  return client;
}

test("the chosen encoding reaches the hello's encoding options", () => {
  const client = fake_client();
  client.set_encoding("h264");
  assert.equal(client.encoding, "h264");
  assert.equal(client.encoding_options[""], "h264");
});

test("set_encoding before the encoding options exist doesn't throw", () => {
  const client = fake_client();
  client.encoding_options = undefined;
  client.set_encoding("webp");
  assert.equal(client.encoding, "webp");
});

test("the hello's auto_refresh_delay follows the encoding option, including 0", () => {
  const client = fake_client();
  assert.equal(client._get_auto_refresh_delay(), 500);
  client.set_encoding_option("auto_refresh_delay", 0);
  assert.equal(client._get_auto_refresh_delay(), 0);
  client.set_encoding_option("auto_refresh_delay", 250);
  assert.equal(client._get_auto_refresh_delay(), 250);
});

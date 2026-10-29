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

// just enough of a client to start audio, recording what happens:
function fake_client(framework, play) {
  const XpraClient = load_client();
  const client = Object.create(XpraClient.prototype);
  client.audio_framework = framework;
  client.audio_codec = "aac+mpeg4";
  client.states = [];
  client.closed = 0;
  client.audio = null;
  client._sound_start_receiving = function() {
    if (framework === "mediasource") {
      this.audio = {
        played: 0,
        play() {
          this.played += 1;
          return play();
        },
      };
    }
  };
  client.on_audio_state_change = function(state, details) {
    this.states.push([state, details]);
  };
  client.close_audio = function() {
    this.closed += 1;
  };
  return client;
}

test("starting audio from a click plays the new audio element right away", async () => {
  const client = fake_client("mediasource", () => Promise.resolve());
  client.on_audio_state_change("waiting", "user action");
  client.user_start_audio();
  assert.equal(client.audio.played, 1);
  assert.deepEqual(client.states, [["waiting", "user action"]]);
  await Promise.resolve();
  assert.equal(client.closed, 0);
});

test("a rejected play() shows the audio as stopped again", async () => {
  const client = fake_client("mediasource", () => Promise.reject(new Error("NotAllowedError")));
  client.on_audio_state_change("waiting", "user action");
  client.user_start_audio();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(client.states.map((s) => s[0]), ["waiting", "error"]);
  assert.match(client.states[1][1], /NotAllowedError/);
  assert.equal(client.closed, 1);
});

test("other audio frameworks are only started, they play on start-of-stream", () => {
  const client = fake_client("aurora", () => Promise.resolve());
  client.on_audio_state_change("waiting", "user action");
  client.user_start_audio();
  assert.equal(client.audio, null);
  assert.deepEqual(client.states, [["waiting", "user action"]]);
});

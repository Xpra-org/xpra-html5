// Run with: node tests/logging.test.js
const assert = require("node:assert/strict");
const {webcrypto} = require("node:crypto");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

const root = join(__dirname, "..");
const source = path => readFileSync(join(root, path), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const secret = "private-password-123";
const mask = "********";

function load(logCredentials = false) {
  const logs = [];
  const document = {};
  const context = vm.createContext({
    console: Object.fromEntries(["log", "debug", "warn", "error", "info"].map(name => [name, (...args) => logs.push(args)])),
    window: {document}, document, crypto: webcrypto, TextEncoder,
    performance: {now: () => 100},
    Uint8ToString: value => String.fromCharCode(...value),
  });
  let utilities = source("html5/js/Utilities.js");
  if (logCredentials) {
    // Exercise the developer override by editing the source, as documented.
    assert.ok(utilities.includes("const LOG_CREDENTIALS = false;"));
    utilities = utilities.replace("const LOG_CREDENTIALS = false;", "const LOG_CREDENTIALS = true;");
  }
  vm.runInContext(utilities + "\nglobalThis.Utilities = Utilities;", context);
  vm.runInContext(source("html5/js/Constants.js"), context);
  vm.runInContext(source("html5/js/Client.js") + "\nglobalThis.XpraClient = XpraClient;", context);
  vm.runInContext(source("html5/js/Protocol.js") + "\nglobalThis.XpraProtocol = XpraProtocol;", context);
  return {context, logs, utilities: context.Utilities};
}

for (const enabled of [false, true]) {
  const mode = enabled ? "development override" : "default redaction";
  const expected = enabled ? secret : mask;

  test(`${mode}: parameters and nested configuration preserve original values`, () => {
    const {context, logs, utilities} = load(enabled);
    const params = {password: secret, token0: secret, key: secret, encoding: "rgb"};
    context.default_settings = {password1: secret};
    utilities.getparam = prop => params[prop];
    context.clog = (...args) => logs.push(args);
    const getparam = source("html5/index.html").match(/const getparam = function\(prop\) \{[\s\S]*?return v;\s*\};/)[0];
    vm.runInContext(getparam + "\nglobalThis.readParameter = getparam;", context);
    for (const prop of ["password", "password1", "token0", "key"]) {
      assert.equal(context.readParameter(prop), secret);
      assert.equal(logs.at(-1)[3], expected);
    }
    assert.equal(context.readParameter("encoding"), "rgb");
    assert.equal(logs.at(-1)[3], "rgb");
    const settings = {
      password: secret, passwords: [secret], token: secret, token9: secret,
      key: secret, "encryption-key": secret, authorization: secret,
      section: {PASSWORD2: secret, encoding: "rgb"},
    };
    const original = JSON.stringify(settings);
    const safe = utilities.obfuscateSettings(settings);
    assert.equal(safe.password, expected);
    assert.equal(safe.section.PASSWORD2, expected);
    assert.equal(safe.section.encoding, "rgb");
    assert.equal(JSON.stringify(settings), original);
    if (!enabled) {
      assert.ok(!JSON.stringify(safe).includes(secret));
    }
  });

  test(`${mode}: native launch retains credentials only in the actual URI`, () => {
    const {context, logs} = load(enabled);
    // Native URIs currently allow these separators without percent encoding.
    const password = "private:/?&#@password";
    const fields = {ssl: {checked: true}, username: {value: "alice"}, password: {value: password},
      server: {value: "example.test"}, port: {value: "14500"}, path: {value: "/"}};
    context.document.getElementById = name => fields[name];
    context.is_password_safe = () => true;
    context.FILE_PROPERTIES = ["key", "encoding"];
    context.get_URL_action = () => new Map([["display", ":1"]]);
    context.get_URL_props = () => new Map([["key", secret], ["encoding", "rgb"]]);
    context.do_add_prop = (prop, value, first) => `${first ? "?" : "&"}${prop}=${encodeURIComponent(value)}`;
    const launcher = source("html5/connect.html").match(/function doConnectURI\(\) \{[\s\S]*?(?=\n      function downloadConnectionFile)/)[0];
    vm.runInContext(launcher + "\ndoConnectURI();", context);
    assert.ok(context.window.location.includes(password));
    assert.ok(context.window.location.includes(`key=${secret}`));
    const logged = logs.find(args => args[0] === "opening client url=")[1];
    assert.equal(logged.includes(password), enabled);
    assert.equal(logged.includes(secret), enabled);
    assert.ok(logged.includes("example.test:14500/1"));
    assert.ok(logged.includes("encoding=rgb"));
  });

  test(`${mode}: prompted and supplied passwords reach authentication unchanged`, () => {
    const {context, logs} = load(enabled);
    for (const prompted of [false, true]) {
      logs.length = 0;
      const client = Object.create(context.XpraClient.prototype);
      const received = [];
      Object.assign(client, {
        protocol: {}, passwords: prompted ? [] : [secret], host: "example.test", port: 14500,
        cancel_open_timer() {}, cancel_hello_timer() {},
        password_prompt_fn: (heading, callback) => callback(secret),
        do_process_challenge: (...args) => received.push(args),
      });
      client._process_challenge(["challenge", new Uint8Array(32), {}, "hmac+sha256", "hmac+sha256"]);
      assert.equal(received.length, 1);
      assert.equal(received[0][3], secret);
      assert.equal(logs.find(args => args[0] === "call_do_process_challenge(")[1], expected);
    }
  });

  test(`${mode}: console and remote parameter logs redact before serialization`, () => {
    const {context, logs, utilities} = load(enabled);
    const packets = [];
    const client = Object.create(context.XpraClient.prototype);
    Object.assign(client, {
      connected: true, remote_logging: true, server_remote_logging: true,
      debug_categories: [], protocol: {send: packet => packets.push(packet)},
    });
    client.log("using password =", utilities.obfuscateParameter("password", secret));
    assert.equal(logs[0][1], expected);
    assert.equal(Buffer.from(packets[0][2]).toString(), `using password = ${expected}`);
    const hello = ["hello", {challenge_response: secret, encoding: "rgb"}];
    client.debug_categories = ["network"];
    client.send(hello);
    assert.equal(packets.at(-1), hello);
    assert.equal(hello[1].challenge_response, secret);
    assert.equal(logs.at(-1)[2][1].challenge_response, expected);
  });

  test(`${mode}: AES derivation receives the original key`, async () => {
    const {context, logs} = load(enabled);
    const imported = [];
    context.crypto = {subtle: {
      importKey(...args) {
        imported.push(Buffer.from(args[1]).toString());
        return webcrypto.subtle.importKey(...args);
      },
      deriveKey: (...args) => webcrypto.subtle.deriveKey(...args),
    }};
    const protocol = new context.XpraProtocol();
    const key = await new Promise((resolve, reject) => {
      protocol.protocol_error = reject;
      protocol.setup_cipher({iv: "0123456789abcdef", key_salt: "salt", key_stretch_iterations: 1000},
        secret, "encrypt", (blockSize, params, cryptoKey) => resolve(cryptoKey));
    });
    assert.deepEqual(imported, [secret]);
    assert.equal(key.algorithm.name, "AES-CBC");
    assert.equal(logs.find(args => args[0] === "importing")[3], expected);
    if (!enabled) {
      assert.ok(!JSON.stringify(logs).includes(secret));
    }
  });
}

test("encoded URL parameter names, repeated secrets and malformed names are hidden", () => {
  const {utilities} = load();
  for (const url of [
    `https://alice:${secret}@example.test/?password=${secret}&token0=${secret}&key=${secret}`,
    `./index.html?p%61ssword=${secret}&TOKEN1=${secret}&encryption-key=${secret}`,
    `./index.html#password=${secret}&password=${secret}&encoding=rgb`,
    `./index.html?%ZZ=${secret}&encoding=rgb`,
  ]) {
    const safe = utilities.obfuscateURL(url);
    assert.ok(!safe.includes(secret), safe);
    assert.ok(safe.includes(mask), safe);
  }
  const publicURL = "https://example.test:14500/path?encoding=rgb&keyboard_layout=gb";
  assert.equal(utilities.obfuscateURL(publicURL), publicURL);
  assert.deepEqual(plain(utilities.obfuscateSettings({keyboard: true, key_size: 32})), {keyboard: true, key_size: 32});
});

test("connection settings and runtime assignment cannot enable the source toggle", () => {
  const {context, utilities} = load();
  context.LOG_CREDENTIALS = true;
  context.window.LOG_CREDENTIALS = true;
  utilities.LOG_CREDENTIALS = true;
  context.default_settings = {LOG_CREDENTIALS: true, log_credentials: true, debug: true};
  assert.equal(utilities.obfuscate(secret), mask);
  assert.throws(() => vm.runInContext("LOG_CREDENTIALS = true;", context), /constant/);
});

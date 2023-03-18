/*
 * This file is part of Xpra.
 * Copyright (C) 2023 Andrew G Knackstedt <andrewk@vivaldi.net>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

/*
  This is a stub class to facilitate communication with the protocol when
  it is loaded in a worker
*/

export class XpraProtocolWorkerHost {
  worker: Worker;
  packet_handler: Function;

  constructor() {
  }

  open(uri) {
    if (this.worker) {
      //re-use the existing worker:
      this.worker.postMessage({ c: "o", u: uri });
      return;
    }
    this.worker = new Worker(new URL("./workers/protocol.worker", import.meta.url));
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
  log(t: any) {
    throw new Error('Method not implemented.');
  }
  error(arg0: string) {
    throw new Error('Method not implemented.');
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
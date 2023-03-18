/// <reference lib="webworker" />
/*
If we are in a web worker, set up an instance of the protocol
*/

// some required imports
// worker imports are relative to worker script path
// importScripts(
//     "lib/brotli_decode.js",
//     "lib/forge.js",
//     "lib/rencode.js"
// );

import { XpraProtocol } from "../protocol";

// make protocol instance
const protocol = new XpraProtocol();
protocol.is_worker = true;
// we create a custom packet handler which posts packet as a message
protocol.set_packet_handler((packet) => {
    let raw_buffer: any[] = [];
    if (packet[0] === "draw" && !!packet[7]["buffer"]) {
        //zero-copy the draw buffer
        raw_buffer = packet[7].buffer;
        packet[7] = null;
    } else if (
        packet[0] === "send-file-chunk" &&
        !!packet[3]["buffer"]
    ) {
        //zero-copy the file data buffer
        raw_buffer = packet[3].buffer;
        packet[3] = null;
    }
    postMessage({ c: "p", p: packet }, raw_buffer as any);
});
// attach listeners from main thread
self.addEventListener(
    "message",
    (e) => {
        const data = e.data;
        switch (data.c) {
            case "o":
                protocol.open(data.u);
                break;
            case "s":
                protocol.send(data.p);
                break;
            case "p":
                protocol.enable_packet_encoder(data.pe);
                break;
            case "x":
                protocol.set_cipher_out(data.p, data.k);
                break;
            case "z":
                protocol.set_cipher_in(data.p, data.k);
                break;
            case "c":
                // close the connection
                protocol.close();
                break;
            case "t":
                // terminate the worker
                self.close();
                break;
            default:
                postMessage({ c: "l", t: "got unknown command from host" });
        }
    },
    false
);
// tell host we are ready
postMessage({ c: "r" });

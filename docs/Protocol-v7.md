# Xpra 7+ protocol compatibility

The HTML5 client requires a server application version of at least 7.0 and
advertises `protocol-version: [7, 0]`. This capability is the minimum peer
version accepted by the client. The server's value is also a minimum, and
does not impose an upper compatibility limit in the HTML5 client. The HTML5
release number is independent of the Xpra protocol version.

Packet names and payloads use the modern dialect, including keyboard and
pointer events, window configuration and acknowledgements, clipboard data,
cursors, audio and file transfers. Incoming `pointer-position` remains valid:
the reference servers still send it for remote pointer updates. Worker commands
such as `draw` and `eos` are internal messages rather than wire packet names.

Hello capabilities use the window, cursor, notification, encoding, display,
file, printer and menu namespaces. Fields still consumed at the top level by
the reference servers remain there, including window metadata, bell, tray,
bandwidth limit and connection information. Packet encoders and compressors
are advertised as explicit lists. Audio capabilities are exchanged after hello.

Every outgoing hello must be smaller than 16 KiB. The check includes the
eight-byte Xpra header and, when encryption is requested, reserves 32 bytes
for an IV and encryption padding. Oversized handshakes close with a clear
message before the hello is sent.

## Manual validation, 2026-10-17

Validation used the local Xpra 7.0 and 8.0 source trees and Chromium 155 over
WebSocket. No automated test suite or new dependencies were added.

| Server | Backwards compatibility | Connected and rendered | 300 KB chunked upload |
| --- | --- | --- | --- |
| 7.0 | enabled | passed | passed |
| 7.0 | disabled | passed | passed |
| 8.0 | enabled | passed | passed |
| 8.0 | disabled | passed | passed |

Uploaded files were compared with the original bytes. Packet inspection showed
modern names, valid reordered window acknowledgements and no unknown-packet
errors in the compatibility matrix.

Additional checks passed:

- Normal windows, override-redirect windows and trays created by a GTK program;
  command startup, cursor updates and bell delivery.
- Keyboard press and release, held-button properties, clamped pointer
  coordinates, precise/emulated wheel packets and discrete wheel-button fallback.
- Clipboard text in both directions, including Unicode; a 48-by-48 PNG forwarded
  from the server to the browser, followed by a browser clipboard request fixture
  producing a binary PNG response with the correct header.
- A 520 KB chunked download reached the save path with a SHA-256 digest matching
  the server's file, including the in-memory fallback when streaming is unavailable.
- Rendering with a decode worker, an offscreen worker and no workers. Offscreen
  eligibility was overridden only in the temporary localhost inspection session
  because Chromium normally requires HTTPS for that path.
- Session information containing floating-point values, menu updates, ping/echo,
  remote logging, display configuration, bandwidth status changes and reconnect.
- Password authentication against an 8.0 server with backwards compatibility
  disabled: the partial hello measured 1,236 bytes and the response hello 2,577 bytes.
- Browser-console version fixtures rejected old, missing and malformed application
  versions, and accepted modern versions regardless of a high server protocol minimum.
- Hello fixtures, including partial and encrypted variants, remained below 2.7 KB.
  An oversized hello was rejected without sending a hello packet.
- Installation into a temporary directory and JavaScript syntax checks on the
  source and installed client.

## Checks requiring another environment

Audio capability exchange and audio-data delivery were observed, but sustained
playback was not verified: the local PulseAudio capture pipeline failed to connect.
Physical printing was unavailable because the test server did not enable printing.
Notification show/close handlers passed browser-console fixtures; live notification
forwarding was unavailable because the D-Bus interface was already claimed.

Server-side consumption of clipboard image replies, a real printer/PDF job, file-download UI completion,
WebTransport, TLS/AES connections and additional browsers still need manual checks.
Encrypted hello sizing was checked with fixtures rather than an encrypted session.
Native input grabs remain unavailable in browsers; grab/ungrab messages are accepted
without requesting pointer lock. Audio levels, keepalives and server events are
accepted as informational messages, without advertising audio keepalive support.

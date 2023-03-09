export type XpraWindowPacket = [
    string,
    number, // wid
    number, // x
    number, // y 
    number, // width
    number, // height
    Object, // metadata
    unknown,
    unknown,
    unknown,
    unknown
];

export type XpraAckFileChunkPacket = [
    "ack-file-chunk",
    number | string, // chunk ID
    boolean, // state
    string, // error message,
    number // chunk
];
export type XpraBellPacket = [
    "bell",
    unknown,
    unknown,
    number, // percent
    number, // pitch
    number, // duration
];
export type Xprabuffer_refreshPacket = [
    "buffer-refresh",
];
export type Xprabutton_actionPacket = [
    "button-action",
];
export type XpraChallengePacket = [
    "challenge",
    string, // server salt
    Object, // cipher out caps,
    string, // digest
    string, // salt digest
    string, // prompt
];
export type XpraClipboardRequestPacket = [
    "clipboard-request",
    number, // requestid
    string, // selection
];
export type XpraClipboardTokenPacket = [
    "clipboard-token",
    string, // selection
    string[], // targets
    string, // target
    string, // dtype
    number, // dformat
    string, // wire_encoding
    string | Uint8Array, // wire_data (possibly always a string)
];
export type XpraClosePacket = [
    "close",
    string, // ?
];
export type Xpraclose_windowPacket = [
    "close-window",
];
export type XpraConfigureOverrideRedirectPacket = [
    "configure-override-redirect",
    number, // window id
    number, // x
    number, // y
    number, // width
    number, // height
];
export type Xpraconfigure_windowPacket = [
    "configure-window",
];
export type Xpraconnection_dataPacket = [
    "connection-data",
];
export type XpraCursorPacket = [
    "cursor",
    "png", // encoding
    unknown,
    unknown,
    number, // w
    number, // h
    number, // xhot,
    number, // yhot
    unknown,
    string | Uint8Array, // img_data
];
export type XpraDesktopSizePacket = [
    "desktop_size",
];
export type XpraDisconnectPacket = [
    "disconnect",
    string, // reason
];
export type XpraDrawPacket = [
    "draw",
    number, // window ID
    number, // x | ImageBitmap
    number, // y
    /** width */
    number,
    /** height */
    number,
    /** coding (RGB) */
    string,
    string | Uint8Array,
    unknown, // packet_sequence?
    number, // rowstride
    Object // {scaled_size, scaling-quality, frame: number, zlib: number, lz4: nubmer}
];
export type XpraEncodingsPacket = [
    "encodings",
    Object, // caps
];
export type XpraEosPacket = [
    "eos",
    number, // wid
];
export type XpraErrorPacket = [
    "error",
    string, // message
    string, // code
];
export type XprafocusPacket = [
    "focus",
];
export type XpraHelloPacket = [
    "hello",
    Object, // Configuration 
];

export type Xprainfo_requestPacket = [
    "info-request",
];
export type XpraInfoResponsePacket = [
    "info-response",
    Object // last info
];
export type XpraInitiateMoveResizePacket = [
    "initiate-moveresize",
    number, // wid
    number, // xroot
    number, // yroot
    number, // direction
    unknown, // button
    unknown, // source_indication
];
export type Xpralayout_changedPacket = [
    "layout-changed",
];
export type XpraloggingPacket = [
    "logging",
];
export type XpraLostWindowPacket = [
    "lost-window",
    number, // wid
];
export type XpraNewOverrideRedirectPacket = [
    "new-override-redirect"
];
export type XpraNewTrayPacket = [
    "new-tray",
    number, // wid
    unknown,
    unknown,
    Object, // metadata
];
export type XpraNewWindowPacket = [
    "new-window"
];
export type XpraNotifyClosePacket = [
    "notify_close",
    number, // notification id
];
export type XpraNotifyShowPacket = [
    "notify_show",
    unknown,
    number, // notification id
    unknown,
    number, // replaces notification (id)
    unknown,
    string, // summary
    unknown,
    string, // body
    number, // expire timeout
    string, // icon
    string[], // actions
    string // hints
];
// > Not consumed
export type XpraOpenPacket = [
    "open"
];
export type XpraOpenUrlPacket = [
    "open-url",
    string, // url
];
export type XpraPingPacket = [
    "ping",
    number, // echotime
    number, // last_ping_server_time
    string, // sid
];
export type XpraPingEchoPacket = [
    "ping_echo",
    number, // last_ping_echoed_time
    number, // l1
    number, // l2
    number, // l3
    number, // client_ping_latency
];
export type XpraPointerPositionPacket = [
    "pointer-position",
    number, // wid
    number, // x
    number, // y
    number, // xhot?
    number, // yhot?

];
export type XpraprintersPacket = [
    "printers",
];
export type XpraRaiseWindowPacket = [
    "raise-window",
    number, // wid
];
export type XpraresumePacket = [
    "resume",
];
export type XpraSendFilePacket = [
    "send-file",
    string, // filename
    string, // mimetype
    unknown, // printit
    unknown, // ?
    number, // filesize
    Uint8Array, // data
    Object, // options
    number, // send_id
];
export type XpraSendFileChunkPacket = [
    "send-file-chunk",
    number, // chunk_id
    number, // chunk
    Uint8Array, // file_data
    boolean, // has_more
];
export type XpraSetClipboardEnabledPacket = [
    "set-clipboard-enabled",
    boolean, // clipboard_enabled
    string, // reason
];
export type XpraSettingChangePacket = [
    "setting-change",
    string, // setting
    Object, // value (xdg_menu)
];
export type Xprasound_controlPacket = [
    "sound-control",
];
export type XpraSoundDataPacket = [
    "sound-data",
    string, // codec
    Uint8Array, // buf
    Object, // options
    Object, // metadata
];
export type XpraStartupCompletePacket = [
    "startup-complete",
];
export type XprasuspendPacket = [
    "suspend",
];
export type Xprawheel_motionPacket = [
    "wheel-motion",
];
export type XpraWindowIconPacket = [
    "window-icon",
    number, // wid
    number, // w
    number, // h
    string, // encoding
    Uint8Array, // img_data
];
export type XpraWindowMetadataPacket = [
    "window-metadata",
    number, // wid
    Object, // metadata
];
export type XpraWindowMoveResizePacket = [
    "window-move-resize",
    number, // wid
    number, // x
    number, // y
    number, // width
    number, // height
];
export type XpraWindowResizedPacket = [
    "window-resized",
    number, // wid
    number, // width
    number, // height
];

export type XpraKeyboardPacket = [
    "key-action",
    number, // wid
    string, // keyname
    boolean, // pressed
    string[], // modifiers
    number, // keyval
    string, // keystring
    number, // keycode
    0 // group
];
/*
 * Copyright (c) 2013-2019 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015 Spikes, Inc.
 * Portions based on websock.js by Joel Martin
 * Copyright (C) 2012 Joel Martin
 *
 * Licensed under MPL 2.0
 *
 * xpra wire protocol with worker support
 *
 * requires:
 *  bencode.js
 *  inflate.js
 *  lz4.js
 *  brotli_decode.js
 */


CONNECT_TIMEOUT = 15000;

/*
A stub class to facilitate communication with the protocol when
it is loaded in a worker
*/
function XpraProtocolWorkerHost() {
	this.worker = null;
	this.packet_handler = null;
	this.packet_ctx = null;
}

XpraProtocolWorkerHost.prototype.open = function(uri) {
	const me = this;
	if (this.worker) {
		//re-use the existing worker:
		this.worker.postMessage({'c': 'o', 'u': uri});
		return;
	}
	this.worker = new Worker('js/Protocol.js');
	this.worker.addEventListener('message', function(e) {
		const data = e.data;
		switch (data.c) {
			case 'r':
				me.worker.postMessage({'c': 'o', 'u': uri});
				break;
			case 'p':
				if(me.packet_handler) {
					me.packet_handler(data.p, me.packet_ctx);
				}
				break;
			case 'l':
				this.log(data.t);
				break;
		default:
			this.error("got unknown command from worker");
			this.error(e.data);
		}
	}, false);
};

XpraProtocolWorkerHost.prototype.close = function() {
	this.worker.postMessage({'c': 'c'});
};

XpraProtocolWorkerHost.prototype.terminate = function() {
	this.worker.postMessage({'c': 't'});
};

XpraProtocolWorkerHost.prototype.send = function(packet) {
	this.worker.postMessage({'c': 's', 'p': packet});
};

XpraProtocolWorkerHost.prototype.set_packet_handler = function(callback, ctx) {
	this.packet_handler = callback;
	this.packet_ctx = ctx;
};

XpraProtocolWorkerHost.prototype.set_cipher_in = function(caps, key) {
	this.worker.postMessage({'c': 'z', 'p': caps, 'k': key});
};

XpraProtocolWorkerHost.prototype.set_cipher_out = function(caps, key) {
	this.worker.postMessage({'c': 'x', 'p': caps, 'k': key});
};

XpraProtocolWorkerHost.prototype.enable_packet_encoder = function(packet_encoder) {
	this.worker.postMessage({'c': 'p', 'pe' : packet_encoder});
}



/*
The main Xpra wire protocol
*/
function XpraProtocol() {
	this.verify_connected_timer = 0;
	this.is_worker = false;
	this.packet_handler = null;
	this.packet_ctx = null;
	this.websocket = null;
	this.raw_packets = [];
	this.cipher_in = null;
	this.cipher_in_block_size = null;
	this.cipher_out = null;
	this.rQ = [];			// Receive queue
	this.sQ = [];			// Send queue
	this.mQ = [];			// Worker message queue
	this.header = [];

	//Queue processing via intervals
	this.process_interval = 0;  //milliseconds
	this.packet_encoder = "bencode";
}

XpraProtocol.prototype.close_event_str = function(event) {
	let code_mappings = {
		'1000': 'Normal Closure',
		'1001': 'Going Away',
		'1002': 'Protocol Error',
		'1003': 'Unsupported Data',
		'1004': '(For future)',
		'1005': 'No Status Received',
		'1006': 'Abnormal Closure',
		'1007': 'Invalid frame payload data',
		'1008': 'Policy Violation',
		'1009': 'Message too big',
		'1010': 'Missing Extension',
		'1011': 'Internal Error',
		'1012': 'Service Restart',
		'1013': 'Try Again Later',
		'1014': 'Bad Gateway',
		'1015': 'TLS Handshake'
		};
	let msg = "";
	if (event.code) {
		try {
			if (typeof(code_mappings[event.code]) !== 'undefined') {
				msg += "'"+code_mappings[event.code]+"' ("+event.code+")";
			}
			else {
				msg += ""+event.code;
			}
			if (event.reason) {
				msg += ": '"+event.reason+"'";
			}
		}
		catch (e) {
			this.error("cannot parse websocket event:", e);
			msg = "unknown reason";
		}
	}
	else {
		msg = "unknown reason (no websocket error code)";
	}
	return msg;
}

XpraProtocol.prototype.open = function(uri) {
	const me = this;
	const ctx = this.packet_ctx;
	// (re-)init
	this.raw_packets = [];
	this.rQ = [];
	this.sQ	= [];
	this.mQ = [];
	this.header  = [];
	this.websocket  = null;
	function handle(packet) {
		me.packet_handler(packet, ctx);
	}
	this.verify_connected_timer = setTimeout(function() {
			handle(['error', "connection timed out", 0]);
		}, CONNECT_TIMEOUT);
	// connect the socket
	try {
		this.websocket = new WebSocket(uri, 'binary');
	}
	catch (e) {
		handle(['error', ""+e, 0]);
		return;
	}
	this.websocket.binaryType = 'arraybuffer';
	this.websocket.onopen = function () {
		if (me.verify_connected_timer) {
			clearTimeout(me.verify_connected_timer);
			me.verify_connected_timer = 0;
		}
		handle(['open']);
	};
	this.websocket.onclose = function (event) {
		handle(['close', me.close_event_str(event)]);
	};
	this.websocket.onerror = function (event) {
		handle(['error', me.close_event_str(event), event.code || 0]);
	};
	this.websocket.onmessage = function (e) {
		// push arraybuffer values onto the end
		me.rQ.push(new Uint8Array(e.data));
		setTimeout(function() {
				me.process_receive_queue();
			}, this.process_interval);
	};
};

XpraProtocol.prototype.close = function() {
	if (this.websocket) {
		this.websocket.onopen = null;
		this.websocket.onclose = null;
		this.websocket.onerror = null;
		this.websocket.onmessage = null;
		this.websocket.close();
		this.websocket = null;
	}
};

XpraProtocol.prototype.protocol_error = function(msg) {
	this.error("protocol error:", msg);
	//make sure we stop processing packets and events:
	this.websocket.onopen = null;
	this.websocket.onclose = null;
	this.websocket.onerror = null;
	this.websocket.onmessage = null;
	this.header = [];
	this.rQ = [];
	//and just tell the client to close (it may still try to re-connect):
	this.packet_handler(['close', msg]);
};

XpraProtocol.prototype.process_receive_queue = function() {
	while (this.websocket && this.do_process_receive_queue()) {
	}
};


XpraProtocol.prototype.error = function() {
	if (console) {
		console.error.apply(console, arguments);
	}
}
XpraProtocol.prototype.log  = function() {
	if (console) {
		console.log.apply(console, arguments);
	}
}

XpraProtocol.prototype.do_process_receive_queue = function() {
	let i = 0, j = 0;
	if (this.header.length<8 && this.rQ.length>0) {
		//add from receive queue data to header until we get the 8 bytes we need:
		while (this.header.length<8 && this.rQ.length>0) {
			const slice = this.rQ[0];
			const needed = 8-this.header.length;
			const n = Math.min(needed, slice.length);
			//copy at most n characters:
			for (i = 0; i < n; i++) {
				this.header.push(slice[i]);
			}
			if (slice.length>needed) {
				//replace the slice with what is left over:
				this.rQ[0] = slice.subarray(n);
			}
			else {
				//this slice has been fully consumed already:
				this.rQ.shift();
			}
		}

		//verify the header format:
		if (this.header[0] !== ord("P")) {
			let msg = "invalid packet header format: " + this.header[0];
			if (this.header.length>1) {
				var hex = '';
				for (var p=0; p<this.header.length; p++) {
					let v = this.header[p].toString(16);
					if (v.length<2) {
						hex += "0"+v;
					}
					else {
						hex += v
					}
				}
				msg += ": 0x"+hex;
			}
			this.protocol_error(msg);
			return false;
		}
	}

	if (this.header.length<8) {
		//we need more data to continue
		return false;
	}

	var proto_flags = this.header[1];
	const proto_crypto = proto_flags & 0x2;
	if (proto_crypto) {
		proto_flags = proto_flags & ~0x2;
	}

	if (proto_flags & 0x8) {
		//this flag is unused client-side, so just ignore it:
		proto_flags = proto_flags & ~0x8;
	}

	if (proto_flags > 1 && proto_flags!=0x10) {
		this.protocol_error("we can't handle this protocol flag yet: "+proto_flags);
		return;
	}

	const level = this.header[2];
	if (level & 0x20) {
		this.protocol_error("lzo compression is not supported");
		return false;
	}
	const index = this.header[3];
	if (index>=20) {
		this.protocol_error("invalid packet index: "+index);
		return false;
	}
	let packet_size = 0;
	for (i=0; i<4; i++) {
		packet_size = packet_size*0x100;
		packet_size += this.header[4+i];
	}

	// work out padding if necessary
	let padding = 0;
	if (proto_crypto && this.cipher_in_block_size>0) {
		padding = (this.cipher_in_block_size - packet_size % this.cipher_in_block_size);
		packet_size += padding;
	}

	// verify that we have enough data for the full payload:
	let rsize = 0;
	for (i=0,j=this.rQ.length;i<j;++i) {
		rsize += this.rQ[i].length;
	}
	if (rsize<packet_size) {
		return false;
	}

	// done parsing the header, the next packet will need a new one:
	this.header = [];

	let packet_data;
	if (this.rQ[0].length==packet_size) {
		//exact match: the payload is in a buffer already:
		packet_data = this.rQ.shift();
	}
	else {
		//aggregate all the buffers into "packet_data" until we get exactly "packet_size" bytes:
		packet_data = new Uint8Array(packet_size);
		rsize = 0;
		while (rsize < packet_size) {
			const slice = this.rQ[0];
			const needed = packet_size - rsize;
			//console.log("slice:", slice.length, "bytes, needed", needed);
			if (slice.length>needed) {
				//add part of this slice:
				packet_data.set(slice.subarray(0, needed), rsize);
				rsize += needed;
				this.rQ[0] = slice.subarray(needed);
			}
			else {
				//add this slice in full:
				packet_data.set(slice, rsize);
				rsize += slice.length;
				this.rQ.shift();
			}
		}
	}

	// decrypt if needed
	if (proto_crypto) {
		this.cipher_in.update(forge.util.createBuffer(uintToString(packet_data)));
		const decrypted = this.cipher_in.output.getBytes();
		if (!decrypted || decrypted.length<packet_size-padding) {
			this.error("error decrypting packet using", this.cipher_in);
			if (decrypted.length<packet_size-padding) {
				this.error(" expected "+(packet_size-padding)+" bytes, but got "+decrypted.length);
			}
			else {
				this.error(" decrypted:", decrypted);
			}
			this.raw_packets = [];
			return this.rQ.length>0;
		}
		packet_data = new Uint8Array(packet_size-padding);
		for (i=0; i<packet_size-padding; i++) {
			packet_data[i] = decrypted[i].charCodeAt(0);
		}
	}

	//decompress it if needed:
	if (level!=0) {
		let inflated;
		if (level & 0x10) {
			inflated = lz4.decode(packet_data);
		} else if (level & 0x40) {
			inflated = BrotliDecode(packet_data);
		} else {
			inflated = new Zlib.Inflate(packet_data).decompress();
		}
		//debug("inflated("+packet_data+")="+inflated);
		packet_data = inflated;
	}

	//save it for later? (partial raw packet)
	if (index>0) {
		//debug("added raw packet for index "+index);
		this.raw_packets[index] = packet_data;
		if (this.raw_packets.length>=4) {
			this.protocol_error("too many raw packets: "+this.raw_packets.length);
			return false;
		}
	} else {
		//decode raw packet string into objects:
		let packet = null;
		try {
			if (proto_flags==0x1) {
				packet = rdecodelegacy(packet_data);
			}
			else if (proto_flags==0x10) {
				packet = rdecodeplus(packet_data);
			} else {
				packet = bdecode(packet_data);
			}
			for (let index in this.raw_packets) {
				packet[index] = this.raw_packets[index];
			}
			this.raw_packets = {};
		}
		catch (e) {
			//FIXME: maybe we should error out and disconnect here?
			this.error("error decoding packet", e);
			this.error("packet="+packet);
			this.raw_packets = [];
			return this.rQ.length>0;
		}
		try {
			// pass to our packet handler
			if(packet[0] === 'draw'){
				const img_data = packet[7];
				if (typeof img_data === 'string') {
					//rencode does not distinguish bytes and strings
					//we converted to string in the network layer,
					//and now we're converting back to bytes...
					//(use 'rencodeplus' to avoid all this unnecessary churn)
					const u8a = new Uint8Array(img_data.length);
					for(let i=0,j=img_data.length;i<j;++i){
						u8a[i] = img_data.charCodeAt(i);
					}
					packet[7] = u8a;
				}
			}
			else if(packet[0] === 'sound-data'){
				const sound_data = packet[2];
				if (typeof sound_data === 'string') {
					//same workaround as 'draw' above
					const u8a = new Uint8Array(sound_data.length);
					for(let i=0,j=sound_data.length;i<j;++i){
						u8a[i] = sound_data.charCodeAt(i);
					}
					packet[2] = u8a;
				}
			}
			if (this.is_worker){
				this.mQ[this.mQ.length] = packet;
				const me = this;
				setTimeout(function() {
						me.process_message_queue();
					}, this.process_interval);
			} else {
				this.packet_handler(packet, this.packet_ctx);
			}
		}
		catch (e) {
			//FIXME: maybe we should error out and disconnect here?
			this.error("error processing packet " + packet[0]+": " + e);
			//this.error("packet_data="+packet_data);
		}
	}
	return this.rQ.length>0;
};

XpraProtocol.prototype.enable_packet_encoder = function(packet_encoder) {
	this.packet_encoder = packet_encoder;
}

XpraProtocol.prototype.process_send_queue = function() {
	while(this.sQ.length !== 0 && this.websocket) {
		const packet = this.sQ.shift();
		if(!packet){
			return;
		}
		let proto_flags = 0;
		let bdata = null;
		try {
			if (this.packet_encoder=="bencode") {
				bdata = bencode(packet)
				proto_flags = 0x0;
			}
			else if (this.packet_encoder=="rencode") {
				bdata = rencodelegacy(packet)
				proto_flags = 0x1;
			}
			else if (this.packet_encoder=="rencodeplus") {
				bdata = rencodeplus(packet)
				proto_flags = 0x10;
			}
			else {
				throw "invalid packet encoder: "+this.packet_encoder;
			}
		} catch(e) {
			this.error("Error: failed to encode packet:", packet);
			this.error(" with packet encoder", this.packet_encoder);
			this.error(e);
			continue;
		}
		const payload_size = bdata.length;
		// encryption
		if(this.cipher_out) {
			proto_flags |= 0x2;
			const padding_size = this.cipher_out_block_size - (payload_size % this.cipher_out_block_size);
			let input_data = null;
			if ((typeof bdata) === 'string') {
				input_data = bdata;
			}
			else {
				const CHUNK_SZ = 0x8000;
				const c = [];
				for (let i=0; i < bdata.length; i+=CHUNK_SZ) {
					c.push(String.fromCharCode.apply(null, bdata.subarray(i, i+CHUNK_SZ)));
				}
				input_data = c.join("");
			}
			if (padding_size) {
				const padding_char = String.fromCharCode(padding_size);
				for (let i = 0; i<padding_size; i++) {
					input_data += padding_char;
				}
			}
			this.cipher_out.update(forge.util.createBuffer(input_data), 'utf8');
			bdata = this.cipher_out.output.getBytes();
		}
		const actual_size = bdata.length;

		let packet_data = new Uint8Array(actual_size + 8);
		const level = 0;
		//header:
		packet_data[0] = "P".charCodeAt(0);
		packet_data[1] = proto_flags;
		packet_data[2] = level;
		packet_data[3] = 0;
		//size header:
		for (let i=0; i<4; i++) {
			packet_data[7-i] = (payload_size >> (8*i)) & 0xFF;
		}
		if ((typeof bdata) === 'object' && bdata.constructor===Uint8Array) {
			packet_data.set(bdata, 8);
		}
		else {
			//copy string one character at a time..
			for (let i=0; i<actual_size; i++) {
				packet_data[8+i] = ord(bdata[i]);
			}
		}
		// put into buffer before send
		if (this.websocket) {
			this.websocket.send((new Uint8Array(packet_data)).buffer);
		}
	}
};

XpraProtocol.prototype.process_message_queue = function() {
	while(this.mQ.length !== 0){
		const packet = this.mQ.shift();

		if(!packet){
			return;
		}

		let raw_buffers = [];
		if ((packet[0] === 'draw') && ("buffer" in packet[7])) {
			raw_buffers.push(packet[7].buffer);
		}
		else if ((packet[0] === "sound-data") && ("buffer" in packet[2])) {
			raw_buffers.push(packet[2].buffer);
		}
		postMessage({'c': 'p', 'p': packet}, raw_buffers);
	}
};

XpraProtocol.prototype.send = function(packet) {
	this.sQ[this.sQ.length] = packet;
	const me = this;
	setTimeout(function() {
		me.process_send_queue();
		}, this.process_interval);
};

XpraProtocol.prototype.set_packet_handler = function(callback, ctx) {
	this.packet_handler = callback;
	this.packet_ctx = ctx;
};

XpraProtocol.prototype.set_cipher_in = function(caps, key) {
	const me = this;
	this.setup_cipher(caps, key, function(cipher, block_size, secret, iv) {
		me.cipher_in_block_size = block_size;
		me.cipher_in = forge.cipher.createDecipher(cipher, secret);
		//me.cipher_in.start({"iv": iv, "tagLength" : 0, "tag" : ""});
		me.cipher_in.start({"iv": iv});
	});
};

XpraProtocol.prototype.set_cipher_out = function(caps, key) {
	const me = this;
	this.setup_cipher(caps, key, function(cipher, block_size, secret, iv) {
		me.cipher_out_block_size = block_size;
		me.cipher_out = forge.cipher.createCipher(cipher, secret);
		me.cipher_out.start({"iv": iv});
	});
};

XpraProtocol.prototype.setup_cipher = function(caps, key, setup_fn) {
	if (!key) {
		throw "missing encryption key";
	}
	const cipher = caps["cipher"] || "AES";
	if (cipher!="AES") {
		throw "unsupported encryption specified: '"+cipher+"'";
	}
	const key_salt = caps["cipher.key_salt"];
	const iterations = caps["cipher.key_stretch_iterations"];
	if (iterations<0) {
		throw "invalid number of iterations: "+iterations;
	}
	const DEFAULT_KEYSIZE = 32;
	const key_size = caps["cipher.key_size"] || DEFAULT_KEYSIZE;
	if ([32, 24, 16].indexOf(key_size)<0) {
		throw "invalid key size '"+key_size+"'";
	}
	const key_stretch = caps["cipher.key_stretch"] || "PBKDF2";
	if (key_stretch.toUpperCase()!="PBKDF2") {
		throw "invalid key stretching function "+key_stretch;
	}
	const DEFAULT_KEY_HASH = "SHA1";
	const key_hash = (caps["cipher.key_hash"] || DEFAULT_KEY_HASH).toLowerCase();
	const secret = forge.pkcs5.pbkdf2(key, key_salt, iterations, key_size, key_hash);
	const DEFAULT_MODE = "CBC";
	const mode = caps["cipher.mode"] || DEFAULT_MODE;
	let block_size = 0;
	if (mode=="CBC") {
		block_size = 32;
	}
	else if (["CFB", "CTR"].indexOf(mode)<0){
		throw "unsupported AES mode '"+mode+"'";
	}
	// start the cipher
	const iv = caps["cipher.iv"];
	if (!iv) {
		throw "missing IV";
	}
	//ie: setup_fn("AES-CBC", "THESTRETCHEDKEYVALUE", "THEIVVALUE");
	setup_fn(cipher+"-"+mode, block_size, secret, iv);
};



/*
If we are in a web worker, set up an instance of the protocol
*/
if (!(typeof window == "object" && typeof document == "object" && window.document === document)) {
	// some required imports
	// worker imports are relative to worker script path
	importScripts(
		'lib/bencode.js',
		'lib/zlib.js',
		'lib/lz4.js',
		'lib/es6-shim.js',
		'lib/brotli_decode.js',
		'lib/forge.js',
		'lib/rencode.js');
	// make protocol instance
	const protocol = new XpraProtocol();
	protocol.is_worker = true;
	// we create a custom packet handler which posts packet as a message
	protocol.set_packet_handler(function (packet, ctx) {
		let raw_draw_buffer = [];
		if ((packet[0] === 'draw') && (packet[7].hasOwnProperty("buffer"))) {
			raw_draw_buffer = packet[7].buffer;
			packet[7] = null;
		}
		postMessage({'c': 'p', 'p': packet}, raw_draw_buffer);
	}, null);
	// attach listeners from main thread
	self.addEventListener('message', function(e) {
		const data = e.data;
		switch (data.c) {
		case 'o':
			protocol.open(data.u);
			break;
		case 's':
			protocol.send(data.p);
			break;
		case 'p':
			protocol.enable_packet_encoder(data.pe);
			break;
		case 'x':
			protocol.set_cipher_out(data.p, data.k);
			break;
		case 'z':
			protocol.set_cipher_in(data.p, data.k);
			break;
		case 'c':
			// close the connection
			protocol.close();
			break;
		case 't':
			// terminate the worker
			self.close();
			break;
		default:
			postMessage({'c': 'l', 't': 'got unknown command from host'});
		}
	}, false);
	// tell host we are ready
	postMessage({'c': 'r'});
}

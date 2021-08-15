/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

//importScripts("./Decode.js");
importScripts("./lib/zlib.js");
importScripts("./lib/lz4.js");
importScripts("./lib/broadway/Decoder.js");

// initialise LZ4 library
var Buffer = require('buffer').Buffer;
var LZ4 = require('lz4');

//deals with zlib or lz4 pixel compression
//as well as converting rgb24 to rb32 and
//re-striding the pixel data if needed
//this function modifies the packet data directly
function decode_rgb(packet) {
	const width = packet[4],
		height = packet[5],
		coding = packet[6],
		rowstride = packet[9];
	let data = packet[7];
	let options = {};
	if (packet.length>10)
		options = packet[10];
	if (options!=null && options["zlib"]>0) {
		//show("decompressing "+data.length+" bytes of "+coding+"/zlib");
		data = new Zlib.Inflate(data).decompress();
		delete options["zlib"];
	}
	else if (options!=null && options["lz4"]>0) {
		// in future we need to make sure that we use typed arrays everywhere...
		let d;
		if (data.subarray) {
			d = data.subarray(0, 4);
		} else {
			d = data.slice(0, 4);
		}
		// will always be little endian
		const length = d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24);
		// decode the LZ4 block
		const inflated = new Buffer(length);
		let uncompressedSize;
		if (data.subarray) {
			uncompressedSize = LZ4.decodeBlock(data.subarray(4), inflated);
		}
		else {
			uncompressedSize = LZ4.decodeBlock(data.slice(4), inflated);
		}
		data = inflated.slice(0, uncompressedSize);
		if (uncompressedSize==length) {
			data = inflated;
		}
		else {
			//this should not happen?
			data = inflated.slice(0, uncompressedSize);
		}
		delete options["lz4"];
	}
	let target_stride = width*4;
	//this.debug("draw", "got ", data.length, "bytes of", coding, "to paint with stride", rowstride, ", target stride", target_stride);
	if (coding=="rgb24") {
		const uint = new Uint8Array(target_stride*height);
		let i = 0,
			j = 0,
			l = data.length;
		if (rowstride==width*3) {
			//faster path, single loop:
			while (i<l) {
				uint[j++] = data[i++];
				uint[j++] = data[i++];
				uint[j++] = data[i++];
				uint[j++] = 255;
			}
		}
		else {
			let psrc = 0,
				pdst = 0;
			for (i=0; i<height; i++) {
				psrc = i*rowstride;
				for (j=0; j<width; j++) {
					uint[pdst++] = data[psrc++];
					uint[pdst++] = data[psrc++];
					uint[pdst++] = data[psrc++];
					uint[pdst++] = 255;
				}
			}
		}
		packet[9] = target_stride;
		packet[6] = "rgb32";
		data = uint;
	}
	else {
		//coding=rgb32
		if (target_stride!=rowstride) {
			//re-striding
			//might be quicker to copy 32bit at a time using Uint32Array
			//and then casting the result?
			const uint = new Uint8Array(target_stride*height);
			let i = 0,
				j = 0;
			let psrc = 0,
				pdst = 0;
			for (i=0; i<height; i++) {
				psrc = i*rowstride;
				pdst = i*target_stride;
				for (j=0; j<width*4; j++) {
					uint[pdst++] = data[psrc++];
				}
			}
			data = uint;
		}
	}
	packet[7] = data;
	//could we send a prepared BitMap back?
	//const img = new ImageData(data, width, height);
	//const bitmap = createImageBitmap(img);
	//packet[6] = "bitmap:"+coding;
	//packet[7] = bitmap;
	//console.log("converted", orig_data, "to", data);
}

const broadway_decoders = {};
function close_broadway(wid) {
	try {
		delete broadway_decoders[wid];
	}
	catch (e) {
		//not much we can do
	}
}

onmessage = function(e) {
	var data = e.data;
	switch (data.cmd) {
	case 'check':
		self.postMessage({'result': true});
		break;
	case 'eos':
		const wid = data.wid;
		close_broadway(wid);
		//console.log("decode worker eos for wid", wid);
		break;
	case 'decode':
		const packet = data.packet;
		//console.log("packet to decode:", data.packet);
		function send_back(p, raw_buffers) {
			self.postMessage({'draw': p}, raw_buffers);
		}
		function decode_error(msg) {
			self.postMessage({'error': msg, 'packet' : packet});
		}
		try {
			const coding = packet[6];
			if (coding=="rgb24" || coding=="rgb32") {
				decode_rgb(packet)
				send_back(packet, [packet[7].buffer]);
			}
			else if (coding=="png" || coding=="jpeg" || coding=="webp") {
				const data = packet[7];
				const blob = new Blob([data.buffer]);
				createImageBitmap(blob).then(function(bitmap) {
					packet[6] = "bitmap:"+coding;
					packet[7] = bitmap;
					send_back(packet, [bitmap]);
				}, decode_error);
			}
			else if (coding=="h264") {
				const wid = packet[1];
				let options = {};
				if (packet.length>10)
					options = packet[10];
				let enc_width = packet[4];
				let enc_height = packet[5];
				const data = packet[7];
				const scaled_size = options["scaled_size"];
				if (scaled_size) {
					enc_width = scaled_size[0];
					enc_height = scaled_size[1];
				}
				const frame = options["frame"] || 0;
				if (frame==0) {
					close_broadway();
				}
				let decoder = broadway_decoders[wid];
				if (decoder && (decoder._enc_size[0]!=enc_width || decoder._enc_size[1]!=enc_height)) {
					close_broadway();
					decoder = null;
				}
				//console.log("decoder=", decoder);
				if (!decoder) {
					decoder = new Decoder({
						"rgb": 	true,
						"size": { "width" : enc_width, "height" : enc_height },
					});
					decoder._enc_size = [enc_width, enc_height];
					broadway_decoders[wid] = decoder;
				}
				let count = 0;
				decoder.onPictureDecoded = function(buffer, p_width, p_height, infos) {
					//console.log("broadway frame: enc size=", enc_width, enc_height, ", decode size=", p_width, p_height);
					count++;
					//forward it as rgb32:
					packet[6] = "rgb32";
					packet[7] = buffer;
					options["scaled_size"] = [p_width, p_height];
					send_back(packet, [packet[7].buffer]);
				};
				// we can pass a buffer full of NALs to decode() directly
				// as long as they are framed properly with the NAL header
				if (!Array.isArray(data)) {
					img_data = Array.from(data);
				}
				decoder.decode(data);
				// broadway decoding is actually synchronous
				// and onPictureDecoded is called from decode(data) above.
				if (count==0) {
					decode_error("no "+coding+" picture decoded");
				}
			}
			else {
				//pass-through:
				send_back(packet, []);
			}
		}
		catch (e) {
			decode_error(e);
		}
		break
	default:
		console.error("decode worker got unknown message: "+data.cmd);
	};
}

/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

importScripts("./lib/zlib.js");
importScripts("./lib/lz4.js");
importScripts("./lib/broadway/Decoder.js");

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
		data = new Zlib.Inflate(data).decompress();
		delete options["zlib"];
	}
	else if (options!=null && options["lz4"]>0) {
		data = lz4.decode(data);
		delete options["lz4"];
	}
	let target_stride = width*4;
	//this.debug("draw", "got ", data.length, "bytes of", coding, "to paint with stride", rowstride, ", target stride", target_stride);
	if (coding=="rgb24") {
		packet[9] = target_stride;
		packet[6] = "rgb32";
		return rgb24_to_rgb32(data, width, height, rowstride, target_stride);
	}
	//coding=rgb32
	if (target_stride==rowstride) {
		return data;
	}
	//re-striding
	//might be quicker to copy 32bit at a time using Uint32Array
	//and then casting the result?
	const uint = new Uint8Array(target_stride*height);
	let i = 0,
		j = 0,
		psrc = 0,
		pdst = 0;
	for (i=0; i<height; i++) {
		psrc = i*rowstride;
		pdst = i*target_stride;
		for (j=0; j<target_stride; j++) {
			uint[pdst++] = data[psrc++];
		}
	}
	return uint;
}

function rgb24_to_rgb32(data, width, height, rowstride, target_stride) {
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
	return uint;
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

const on_hold = new Map();

function decode_eos(wid) {
	close_broadway(wid);
	if (wid in on_hold) {
		on_hold.remove(wid);
	}
}

function decode_draw_packet(packet) {
	const wid = packet[1],
		width = packet[4],
		height = packet[5],
		coding = packet[6],
		packet_sequence = packet[8];
	//console.log("packet to decode:", data.packet);
	function send_back(raw_buffers) {
		//console.log("send_back: wid_hold=", wid_hold);
		const wid_hold = on_hold.get(wid);
		if (wid_hold) {
			//find the highest sequence number which is still lower than this packet
			let seq_holding = 0;
			for (let seq of wid_hold.keys()) {
				if (seq>seq_holding && seq<packet_sequence) {
					seq_holding = seq;
				}
			}
			if (seq_holding) {
				const held = wid_hold.get(seq_holding);
				if (held) {
					held.push([packet, raw_buffers]);
					return;
				}
			}
		}
		self.postMessage({'draw': packet}, raw_buffers);
	}
	function do_send_back(p, raw_buffers) {
		self.postMessage({'draw': p}, raw_buffers);
	}
	function decode_error(msg) {
		self.postMessage({'error': ""+msg, 'packet' : packet});
	}

	function hold() {
		//we're loading asynchronously
		//so ensure that any packet sequence arriving after this one will be put on hold
		//until we have finished decoding this one:
		let wid_hold = on_hold.get(wid);
		if (!wid_hold) {
			wid_hold = new Map();
			on_hold.set(wid, wid_hold);
		}
		//console.log("holding=", packet_sequence);
		wid_hold.set(packet_sequence, []);
		return wid_hold;
	}

	function release() {
		let wid_hold = on_hold.get(wid);
		if (!wid_hold) {
			//could have been cancelled by EOS
			return;
		}
		//release any packets held back by this image:
		const held = wid_hold.get(packet_sequence);
		//console.log("release held=", held);
		if (!held) {
			//could have been cancelled by EOS
			return;
		}
		let i;
		for (i=0; i<held.length; i++) {
			const held_packet = held[i][0];
			const held_raw_buffers = held[i][1];
			do_send_back(held_packet, held_raw_buffers);
		}
		wid_hold.delete(packet_sequence);
		//console.log("wid_hold=", wid_hold, "on_hold=", on_hold);
		if (wid_hold.size==0 && on_hold.has(wid)) {
			//this was the last held sequence for this window
			on_hold.delete(wid);
		}
	}

	function send_rgb32_back(data, actual_width, actual_height, options) {
		const img = new ImageData(new Uint8ClampedArray(data.buffer), actual_width, actual_height);
		hold();
		createImageBitmap(img, 0, 0, actual_width, actual_height, options).then(function(bitmap) {
			packet[6] = "bitmap:rgb32";
			packet[7] = bitmap;
			send_back([bitmap]);
			release();
		}, function(e) {
			decode_error("failed to create "+actual_width+"x"+actual_height+" rgb32 bitmap from buffer "+data);
			release();
		});
	}

	try {
		if (coding=="rgb24" || coding=="rgb32") {
			const data = decode_rgb(packet);
			send_rgb32_back(data, width, height, {
				"premultiplyAlpha" : "none",
				});
		}
		else if (coding=="png" || coding=="jpeg" || coding=="webp") {
			const data = packet[7];
			if (!data.buffer) {
				decode_error("missing pixel data buffer: "+(typeof data));
				return;
			}
			const blob = new Blob([data.buffer]);
			hold();
			createImageBitmap(blob, {
				"premultiplyAlpha" : "none",
			}).then(function(bitmap) {
				packet[6] = "bitmap:"+coding;
				packet[7] = bitmap;
				send_back([bitmap]);
				release();
			}, function(e) {
				decode_error("failed to create image bitmap from "+coding+" "+blob+", data="+data+": "+e);
				release();
			});
		}
		else if (coding=="h264") {
			let options = {};
			if (packet.length>10)
				options = packet[10];
			const data = packet[7];
			let enc_width = width;
			let enc_height = height;
			const scaled_size = options["scaled_size"];
			if (scaled_size) {
				enc_width = scaled_size[0];
				enc_height = scaled_size[1];
				delete options["scaled-size"];
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
				send_rgb32_back(buffer, p_width, p_height, {
					"premultiplyAlpha" 	: "none",
					"resizeWidth" 		: width,
					"resizeHeight"		: height,
					"resizeQuality"		: "medium",
					});
			};
			// we can pass a buffer full of NALs to decode() directly
			// as long as they are framed properly with the NAL header
			decoder.decode(data);
			// broadway decoding is actually synchronous
			// and onPictureDecoded is called from decode(data) above.
			if (count==0) {
				decode_error("no "+coding+" picture decoded");
			}
		}
		else {
			//pass-through:
			send_back([]);
		}
	}
	catch (e) {
		decode_error("error processing "+coding+" packet "+packet_sequence+": "+e);
	}
}

onmessage = function(e) {
	const data = e.data;
	switch (data.cmd) {
	case 'check':
		//check for buggy Firefox:
		try {
			const png_data = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4, 133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
			const blob = new Blob([png_data], {type: "image/png"});
			createImageBitmap(blob, {
				"premultiplyAlpha" : "none",
			}).then(function() {
				self.postMessage({'result': true});
			}, function(e) {
				self.postMessage({'result': false, 'message' : ""+e});
			});
		}
		catch (e) {
			self.postMessage({'result': false, 'message' : ""+e});
		}
		break;
	case 'eos':
		decode_eos(data.wid);
		break;
	case 'decode':
		decode_draw_packet(data.packet);
		break
	default:
		console.error("decode worker got unknown message: "+data.cmd);
	}
}

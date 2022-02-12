/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

importScripts("./lib/zlib.js");
importScripts("./lib/lz4.js");
importScripts("./lib/broadway/Decoder.js");
importScripts("./RgbHelpers.js");


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
}

function decode_draw_packet(packet, start) {
	const wid = packet[1],
		width = packet[4],
		height = packet[5],
		coding = packet[6],
		packet_sequence = packet[8];
	//console.log("decode worker sequence "+packet_sequence+": start="+start);
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
		do_send_back(packet, raw_buffers);
	}
	function do_send_back(p, raw_buffers) {
		self.postMessage({'draw': p, 'start' : start}, raw_buffers);
	}
	function decode_error(msg) {
		self.postMessage({'error': ""+msg, 'packet' : packet, 'start' : start});
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

	let options = {};
	if (packet.length>10)
		options = packet[10];
	let enc_width = width;
	let enc_height = height;
	const bitmap_options = {
		"premultiplyAlpha" 	: "none",
		}
	const scaled_size = options["scaled_size"];
	if (scaled_size) {
		enc_width = scaled_size[0];
		enc_height = scaled_size[1];
		delete options["scaled-size"];
		bitmap_options["resizeWidth"] = width;
		bitmap_options["resizeHeight"] = height;
		bitmap_options["resizeQuality"] = "medium";
	}
	try {
		if (coding=="rgb24" || coding=="rgb32") {
			const data = decode_rgb(packet);
			send_rgb32_back(data, width, height, bitmap_options);
		}
		else if (coding.startsWith("png") || coding=="jpeg" || coding=="webp" || coding=="avif") {
			const data = packet[7];
			if (!data.buffer) {
				decode_error("missing pixel data buffer: "+(typeof data));
				release();
				return;
			}
			const blob = new Blob([data.buffer], {type: "image/"+coding});
			hold();
			createImageBitmap(blob, bitmap_options).then(function(bitmap) {
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
			const data = packet[7];
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
				send_rgb32_back(buffer, p_width, p_height, bitmap_options);
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

function check_image_decode(format, image_bytes, success_cb, fail_cb) {
	if (console) {
		console.info("checking ", format, " with test image: "+image_bytes.length+" bytes");
	}
	try {
		const timer = setTimeout(function() {
			fail_cb(format, "timeout, no "+format+" picture decoded");
		}, 2000);
		if (format=="h264") {
			const decoder = new Decoder({
					"rgb": 	true,
					"size": { "width" : 64, "height" : 64 },
				});
			decoder.onPictureDecoded = function(buffer, p_width, p_height, infos) {
				clearTimeout(timer);
				success_cb(format);
			};
			decoder.decode(image_bytes);
			return;
		}
		const data = new Uint8Array(image_bytes);
		const blob = new Blob([data], {type: "image/"+format});
		createImageBitmap(blob, {
			"premultiplyAlpha" : "none",
		}).then(function() {
			clearTimeout(timer);
			success_cb(format);
		}, function(e) {
			clearTimeout(timer);
			fail_cb(format, ""+e);
		});
	}
	catch (e) {
		fail_cb(format, ""+e);
	}
}

onmessage = function(e) {
	const data = e.data;
	switch (data.cmd) {
	case 'check':
		const encodings = data.encodings;
		if (console) {
			console.info("decode worker checking: ", encodings);
		}
		const CHECKS = {
			"png" 	: [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4, 133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130],
			"webp"	: [82, 73, 70, 70, 58, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 46, 0, 0, 0, 178, 2, 0, 157, 1, 42, 2, 0, 2, 0, 46, 105, 52, 154, 77, 34, 34, 34, 34, 34, 0, 104, 75, 40, 0, 5, 206, 150, 90, 0, 0, 254, 247, 159, 127, 253, 15, 63, 198, 192, 255, 242, 240, 96, 0, 0],
			"jpeg"	: [255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 96, 0, 96, 0, 0, 255, 219, 0, 67, 0, 8, 6, 6, 7, 6, 5, 8, 7, 7, 7, 9, 9, 8, 10, 12, 20, 13, 12, 11, 11, 12, 25, 18, 19, 15, 20, 29, 26, 31, 30, 29, 26, 28, 28, 32, 36, 46, 39, 32, 34, 44, 35, 28, 28, 40, 55, 41, 44, 48, 49, 52, 52, 52, 31, 39, 57, 61, 56, 50, 60, 46, 51, 52, 50, 255, 219, 0, 67, 1, 9, 9, 9, 12, 11, 12, 24, 13, 13, 24, 50, 33, 28, 33, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 196, 0, 31, 0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 196, 0, 181, 16, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125, 1, 2, 3, 0, 4, 17, 5, 18, 33, 49, 65, 6, 19, 81, 97, 7, 34, 113, 20, 50, 129, 145, 161, 8, 35, 66, 177, 193, 21, 82, 209, 240, 36, 51, 98, 114, 130, 9, 10, 22, 23, 24, 25, 26, 37, 38, 39, 40, 41, 42, 52, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 255, 196, 0, 31, 1, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 196, 0, 181, 17, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119, 0, 1, 2, 3, 17, 4, 5, 33, 49, 6, 18, 65, 81, 7, 97, 113, 19, 34, 50, 129, 8, 20, 66, 145, 161, 177, 193, 9, 35, 51, 82, 240, 21, 98, 114, 209, 10, 22, 36, 52, 225, 37, 241, 23, 24, 25, 26, 38, 39, 40, 41, 42, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 130, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 226, 227, 228, 229, 230, 231, 232, 233, 234, 242, 243, 244, 245, 246, 247, 248, 249, 250, 255, 218, 0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 247, 250, 40, 162, 128, 63, 255, 217],
			"h264"	: [0, 0, 0, 1, 103, 66, 192, 10, 218, 16, 154, 16, 0, 0, 3, 0, 16, 0, 0, 3, 3, 40, 241, 34, 106, 0, 0, 0, 1, 104, 206, 1, 119, 32, 0, 0, 1, 6, 5, 255, 255, 78, 220, 69, 233, 189, 230, 217, 72, 183, 150, 44, 216, 32, 217, 35, 238, 239, 120, 50, 54, 52, 32, 45, 32, 99, 111, 114, 101, 32, 49, 54, 49, 32, 45, 32, 72, 46, 50, 54, 52, 47, 77, 80, 69, 71, 45, 52, 32, 65, 86, 67, 32, 99, 111, 100, 101, 99, 32, 45, 32, 67, 111, 112, 121, 108, 101, 102, 116, 32, 50, 48, 48, 51, 45, 50, 48, 50, 49, 32, 45, 32, 104, 116, 116, 112, 58, 47, 47, 119, 119, 119, 46, 118, 105, 100, 101, 111, 108, 97, 110, 46, 111, 114, 103, 47, 120, 50, 54, 52, 46, 104, 116, 109, 108, 32, 45, 32, 111, 112, 116, 105, 111, 110, 115, 58, 32, 99, 97, 98, 97, 99, 61, 48, 32, 114, 101, 102, 61, 49, 32, 100, 101, 98, 108, 111, 99, 107, 61, 48, 58, 48, 58, 48, 32, 97, 110, 97, 108, 121, 115, 101, 61, 48, 58, 48, 32, 109, 101, 61, 100, 105, 97, 32, 115, 117, 98, 109, 101, 61, 48, 32, 112, 115, 121, 61, 49, 32, 112, 115, 121, 95, 114, 100, 61, 49, 46, 48, 48, 58, 48, 46, 48, 48, 32, 109, 105, 120, 101, 100, 95, 114, 101, 102, 61, 48, 32, 109, 101, 95, 114, 97, 110, 103, 101, 61, 49, 54, 32, 99, 104, 114, 111, 109, 97, 95, 109, 101, 61, 49, 32, 116, 114, 101, 108, 108, 105, 115, 61, 48, 32, 56, 120, 56, 100, 99, 116, 61, 48, 32, 99, 113, 109, 61, 48, 32, 100, 101, 97, 100, 122, 111, 110, 101, 61, 50, 49, 44, 49, 49, 32, 102, 97, 115, 116, 95, 112, 115, 107, 105, 112, 61, 49, 32, 99, 104, 114, 111, 109, 97, 95, 113, 112, 95, 111, 102, 102, 115, 101, 116, 61, 48, 32, 116, 104, 114, 101, 97, 100, 115, 61, 49, 32, 108, 111, 111, 107, 97, 104, 101, 97, 100, 95, 116, 104, 114, 101, 97, 100, 115, 61, 49, 32, 115, 108, 105, 99, 101, 100, 95, 116, 104, 114, 101, 97, 100, 115, 61, 48, 32, 110, 114, 61, 48, 32, 100, 101, 99, 105, 109, 97, 116, 101, 61, 49, 32, 105, 110, 116, 101, 114, 108, 97, 99, 101, 100, 61, 48, 32, 98, 108, 117, 114, 97, 121, 95, 99, 111, 109, 112, 97, 116, 61, 48, 32, 99, 111, 110, 115, 116, 114, 97, 105, 110, 101, 100, 95, 105, 110, 116, 114, 97, 61, 48, 32, 98, 102, 114, 97, 109, 101, 115, 61, 48, 32, 119, 101, 105, 103, 104, 116, 112, 61, 48, 32, 107, 101, 121, 105, 110, 116, 61, 105, 110, 102, 105, 110, 105, 116, 101, 32, 107, 101, 121, 105, 110, 116, 95, 109, 105, 110, 61, 53, 51, 54, 56, 55, 48, 57, 49, 51, 32, 115, 99, 101, 110, 101, 99, 117, 116, 61, 48, 32, 105, 110, 116, 114, 97, 95, 114, 101, 102, 114, 101, 115, 104, 61, 48, 32, 114, 99, 61, 99, 114, 102, 32, 109, 98, 116, 114, 101, 101, 61, 48, 32, 99, 114, 102, 61, 52, 57, 46, 53, 32, 113, 99, 111, 109, 112, 61, 48, 46, 54, 48, 32, 113, 112, 109, 105, 110, 61, 48, 32, 113, 112, 109, 97, 120, 61, 54, 57, 32, 113, 112, 115, 116, 101, 112, 61, 52, 32, 105, 112, 95, 114, 97, 116, 105, 111, 61, 49, 46, 52, 48, 32, 97, 113, 61, 48, 0, 128, 0, 0, 1, 101, 136, 132, 42, 38, 40, 0, 23, 147, 147, 147, 174, 186, 235, 174, 186, 235, 174, 186, 235, 192],
			};
		const errors = [];
		const formats = [];
		function done(format) {
			delete CHECKS[format];
			if (Object.keys(CHECKS).length==0) {
				if (errors.length==0) {
					self.postMessage({'result': true, 'formats' : formats});
				}
				else {
					self.postMessage({'result': false, 'errors' : errors});
				}
			}
		}
		function success(format) {
			//only enable this format if the client requested it:
			if (encodings.includes(format)) {
				formats.push(format);
			}
			done(format);
		}
		function failure(format, message) {
			//only record an error if the client actually asked us to verify this format
			if (encodings.indexOf(format)>=0) {
				errors.push(message);
				if (console.warn) {
					console.warn("Warning: decode worker error on '"+format+"': "+message);
				}
			}
			else {
				console.info("decode worker failure on '"+format+"': "+message);
			}
			done(format);
		}
		for (var format in CHECKS) {
		    var image_bytes = CHECKS[format];
			check_image_decode(format, image_bytes, success, failure);
		}
		break;
	case 'eos':
		decode_eos(data.wid);
		break;
	case 'remove':
		decode_eos(data.wid);
		on_hold.delete(data.wid);
		break;
	case 'decode':
		decode_draw_packet(data.packet, data.start);
		break
	default:
		console.error("decode worker got unknown message: "+data.cmd);
	}
}

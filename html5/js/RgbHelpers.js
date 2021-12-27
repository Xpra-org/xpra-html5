/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

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
		return new Uint8Array(data);
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

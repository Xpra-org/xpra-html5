/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

//deals with zlib or lz4 pixel compression
//as well as converting rgb24 to rb32 and
//re-striding the pixel data if needed so that lines are not padded
//(that is: the rowstride must be width*4)
//this function modifies the packet data directly
function decode_rgb(packet) {
  const width = packet[4];
  const height = packet[5];
  const coding = packet[6];
  const rowstride = packet[9];
  let data = packet[7];
  const options = packet[10] || {};
  if (options["zlib"] > 0) {
    throw "zlib compression is not supported";
  }
  if (options["lz4"] > 0) {
    data = lz4.decode(data);
    delete options["lz4"];
  }
  let rgb_format = options["rgb_format"] || "";
  if (typeof rgb_format !== "string") {
    rgb_format = String.fromCharCode(...rgb_format);
  }
  if (coding === "rgb24") {
    packet[9] = width * 4;
    packet[6] = "rgb32";
    const rgb32 = rgb24_to_rgb32(data, width, height, rowstride);
    if (rgb_format === "BGR") {
      swap_red_blue(rgb32);
    }
    return rgb32;
  }
  //coding=rgb32
  const uint = restride_rgb32(data, width, height, rowstride);
  //the server tells us the actual pixel layout,
  //"X" is padding, not alpha, and may contain anything:
  if (rgb_format.startsWith("B")) {
    swap_red_blue(uint);
  }
  if (rgb_format.endsWith("X")) {
    for (let index = 3; index < uint.length; index += 4) {
      uint[index] = 255;
    }
  }
  return uint;
}

function swap_red_blue(uint) {
  for (let index = 0; index < uint.length; index += 4) {
    const red = uint[index];
    uint[index] = uint[index + 2];
    uint[index + 2] = red;
  }
}

function restride_rgb32(data, width, height, rowstride) {
  if (rowstride === width * 4) {
    return new Uint8Array(data);
  }
  //re-striding
  //might be quicker to copy 32bit at a time using Uint32Array
  //and then casting the result?
  const uint = new Uint8Array(width * height * 4);
  let psrc = 0;
  let pdst = 0;
  for (let row_index = 0; row_index < height; row_index++) {
    psrc = row_index * rowstride;
    pdst = row_index * width * 4;
    for (let column_index = 0; column_index < width * 4; column_index++) {
      uint[pdst++] = data[psrc++];
    }
  }
  return uint;
}

function rgb24_to_rgb32(data, width, height, rowstride) {
  const uint = new Uint8Array(width * height * 4);
  let source_index = 0;
  let target_index = 0;
  if (rowstride === width * 3) {
    //faster path, single loop:
    const source_length = data.length;
    while (source_index < source_length) {
      uint[target_index++] = data[source_index++];
      uint[target_index++] = data[source_index++];
      uint[target_index++] = data[source_index++];
      uint[target_index++] = 255;
    }
  } else {
    for (let row_index = 0; row_index < height; row_index++) {
      source_index = row_index * rowstride;
      for (let column_index = 0; column_index < width; column_index++) {
        uint[target_index++] = data[source_index++];
        uint[target_index++] = data[source_index++];
        uint[target_index++] = data[source_index++];
        uint[target_index++] = 255;
      }
    }
  }
  return uint;
}

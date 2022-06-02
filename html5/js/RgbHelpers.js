/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

//deals with zlib or lz4 pixel compression
//as well as converting rgb24 to rb32 and
//re-striding the pixel data if needed so that lines are not padded
//(that is: the rowstride must be width*4)
//this function modifies the packet data directly
function decode_rgb(packet) {
  const width = packet[4],
    height = packet[5],
    coding = packet[6],
    rowstride = packet[9];
  let data = packet[7];
  let options = packet[10] || {};
  if (options["zlib"] > 0) {
    data = new Zlib.Inflate(data).decompress();
    delete options["zlib"];
  } else if (options["lz4"] > 0) {
    data = lz4.decode(data);
    delete options["lz4"];
  }
  if (coding == "rgb24") {
    packet[9] = width * 4;
    packet[6] = "rgb32";
    return rgb24_to_rgb32(data, width, height, rowstride);
  }
  //coding=rgb32
  if (rowstride == width * 4) {
    return new Uint8Array(data);
  }
  //re-striding
  //might be quicker to copy 32bit at a time using Uint32Array
  //and then casting the result?
  const uint = new Uint8Array(width * height * 4);
  let index = 0,
    index_ = 0,
    psrc = 0,
    pdst = 0;
  for (index = 0; index < height; index++) {
    psrc = index * rowstride;
    pdst = index * width * 4;
    for (index_ = 0; index_ < width * 4; index_++) {
      uint[pdst++] = data[psrc++];
    }
  }
  return uint;
}

function rgb24_to_rgb32(data, width, height, rowstride) {
  const uint = new Uint8Array(width * height * 4);
  let index = 0,
    index_ = 0;
  if (rowstride == width * 3) {
    //faster path, single loop:
    const l = data.length;
    while (index < l) {
      uint[index_++] = data[index++];
      uint[index_++] = data[index++];
      uint[index_++] = data[index++];
      uint[index_++] = 255;
    }
  } else {
    let psrc = 0,
      pdst = 0;
    for (index = 0; index < height; index++) {
      psrc = index * rowstride;
      for (index_ = 0; index_ < width; index_++) {
        uint[pdst++] = data[psrc++];
        uint[pdst++] = data[psrc++];
        uint[pdst++] = data[psrc++];
        uint[pdst++] = 255;
      }
    }
  }
  return uint;
}

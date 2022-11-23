// lz4.js - An implementation of Lz4 in plain JavaScript.
//
// TODO:
// - Unify header parsing/writing.
// - Support options (block size, checksums)
// - Support streams
// - Better error handling (handle bad offset, etc.)
// - HC support (better search algorithm)
// - Tests/benchmarking


/********************************************************************************/

// Simple hash function, from: http://burtleburtle.net/bob/hash/integer.html.
// Chosen because it doesn't use multiply and achieves full avalanche.
const hashU32 = function hashU32(a: number) {
    a = a | 0;
    a = a + 2127912214 + (a << 12) | 0;
    a = a ^ -949894596 ^ a >>> 19;
    a = a + 374761393 + (a << 5) | 0;
    a = a + -744332180 ^ a << 9;
    a = a + -42973499 + (a << 3) | 0;
    return a ^ -1252372727 ^ a >>> 16 | 0;
}

// Reads a 64-bit little-endian integer from an array.
const readU64 = function readU64(b: number[], n: number) {
    var x = 0;
    x |= b[n++] << 0;
    x |= b[n++] << 8;
    x |= b[n++] << 16;
    x |= b[n++] << 24;
    x |= b[n++] << 32;
    x |= b[n++] << 40;
    x |= b[n++] << 48;
    x |= b[n++] << 56;
    return x;
}

// Reads a 32-bit little-endian integer from an array.
const readU32 = function readU32(b: number[], n: number) {
    var x = 0;
    x |= b[n++] << 0;
    x |= b[n++] << 8;
    x |= b[n++] << 16;
    x |= b[n++] << 24;
    return x;
}

// Writes a 32-bit little-endian integer from an array.
const writeU32 = function writeU32(b: number[], n: number, x: number) {
    b[n++] = (x >> 0) & 0xff;
    b[n++] = (x >> 8) & 0xff;
    b[n++] = (x >> 16) & 0xff;
    b[n++] = (x >> 24) & 0xff;
}

// Multiplies two numbers using 32-bit integer multiplication.
// Algorithm from Emscripten.
const imul = function imul(a: number, b: number) {
    const ah = a >>> 16;
    const al = a & 65535;
    const bh = b >>> 16;
    const bl = b & 65535;

    return al * bl + (ah * bl + al * bh << 16) | 0;
};


/********************************************************************************/
// xxh32.js - implementation of xxhash32 in plain JavaScript

// xxhash32 primes
const prime1 = 0x9e3779b1;
const prime2 = 0x85ebca77;
const prime3 = 0xc2b2ae3d;
const prime4 = 0x27d4eb2f;
const prime5 = 0x165667b1;

// Utility functions/primitives
// --

function rotl32 (x: number, r: number) {
  x = x | 0;
  r = r | 0;

  return x >>> (32 - r | 0) | x << r | 0;
}

function rotmul32 (h: number, r: number, m: number) {
  h = h | 0;
  r = r | 0;
  m = m | 0;

  return imul(h >>> (32 - r | 0) | h << r, m) | 0;
}

function shiftxor32 (h: number, s: number) {
  h = h | 0;
  s = s | 0;

  return h >>> s ^ h | 0;
}

// Implementation
// --

function xxhapply (h: number, src: number, m0: number, s: number, m1: number) {
  return rotmul32(imul(src, m0) + h, s, m1);
}

function xxh1 (h: number, src: number, index: number) {
  return rotmul32((h + imul(src[index], prime5)), 11, prime1);
}

function xxh4 (h: number, src: number[], index: number) {
  return xxhapply(h, readU32(src, index), prime3, 17, prime4);
}

function xxh16 (h: number, src: number[], index: number) {
  return [
    xxhapply(h[0], readU32(src, index + 0), prime2, 13, prime1),
    xxhapply(h[1], readU32(src, index + 4), prime2, 13, prime1),
    xxhapply(h[2], readU32(src, index + 8), prime2, 13, prime1),
    xxhapply(h[3], readU32(src, index + 12), prime2, 13, prime1)
  ];
}

function xxh32 (seed: number, src: any, index: number, len: number) {
  var h, l;
  l = len;
  if (len >= 16) {
    h = [
      seed + prime1 + prime2,
      seed + prime2,
      seed,
      seed - prime1
    ];

    while (len >= 16) {
      h = xxh16(h, src, index);

      index += 16;
      len -= 16;
    }

    h = rotl32(h[0], 1) + rotl32(h[1], 7) + rotl32(h[2], 12) + rotl32(h[3], 18) + l;
  } else {
    h = (seed + prime5 + len) >>> 0;
  }

  while (len >= 4) {
    h = xxh4(h, src, index);

    index += 4;
    len -= 4;
  }

  while (len > 0) {
    h = xxh1(h, src, index);

    index++;
    len--;
  }

  h = shiftxor32(imul(shiftxor32(imul(shiftxor32(h, 15), prime2), 13), prime3), 16);

  return h >>> 0;
}

/********************************************************************************/
// Constants
// --

// Compression format parameters/constants.
const minMatch = 4;
const minLength = 13;
const searchLimit = 5;
const skipTrigger = 6;
const hashSize = 1 << 16;

// Token constants.
const mlBits = 4;
const mlMask = (1 << mlBits) - 1;
const runBits = 4;
const runMask = (1 << runBits) - 1;

// Shared buffers
const blockBuf = makeBuffer(5 << 20);
const hashTable = makeHashTable();

// Frame constants.
const magicNum = 0x184D2204;

// Frame descriptor flags.
const fdContentChksum = 0x4;
const fdContentSize = 0x8;
const fdBlockChksum = 0x10;
// const fdBlockIndep = 0x20;
const fdVersion = 0x40;
const fdVersionMask = 0xC0;

// Block sizes.
const bsUncompressed = 0x80000000;
const bsDefault = 7;
const bsShift = 4;
const bsMask = 7;
const bsMap = {
  4: 0x10000,
  5: 0x40000,
  6: 0x100000,
  7: 0x400000
};

// Utility functions/primitives
// --

// Makes our hashtable. On older browsers, may return a plain array.
function makeHashTable () {
  try {
    return new Uint32Array(hashSize);
  } catch (error) {
    var hashTable = new Array(hashSize);

    for (var i = 0; i < hashSize; i++) {
      hashTable[i] = 0;
    }

    return hashTable;
  }
}

// Clear hashtable.
function clearHashTable (table) {
  for (var i = 0; i < hashSize; i++) {
    hashTable[i] = 0;
  }
}

// Makes a byte buffer. On older browsers, may return a plain array.
function makeBuffer (size) {
  try {
    return new Uint8Array(size);
  } catch (error) {
    var buf = new Array(size);

    for (var i = 0; i < size; i++) {
      buf[i] = 0;
    }

    return buf;
  }
}

function sliceArray (array, start, end) {
  // Assume normal array.
  return array.slice(start, end);
}

// Implementation
// --
export class lz4 {

  // Calculates an upper bound for lz4 compression.
  static compressBound (n) {
    return (n + (n / 255) + 16) | 0;
  };
  
  // Calculates an upper bound for lz4 decompression, by reading the data.
  static decompressBound (src) {
    var sIndex = 0;
  
    // Read magic number
    if (readU32(src, sIndex) !== magicNum) {
      throw new Error('invalid magic number');
    }
  
    sIndex += 4;
  
    // Read descriptor
    var descriptor = src[sIndex++];
  
    // Check version
    if ((descriptor & fdVersionMask) !== fdVersion) {
      throw new Error('incompatible descriptor version ' + (descriptor & fdVersionMask));
    }
  
    // Read flags
    var useBlockSum = (descriptor & fdBlockChksum) !== 0;
    var useContentSize = (descriptor & fdContentSize) !== 0;
  
    // Read block size
    var bsIdx = (src[sIndex++] >> bsShift) & bsMask;
  
    if (bsMap[bsIdx] === undefined) {
      throw new Error('invalid block size ' + bsIdx);
    }
  
    var maxBlockSize = bsMap[bsIdx];
  
    // Get content size
    if (useContentSize) {
      return readU64(src, sIndex);
    }
  
    // Checksum
    sIndex++;
  
    // Read blocks.
    var maxSize = 0;
    while (true) {
      var blockSize = readU32(src, sIndex);
      sIndex += 4;
  
      if (blockSize & bsUncompressed) {
        blockSize &= ~bsUncompressed;
        maxSize += blockSize;
      } else if (blockSize > 0) {
        maxSize += maxBlockSize;
      }
  
      if (blockSize === 0) {
        return maxSize;
      }
  
      if (useBlockSum) {
        sIndex += 4;
      }
  
      sIndex += blockSize;
    }
  };
  
  // Creates a buffer of a given byte-size, falling back to plain arrays.
  static makeBuffer = makeBuffer;
  
  // Decompresses a block of Lz4.
  static decompressBlock (src, dst, sIndex, sLength, dIndex) {
    var mLength, mOffset, sEnd, n, i;
    var hasCopyWithin = dst.copyWithin !== undefined && dst.fill !== undefined;
  
    // Setup initial state.
    sEnd = sIndex + sLength;
  
    // Consume entire input block.
    while (sIndex < sEnd) {
      var token = src[sIndex++];
  
      // Copy literals.
      var literalCount = (token >> 4);
      if (literalCount > 0) {
        // Parse length.
        if (literalCount === 0xf) {
          while (true) {
            literalCount += src[sIndex];
            if (src[sIndex++] !== 0xff) {
              break;
            }
          }
        }
  
        // Copy literals
        for (n = sIndex + literalCount; sIndex < n;) {
          dst[dIndex++] = src[sIndex++];
        }
      }
  
      if (sIndex >= sEnd) {
        break;
      }
  
      // Copy match.
      mLength = (token & 0xf);
  
      // Parse offset.
      mOffset = src[sIndex++] | (src[sIndex++] << 8);
  
      // Parse length.
      if (mLength === 0xf) {
        while (true) {
          mLength += src[sIndex];
          if (src[sIndex++] !== 0xff) {
            break;
          }
        }
      }
  
      mLength += minMatch;
  
      // Copy match
      // prefer to use typedarray.copyWithin for larger matches
      // NOTE: copyWithin doesn't work as required by LZ4 for overlapping sequences
      // e.g. mOffset=1, mLength=30 (repeach char 30 times)
      // we special case the repeat char w/ array.fill
      if (hasCopyWithin && mOffset === 1) {
        dst.fill(dst[dIndex - 1] | 0, dIndex, dIndex + mLength);
        dIndex += mLength;
      } else if (hasCopyWithin && mOffset > mLength && mLength > 31) {
        dst.copyWithin(dIndex, dIndex - mOffset, dIndex - mOffset + mLength);
        dIndex += mLength;
      } else {
        for (i = dIndex - mOffset, n = i + mLength; i < n;) {
          dst[dIndex++] = dst[i++] | 0;
        }
      }
    }
  
    return dIndex;
  };
  
  // Compresses a block with Lz4.
  static compressBlock (src, dst, sIndex, sLength, hashTable) {
    var mIndex, mAnchor, mLength, mOffset, mStep;
    var literalCount, dIndex, sEnd, n;
  
    // Setup initial state.
    dIndex = 0;
    sEnd = sLength + sIndex;
    mAnchor = sIndex;
  
    // Process only if block is large enough.
    if (sLength >= minLength) {
      var searchMatchCount = (1 << skipTrigger) + 3;
  
      // Consume until last n literals (Lz4 spec limitation.)
      while (sIndex + minMatch < sEnd - searchLimit) {
        var seq = readU32(src, sIndex);
        var hash = hashU32(seq) >>> 0;
  
        // Crush hash to 16 bits.
        hash = ((hash >> 16) ^ hash) >>> 0 & 0xffff;
  
        // Look for a match in the hashtable. NOTE: remove one; see below.
        mIndex = hashTable[hash] - 1;
  
        // Put pos in hash table. NOTE: add one so that zero = invalid.
        hashTable[hash] = sIndex + 1;
  
        // Determine if there is a match (within range.)
        if (mIndex < 0 || ((sIndex - mIndex) >>> 16) > 0 || readU32(src, mIndex) !== seq) {
          mStep = searchMatchCount++ >> skipTrigger;
          sIndex += mStep;
          continue;
        }
  
        searchMatchCount = (1 << skipTrigger) + 3;
  
        // Calculate literal count and offset.
        literalCount = sIndex - mAnchor;
        mOffset = sIndex - mIndex;
  
        // We've already matched one word, so get that out of the way.
        sIndex += minMatch;
        mIndex += minMatch;
  
        // Determine match length.
        // N.B.: mLength does not include minMatch, Lz4 adds it back
        // in decoding.
        mLength = sIndex;
        while (sIndex < sEnd - searchLimit && src[sIndex] === src[mIndex]) {
          sIndex++;
          mIndex++;
        }
        mLength = sIndex - mLength;
  
        // Write token + literal count.
        var token = mLength < mlMask ? mLength : mlMask;
        if (literalCount >= runMask) {
          dst[dIndex++] = (runMask << mlBits) + token;
          for (n = literalCount - runMask; n >= 0xff; n -= 0xff) {
            dst[dIndex++] = 0xff;
          }
          dst[dIndex++] = n;
        } else {
          dst[dIndex++] = (literalCount << mlBits) + token;
        }
  
        // Write literals.
        for (var i = 0; i < literalCount; i++) {
          dst[dIndex++] = src[mAnchor + i];
        }
  
        // Write offset.
        dst[dIndex++] = mOffset;
        dst[dIndex++] = (mOffset >> 8);
  
        // Write match length.
        if (mLength >= mlMask) {
          for (n = mLength - mlMask; n >= 0xff; n -= 0xff) {
            dst[dIndex++] = 0xff;
          }
          dst[dIndex++] = n;
        }
  
        // Move the anchor.
        mAnchor = sIndex;
      }
    }
  
    // Nothing was encoded.
    if (mAnchor === 0) {
      return 0;
    }
  
    // Write remaining literals.
    // Write literal token+count.
    literalCount = sEnd - mAnchor;
    if (literalCount >= runMask) {
      dst[dIndex++] = (runMask << mlBits);
      for (n = literalCount - runMask; n >= 0xff; n -= 0xff) {
        dst[dIndex++] = 0xff;
      }
      dst[dIndex++] = n;
    } else {
      dst[dIndex++] = (literalCount << mlBits);
    }
  
    // Write literals.
    sIndex = mAnchor;
    while (sIndex < sEnd) {
      dst[dIndex++] = src[sIndex++];
    }
  
    return dIndex;
  };
  
  // Decompresses a frame of Lz4 data.
  static decompressFrame (src, dst) {
    var useBlockSum, useContentSum, useContentSize, descriptor;
    var sIndex = 0;
    var dIndex = 0;
  
    // Read magic number
    if (readU32(src, sIndex) !== magicNum) {
      throw new Error('invalid magic number');
    }
  
    sIndex += 4;
  
    // Read descriptor
    descriptor = src[sIndex++];
  
    // Check version
    if ((descriptor & fdVersionMask) !== fdVersion) {
      throw new Error('incompatible descriptor version');
    }
  
    // Read flags
    useBlockSum = (descriptor & fdBlockChksum) !== 0;
    useContentSum = (descriptor & fdContentChksum) !== 0;
    useContentSize = (descriptor & fdContentSize) !== 0;
  
    // Read block size
    var bsIdx = (src[sIndex++] >> bsShift) & bsMask;
  
    if (bsMap[bsIdx] === undefined) {
      throw new Error('invalid block size');
    }
  
    if (useContentSize) {
      // TODO: read content size
      sIndex += 8;
    }
  
    sIndex++;
  
    // Read blocks.
    while (true) {
      var compSize;
  
      compSize = readU32(src, sIndex);
      sIndex += 4;
  
      if (compSize === 0) {
        break;
      }
  
      if (useBlockSum) {
        // TODO: read block checksum
        sIndex += 4;
      }
  
      // Check if block is compressed
      if ((compSize & bsUncompressed) !== 0) {
        // Mask off the 'uncompressed' bit
        compSize &= ~bsUncompressed;
  
        // Copy uncompressed data into destination buffer.
        for (var j = 0; j < compSize; j++) {
          dst[dIndex++] = src[sIndex++];
        }
      } else {
        // Decompress into blockBuf
        dIndex = lz4.decompressBlock(src, dst, sIndex, compSize, dIndex);
        sIndex += compSize;
      }
    }
  
    if (useContentSum) {
      // TODO: read content checksum
      sIndex += 4;
    }
  
    return dIndex;
  };
  
  // Compresses data to an Lz4 frame.
  static compressFrame (src, dst) {
    var dIndex = 0;
  
    // Write magic number.
    writeU32(dst, dIndex, magicNum);
    dIndex += 4;
  
    // Descriptor flags.
    dst[dIndex++] = fdVersion;
    dst[dIndex++] = bsDefault << bsShift;
  
    // Descriptor checksum.
    dst[dIndex] = xxh32(0, dst, 4, dIndex - 4) >> 8;
    dIndex++;
  
    // Write blocks.
    var maxBlockSize = bsMap[bsDefault];
    var remaining = src.length;
    var sIndex = 0;
  
    // Clear the hashtable.
    clearHashTable(hashTable);
  
    // Split input into blocks and write.
    while (remaining > 0) {
      var compSize = 0;
      var blockSize = remaining > maxBlockSize ? maxBlockSize : remaining;
  
      compSize = lz4.compressBlock(src, blockBuf, sIndex, blockSize, hashTable);
  
      if (compSize > blockSize || compSize === 0) {
        // Output uncompressed.
        writeU32(dst, dIndex, 0x80000000 | blockSize);
        dIndex += 4;
  
        for (var z = sIndex + blockSize; sIndex < z;) {
          dst[dIndex++] = src[sIndex++];
        }
  
        remaining -= blockSize;
      } else {
        // Output compressed.
        writeU32(dst, dIndex, compSize);
        dIndex += 4;
  
        for (var j = 0; j < compSize;) {
          dst[dIndex++] = blockBuf[j++];
        }
  
        sIndex += blockSize;
        remaining -= blockSize;
      }
    }
  
    // Write blank end block.
    writeU32(dst, dIndex, 0);
    dIndex += 4;
  
    return dIndex;
  };
  
  // Decompresses a buffer containing an Lz4 frame. maxSize is optional; if not
  // provided, a maximum size will be determined by examining the data. The
  // buffer returned will always be perfectly-sized.
  static decompress (src, maxSize) {
    var dst, size;
  
    if (maxSize === undefined) {
      maxSize = lz4.decompressBound(src);
    }
    dst = lz4.makeBuffer(maxSize);
    size = lz4.decompressFrame(src, dst);
  
    if (size !== maxSize) {
      dst = sliceArray(dst, 0, size);
    }
  
    return dst;
  };
  
  // Compresses a buffer to an Lz4 frame. maxSize is optional; if not provided,
  // a buffer will be created based on the theoretical worst output size for a
  // given input size. The buffer returned will always be perfectly-sized.
  static compress (src, maxSize) {
    var dst, size;
  
    if (maxSize === undefined) {
      maxSize = lz4.compressBound(src.length);
    }
  
    dst = lz4.makeBuffer(maxSize);
    size = lz4.compressFrame(src, dst);
  
    if (size !== maxSize) {
      dst = sliceArray(dst, 0, size);
    }
  
    return dst;
  };
  
  
  /********************************************************************************/
  //convenience function added for xpra:
  static decode (data) {
    const length = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    if (length<=0) {
      throw "invalid length: "+length;
    }
    if (length>1024*1024*1024) {
      throw "length too long: "+length;
    }
    const inflated = new Uint8Array(length);
    lz4.decompressBlock(data, inflated, 4, length, 0);
    return inflated;
  }
}

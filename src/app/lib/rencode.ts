/*
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */

var RENCODE = {
	DEFAULT_FLOAT_BITS : 32,
	MAX_INT_LENGTH : 64,

	CHR_LIST	: 59,
	CHR_DICT	: 60,
	CHR_INT 	: 61,
	CHR_INT1	: 62,
	CHR_INT2	: 63,
	CHR_INT4	: 64,
	CHR_INT8	: 65,
	CHR_FLOAT32	: 66,
	CHR_FLOAT64	: 44,
	CHR_TRUE	: 67,
	CHR_FALSE	: 68,
	CHR_NONE	: 69,
	CHR_TERM	: 127,

	INT_POS_FIXED_START : 0,
	INT_POS_FIXED_COUNT : 44,

	DICT_FIXED_START : 102,
	DICT_FIXED_COUNT : 25,

	INT_NEG_FIXED_START : 70,
	INT_NEG_FIXED_COUNT : 32,

	STR_FIXED_START : 128,
	STR_FIXED_COUNT : 64,

	LIST_FIXED_START : 128+64,	//STR_FIXED_START + STR_FIXED_COUNT,
	LIST_FIXED_COUNT : 64,

	COLON_CHARCODE : ":".charCodeAt(0),			//for char strings
	SLASH_CHARCODE : "/".charCodeAt(0),			//for byte strings
};

Number.isSafeInteger = Number.isSafeInteger || function (value) {
   return Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
};

function utf8ByteArrayToString(bytes) {
	var out = [], pos = 0, c = 0;
	while (pos < bytes.length) {
		var c1 = bytes[pos++];
		if (c1 < 128) {
			out[c++] = String.fromCharCode(c1);
		} else if (c1 > 191 && c1 < 224) {
			var c2 = bytes[pos++];
			out[c++] = String.fromCharCode((c1 & 31) << 6 | c2 & 63);
		} else if (c1 > 239 && c1 < 365) {
			// Surrogate Pair
			var c2 = bytes[pos++];
			var c3 = bytes[pos++];
			var c4 = bytes[pos++];
			var u = ((c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 0x10000;
			out[c++] = String.fromCharCode(0xD800 + (u >> 10));
			out[c++] = String.fromCharCode(0xDC00 + (u & 1023));
		} else {
			var c2 = bytes[pos++];
			var c3 = bytes[pos++];
			out[c++] = String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
		}
	}
	return out.join('');
}

function stringToUtf8ByteArray(str) {
	var out = [], p = 0;
	for (var i = 0; i < str.length; i++) {
		var c = str.charCodeAt(i);
		if (c < 128) {
			out[p++] = c;
		} else if (c < 2048) {
			out[p++] = (c >> 6) | 192;
			out[p++] = (c & 63) | 128;
		} else if (
			((c & 0xFC00) == 0xD800) && (i + 1) < str.length &&
			((str.charCodeAt(i + 1) & 0xFC00) == 0xDC00)) {
			// Surrogate Pair
			c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
			out[p++] = (c >> 18) | 240;
			out[p++] = ((c >> 12) & 63) | 128;
			out[p++] = ((c >> 6) & 63) | 128;
			out[p++] = (c & 63) | 128;
		} else {
			out[p++] = (c >> 12) | 224;
			out[p++] = ((c >> 6) & 63) | 128;
			out[p++] = (c & 63) | 128;
		}
	}
	return out;
}

function rencode_string(str) {
	const bytes = stringToUtf8ByteArray(str);
	const len = bytes.length;
	if (len < RENCODE.STR_FIXED_COUNT) {
		const u8a = new Uint8Array(len+1);
		u8a[0] = RENCODE.STR_FIXED_START+len;
		for (let i=0; i<len; ++i) {
			u8a[i+1] = bytes[i];
		}
		return u8a;
	}
	const len_str = len.toString();
	const len_len = len_str.length;
	const u8a = new Uint8Array(len_len+1+len);
	for (let i=0; i<len_len; ++i) {
		u8a[i] = len_str.charCodeAt(i);
	}
	const SEPARATOR = ":";
	u8a[len_len] = SEPARATOR.charCodeAt(0);
	for (let i=0; i<len_str; ++i) {
		u8a[len_len+1+i] = bytes[i];
	}
	return u8a;
}

function rencode_int(i) {
	let u8a = null;
	if (0 <= i && i < RENCODE.INT_POS_FIXED_COUNT) {
		u8a = new Uint8Array([RENCODE.INT_POS_FIXED_START + i])
	}
	else if (-RENCODE.INT_NEG_FIXED_COUNT <= i && i < 0) {
		u8a = new Uint8Array(new Int8Array([RENCODE.INT_NEG_FIXED_START - 1 -i]).buffer);
	}
	else if (-128 <= i && i < 128) {
		u8a = new Uint8Array(new Int8Array([RENCODE.CHR_INT1, i]).buffer);
	}
	else if (-32768 <= i && i < 32768) {
		u8a = new Uint8Array(new Int8Array([RENCODE.CHR_INT2, Math.floor(i/256) % 256, i%256]).buffer);
	}
	else if (-2147483648 <= i && i< 2147483648) {
		const i8a = new Int8Array(5);
		i8a[0] = RENCODE.CHR_INT4;
		i8a[1] = Math.floor(i/256/256/256);
		i8a[2] = Math.floor(i/256/256) % 256;
		i8a[3] = Math.floor(i/256) % 256;
		i8a[4] = i%256;
		u8a = new Uint8Array(i8a.buffer);
	}
	else if (-9223372036854775808 <= i && i < 9223372036854775808) {
		const i8a = new Int8Array(9);
		i8a[0] = RENCODE.CHR_INT8;
		for (let j=0; j<8; ++j) {
			i8a[8-j] = i%256;
			i = Math.floor(i/256);
		}
		u8a = new Uint8Array(i8a.buffer);
	}
	else {
		const str = i.toString();
		if (str.length >= RENCODE.MAX_INT_LENGTH) {
			throw "number too big: "+i;
		}
		const str_len = str.length;
		u8a = new Uint8Array(str_len+2);
		u8a[0] = RENCODE.CHR_INT;
		for (let j=0; j<str_len; ++j) {
			u8a[1+j] = str[j];
		}
		u8a[str_len+1] = RENCODE.CHR_TERM;
	}
	return u8a;
}


function rencode_merge_arrays(rlist) {
	let len = 0;
	for (let i=0; i<rlist.length; ++i) {
		len += rlist[i].length;
	}
	const u8a = new Uint8Array(len);
	let index = 0;
	for (let i=0; i<rlist.length; ++i) {
		u8a.set(rlist[i], index);
		index += rlist[i].length;
	}
	return u8a;
}

function rencode_uint8(a) {
	const len = a.length;
	const len_str = len.toString();
	const len_len = len_str.length;
	const u8a = new Uint8Array(len_len+1+len);
	for (let i=0; i<len_len; ++i) {
		u8a[i] = len_str.charCodeAt(i);
	}
	const SEPARATOR = "/";
	u8a[len_len] = SEPARATOR.charCodeAt(0);
	u8a.set(a, len_len+1);
	return u8a;
}

function rencode_list(l) {
	const list_len = l.length;
	const rlist = [];
	if (list_len < RENCODE.LIST_FIXED_COUNT) {
		rlist.push(new Uint8Array([RENCODE.LIST_FIXED_START + list_len]));
		for (let i=0; i<list_len; ++i) {
			rlist.push(rencode(l[i]));
		}
	}
	else {
		rlist.push(new Uint8Array([RENCODE.CHR_LIST]));
		for (let i=0; i<list_len; ++i) {
			rlist.push(rencode(l[i]));
		}
		rlist.push(new Uint8Array([RENCODE.CHR_TERM]));
	}
	return rencode_merge_arrays(rlist);
}

function rencode_dict(dict) {
	const dict_len = Object.keys(dict).length;
	const rlist = [];
	if (dict_len < RENCODE.DICT_FIXED_COUNT) {
		rlist.push(new Uint8Array([RENCODE.DICT_FIXED_START + dict_len]));
		for(key in dict) {
			value = dict[key];
			rlist.push(rencode(key));
			rlist.push(rencode(value));
		}
	}
	else {
		rlist.push(new Uint8Array([RENCODE.CHR_DICT]));
		for(key in dict) {
			value = dict[key];
			rlist.push(rencode(key));
			rlist.push(rencode(value));
		}
		rlist.push(new Uint8Array([RENCODE.CHR_TERM]));
	}
	return rencode_merge_arrays(rlist);
}

function rencode_bool(v) {
	if (v) {
		return new Uint8Array([RENCODE.CHR_TRUE]);
	}
	else {
		return new Uint8Array([RENCODE.CHR_FALSE]);
	}
}

function rencode_none() {
	return new Uint8Array([RENCODE.CHR_NONE]);
}

//turn this flag off to use "rencodeplus" when encoding
//this will send Uint8Array as 'binary'
//(decoding is always supported since not having it is free)
rencode_legacy_mode = true;
function rencodelegacy(obj) {
	rencode_legacy_mode = true;
	return rencode(obj);
}
function rencode(obj) {
	if (obj === null || obj === undefined) {
		return rencode_none();
	}
	const type = typeof obj;
	if(type === 'object') {
		if(typeof obj.length === 'undefined') {
			return rencode_dict(obj);
		}
		if(obj.constructor===Uint8Array) {
			if (rencode_legacy_mode) {
				//legacy rencode cannot handle bytearrays
				const CHUNK_SZ = 0x8000;
				const c = [];
				for (let i=0; i < u8a.length; i+=CHUNK_SZ) {
					c.push(String.fromCharCode.apply(null, u8a.subarray(i, i+CHUNK_SZ)));
				}
				return rencode_string(c.join(""));
			}
			return rencode_uint8(obj);
		}
		return rencode_list(obj);
	}
	switch(type) {
		case "string":		return rencode_string(obj);
		case "number":		return rencode_int(obj);
		case "list":		return rencode_list(obj);
		case "dictionary":	return rencode_dict(obj);
		case "boolean":		return rencode_bool(obj?1:0);
		default:	throw "invalid object type in source: "+type;
	}
}
function rencodeplus(obj) {
	rencode_legacy_mode = false;
	return rencode(obj);
}

function rdecode_string(dec) {
	let len = 0;
	while (dec.buf[dec.pos+len]!=RENCODE.COLON_CHARCODE && dec.buf[dec.pos+len]!=RENCODE.SLASH_CHARCODE) {
		len++;
	}
	const str_len_str = String.fromCharCode.apply(null, dec.buf.subarray(dec.pos, dec.pos+len));
	const str_len = parseInt(str_len_str);
	if (isNaN(str_len)) {
		throw "invalid string length: '"+str_len_str+"'";
	}
	const binary = dec.buf[dec.pos+len]==RENCODE.SLASH_CHARCODE;
	dec.pos += len+1;
	if (binary) {
		const bytes = dec.buf.subarray(dec.pos, dec.pos+str_len);
		dec.pos += str_len;
		return bytes;
	}
	if (str_len==0) {
		return "";
	}
	const sub = dec.buf.subarray(dec.pos, dec.pos+str_len);
	dec.pos += str_len;
	if (rencode_legacy_mode) {
		return Uint8ToString(sub);
	}
	return utf8ByteArrayToString(sub)
}
function Uint8ToString(u8a){
	const CHUNK_SZ = 0x8000;
	const c = [];
	for (let i=0; i < u8a.length; i+=CHUNK_SZ) {
		c.push(String.fromCharCode.apply(null, u8a.subarray(i, i+CHUNK_SZ)));
	}
	return c.join("");
}
function rdecode_list(dec) {
	dec.pos++;
	const list = [];
	while (dec.buf[dec.pos]!=RENCODE.CHR_TERM) {
		list.push(_rdecode(dec));
	}
	dec.pos++;
	return list;
}
function rdecode_dict(dec) {
	dec.pos++;
	const dict = {};
	while (dec.buf[dec.pos]!=RENCODE.CHR_TERM) {
		const key = _rdecode(dec);
		const value = _rdecode(dec);
		dict[key] = value;
	}
	dec.pos++;
	return dict;
}
function rdecode_int(dec) {
	dec.pos++;
	let len = 0;
	while (dec.buf[dec.pos+len]!=RENCODE.CHR_TERM) {
		len++;
	}
	const int_str = String.fromCharCode.apply(null, dec.buf.subarray(dec.pos, dec.pos+len));
	dec.pos += len+1;
	const i = parseInt(int_str);
	if (isNaN(i)) {
		throw "invalid int: '"+int_str+"'";
	}
	return i;
}
function rdecode_intb(dec) {
	//this magically makes the value signed:
	let b = dec.buf[dec.pos+1]<<24>>24;
	dec.pos += 2;
	return b;
}
function rdecode_inth(dec) {
	const slice = dec.buf.slice(dec.pos+1, dec.pos+3)
	const dv = new DataView(slice.buffer);
	const s = dv.getInt16(0);
	dec.pos += 3;
	return s;
}
function rdecode_intl(dec) {
	const slice = dec.buf.slice(dec.pos+1, dec.pos+5)
	const dv = new DataView(slice.buffer);
	const s = dv.getInt32(0);
	dec.pos += 5;
	return s;
}
function rdecode_intq(dec) {
	const slice = dec.buf.slice(dec.pos+1, dec.pos+9)
	const dv = new DataView(slice.buffer);
	let s = 0;
	if ("getBigInt64" in DataView.prototype) {
		s = dv.getBigInt64(0);
	}
	else {
		//oh, IE...
		const left =  dv.getInt32(0);
		const right = dv.getUint32(4);
		s = 2**32*left + right;
	}
	dec.pos += 9;
	if (!Number.isSafeInteger(s)) {
		//console.warn("value is not a safe integer: ", s);
	}
	return parseInt(s);
}
function rdecode_true(dec) {
	dec.pos++;
	return true;
}
function rdecode_false(dec) {
	dec.pos++;
	return false;
}
function rdecode_none(dec) {
	dec.pos++;
	return null;
}

const decode_func = new Map();
for(let i=0; i<10; i++) {
	const charcode = i.toString().charCodeAt(0);
	decode_func[charcode] = rdecode_string;
}

decode_func[RENCODE.CHR_LIST] = rdecode_list
decode_func[RENCODE.CHR_DICT] = rdecode_dict
decode_func[RENCODE.CHR_INT] = rdecode_int
decode_func[RENCODE.CHR_INT1] = rdecode_intb
decode_func[RENCODE.CHR_INT2] = rdecode_inth
decode_func[RENCODE.CHR_INT4] = rdecode_intl
decode_func[RENCODE.CHR_INT8] = rdecode_intq
decode_func[RENCODE.CHR_TRUE] = rdecode_true
decode_func[RENCODE.CHR_FALSE] = rdecode_false
decode_func[RENCODE.CHR_NONE] = rdecode_none


function make_fixed_length_string_decoder(len) {
	function fixed_length_string_decoder(dec) {
		dec.pos++;
		const u8a = dec.buf.subarray(dec.pos, dec.pos+len);
		dec.pos += len;
		return utf8ByteArrayToString(u8a);
	}
	return fixed_length_string_decoder;
}
for(let i=0; i<RENCODE.STR_FIXED_COUNT; i++) {
	decode_func[RENCODE.STR_FIXED_START + i] = make_fixed_length_string_decoder(i);
}

function make_fixed_length_list_decoder(len) {
	function fixed_length_list_decoder(dec) {
		dec.pos++;
		let list = [];
		for (let i=0; i<len; i++) {
			list.push(_rdecode(dec));
		}
		return list
	}
	return fixed_length_list_decoder;
}
for(let i=0; i<RENCODE.LIST_FIXED_COUNT; i++) {
	decode_func[RENCODE.LIST_FIXED_START + i] = make_fixed_length_list_decoder(i);
}

function make_fixed_length_dict_decoder(len) {
	function fixed_length_dict_decoder(dec) {
		dec.pos++;
		const dict = {};
		for(let i=0; i<len; i++) {
			const key = _rdecode(dec);
			const value = _rdecode(dec);
			dict[key] = value;
		}
		return dict;
	}
	return fixed_length_dict_decoder;
}
for(let i=0; i<RENCODE.DICT_FIXED_COUNT; i++) {
	decode_func[RENCODE.DICT_FIXED_START + i] = make_fixed_length_dict_decoder(i);
}

function make_int_fixed_decoder(i) {
	function int_fixed_decoder(dec) {
		dec.pos++;
		return i;
	}
	return int_fixed_decoder;
}
for(let i=0; i<RENCODE.INT_POS_FIXED_COUNT; i++) {
	decode_func[RENCODE.INT_POS_FIXED_START + i] = make_int_fixed_decoder(i)
}
for(let i=0; i<RENCODE.INT_NEG_FIXED_COUNT; i++) {
	decode_func[RENCODE.INT_NEG_FIXED_START + i] = make_int_fixed_decoder(-1 - i)
}


class DecodeBuffer {
  constructor(u8a) {
	this.buf = u8a;
	this.pos = 0;
  }
}

function _rdecode(dec) {
	if (dec.pos>=dec.buf.length) {
		throw "reached end of buffer"
	}
	const typecode = dec.buf[dec.pos];
	const decode = decode_func[typecode];
	if (decode === null || decode === undefined) {
		//console.log("buffer pos:", dec.pos);
		//console.log("buffer:", dec.buf.subarray(dec.pos, dec.pos+20))
		//const str = String.fromCharCode.apply(null, dec.buf.subarray(dec.pos, dec.pos+20));
		throw "no decoder for typecode "+typecode+" at position "+dec.pos;
	}
	return decode(dec);
}

function rdecodelegacy(buf) {
	rencode_legacy_mode = true;
	return rdecode(buf);
}
function rdecodeplus(buf) {
	rencode_legacy_mode = false;
	return rdecode(buf);
}

function rdecode(buf) {
	const type = typeof buf;
	if (type === "string") {
		const u8a = new Uint8Array(buf.length);
		for(let i=0,j=buf.length;i<j;++i){
			u8a[i] = buf.charCodeAt(i);
		}
		return _rdecode(new DecodeBuffer(u8a));
	}
	if (type === 'object' && buf.constructor===Uint8Array) {
		return _rdecode(new DecodeBuffer(buf));
	}
	throw "cannot decode "+type;
}


function rencode_selftest() {
	function test_value(input, output) {
		var u8a_output = new Uint8Array(output);
		var enc = rencode(input);
		//console.log("test_value(", input, ", ", output, ") rencode("+input+")="+enc);
		if (enc.length!=u8a_output.length) {
			throw "failed to encode '"+input+"', expected length "+u8a_output.length+" bytes but got "+enc.length;
		}
		for(let i=0,j=enc.length;i<j;++i){
			if (enc[i]!=u8a_output[i]) {
				throw "failed to encode '"+input+"', expected '"+u8a_output+"' but got '"+enc+"', error at position "+i+": "+enc[i]+" vs "+u8a_output[i];
			}
		}
		var dec = rdecode(enc);
		if (dec!=input) {
			throw "failed to decode '"+enc+"', expected '"+input+"' but got '"+dec+"'";
		}
	}

	try {
		test_value(true, [67]);
		test_value(false, [68]);
		test_value(-10, [79]);
		test_value(-29, [98]);
		test_value(1, [1]);
		test_value(40, [40]);
		test_value('foobarbaz', [137, 102, 111, 111, 98, 97, 114, 98, 97, 122]);
		//we don't handle floats
		//test_value(1234.56, [66, 68, 154, 81, 236]);
		test_value(100, [62, 100]);
		test_value(-100, [62, 156]);
		test_value(7483648, [64, 0, 114, 49, 0]);
		test_value(-7483648, [64, 255, 141, 207, 0]);
		test_value(8223372036854775808, [65, 114, 31, 73, 76, 88, 156, 0, 0]);
		test_value(-8223372036854775808, [65, 141, 224, 182, 179, 167, 100, 0, 0]);
		test_value(27123, [63, 105, 243]);
		test_value(-27123, [63, 150, 13]);
		test_value('\x00', [129, 0]);
		test_value("fööbar", [136, 102, 195, 182, 195, 182, 98, 97, 114]);
		return true;
	}
	catch (e) {
		console.log("rencode failed its self test", e);
		return false;
	}
}

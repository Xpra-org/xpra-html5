/*
 * This file is part of Xpra.
 * Copyright (C) 2016-2022 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

'use strict';

const DEFAULT_BOX_COLORS = {
        "png"     : "yellow",
        "h264"    : "blue",
        "vp8"     : "green",
        "rgb24"   : "orange",
        "rgb32"   : "red",
        "jpeg"    : "purple",
        "webp"    : "pink",
        "png/P"   : "indigo",
        "png/L"   : "teal",
        "h265"    : "khaki",
        "vp9"     : "lavender",
        "mpeg4"   : "black",
        "scroll"  : "brown",
        "mpeg1"   : "olive",
        "avif"    : "cyan",
        };



const MOVERESIZE_SIZE_TOPLEFT      = 0;
const MOVERESIZE_SIZE_TOP          = 1;
const MOVERESIZE_SIZE_TOPRIGHT     = 2;
const MOVERESIZE_SIZE_RIGHT        = 3;
const MOVERESIZE_SIZE_BOTTOMRIGHT  = 4;
const MOVERESIZE_SIZE_BOTTOM       = 5;
const MOVERESIZE_SIZE_BOTTOMLEFT   = 6;
const MOVERESIZE_SIZE_LEFT         = 7;
const MOVERESIZE_MOVE              = 8;
const MOVERESIZE_SIZE_KEYBOARD     = 9;
const MOVERESIZE_MOVE_KEYBOARD     = 10;
const MOVERESIZE_CANCEL            = 11;
const MOVERESIZE_DIRECTION_STRING = {
                               0    : "SIZE_TOPLEFT",
                               1    : "SIZE_TOP",
                               2    : "SIZE_TOPRIGHT",
                               3    : "SIZE_RIGHT",
                               4  	: "SIZE_BOTTOMRIGHT",
                               5    : "SIZE_BOTTOM",
                               6   	: "SIZE_BOTTOMLEFT",
                               7    : "SIZE_LEFT",
                               8	: "MOVE",
                               9    : "SIZE_KEYBOARD",
                               10   : "MOVE_KEYBOARD",
                               11	: "CANCEL",
                               };
const MOVERESIZE_DIRECTION_JS_NAME = {
        0	: "nw",
        1	: "n",
        2	: "ne",
        3	: "e",
        4	: "se",
        5	: "s",
        6	: "sw",
        7	: "w",
        };

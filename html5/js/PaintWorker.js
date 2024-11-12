/*
 * This file is part of Xpra.
 * Copyright (C) 2022 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */

/*
 * Worker for offscreen painting.
 */

importScripts("./Constants.js");

const KEEP_STILLS = false; // Keep a screenshot of each window for repaint. This seems to affect performance.

class XpraPaintWorker {
  constructor() {
    this.offscreen_canvas = new Map();
    this.offscreen_canvas_still = new Map();
    this.debug = false;
  }

  add_canvas(wid, canvas, debug) {
    this.offscreen_canvas.set(wid, canvas);
    this.offscreen_canvas_still.set(wid, new OffscreenCanvas(canvas.width, canvas.height));
    if (debug) {
      this.debug = true;
    }
  }

  update_canvas(wid, w, h) {
    let canvas = this.offscreen_canvas.get(wid);
    let still = this.offscreen_canvas_still.get(wid);
    if (canvas != null && (canvas.width != w || canvas.height != h)) {
      canvas.width = w;
      canvas.height = h;
      still.width = w;
      still.height = h;
    }
  }

  paint_packet(wid, coding, image, x, y, width, height) {
    let painted = false;
    try {
      // Paint the packet on screen refresh (if we can use requestAnimationFrame in the worker)
      if (typeof requestAnimationFrame == "function") {
        requestAnimationFrame(() => {
          this.do_paint_packet(wid, coding, image, x, y, width, height);
        });
        painted = true;
      }
    } catch {
      // If requestAnimationFrame is a function but it failed somehow (ie forbidden in worker in the current browser) we fall back
      painted = false;
    } finally {
      if (!painted) {
        // Paint right away
        this.do_paint_packet(wid, coding, image, x, y, width, height);
      }
    }
  }

  do_paint_packet(wid, coding, image, x, y, width, height) {
    // Update the coding propery
    let context = this.offscreen_canvas.get(wid).getContext("2d");
    if (coding.startsWith("bitmap")) {
      // Bitmap paint
      context.imageSmoothingEnabled = false;
      context.clearRect(x, y, width, height);
      context.drawImage(image, x, y, width, height);
      this.paint_box(coding, context, x, y, width, height);
    } else if (coding == "scroll") {
      let canvas = this.offscreen_canvas.get(wid);
      context.imageSmoothingEnabled = false;
      for (let index = 0, stop = image.length; index < stop; ++index) {
        const scroll_data = image[index];
        const sx = scroll_data[0];
        const sy = scroll_data[1];
        const sw = scroll_data[2];
        const sh = scroll_data[3];
        const xdelta = scroll_data[4];
        const ydelta = scroll_data[5];
        context.drawImage(canvas,
          sx, sy, sw, sh,
          sx + xdelta, sy + ydelta, sw, sh,
        );
        this.paint_box(coding, context, sx, sy, sw, sh);
      }
    } else if (coding.startsWith("frame")) {
      context.drawImage(image, x, y, width, height);
      image.close();
      this.paint_box(coding, context, x, y, width, height);
    }
    image = null;

    //Call update_still in callback
    if (KEEP_STILLS) {
      setTimeout(() => this.update_still(wid), 0);
    }
  }

  paint_box(coding, context, px, py, pw, ph) {
    if (!this.debug) {
      return;
    }
    const source_encoding = coding.split(":")[1] || ""; //ie: "rgb24"
    const box_color = DEFAULT_BOX_COLORS[source_encoding];
    if (box_color) {
      context.strokeStyle = box_color;
      context.lineWidth = 2;
      context.strokeRect(px, py, pw, ph);
    }
  }

  update_still(wid) {
    let canvas = this.offscreen_canvas.get(wid);
    let still = this.offscreen_canvas_still.get(wid);
    still.getContext("2d").drawImage(canvas,
        0, 0, canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height,
      );
  }

  delete_canvas(wid) {
    this.offscreen_canvas.delete(wid);
    this.offscreen_canvas_still.delete(wid);
  }

  redraw(wid) {
    if (KEEP_STILLS) {
      let canvas = this.offscreen_canvas.get(wid);
      let still = this.offscreen_canvas_still.get(wid);
      canvas.getContext("2d").drawImage(still,
          0, 0, still.width, still.height,
          0, 0, still.width, still.height
        );
    } else {
      console.warn(`PaintWorker was asked for a redraw on window ${wid} but no still is available!`);
    }
  }
}

// Message handling to class
const xpraPaintWorker = new XpraPaintWorker();
onmessage = function (e) {
  const data = e.data;
  switch (data.cmd) {
    case "paint":
      xpraPaintWorker.paint_packet(data.wid, data.coding, data.image, data.x, data.y, data.w, data.h);
      data.image = null;
      break;
    case "remove":
      xpraPaintWorker.delete_canvas(data.wid);
      break;
    case "canvas":
      console.log("canvas transfer for window", data.wid, ":", data.canvas, data.debug);
      if (data.canvas) {
        xpraPaintWorker.add_canvas(data.wid, data.canvas, data.debug);
      }
      break;
    case "canvas-geo":
      xpraPaintWorker.update_canvas(data.wid, data.w, data.h);
      break;
    case "redraw":
      xpraPaintWorker.redraw(data.wid);
      break;
    default:
      console.error(`Offscreen decode worker got unknown message: ${data.cmd}`);
  }
};

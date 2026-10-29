/*
 * This file is part of Xpra.
 * Copyright (C) 2026 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 * Run with: node --test tests/
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function classList(initial = []) {
  const set = new Set(initial);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
  };
}

function element(tag, classes = []) {
  const listeners = {};
  const el = {
    tagName: tag,
    classList: classList(classes),
    children: [],
    matches: () => false,
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
    querySelectorAll: (selector) => {
      if (selector === "ul") {
        return el.children.filter((c) => c.tagName === "ul");
      }
      return [];
    },
    hideMenu() {},
    showMenu() {},
  };
  return el;
}

function load_menu(document) {
  const context = vm.createContext({
    console,
    document,
    window: {
      addEventListener: () => {},
      _xpraMenuOutsideBound: 0,
    },
    setTimeout: (fn) => fn(),
  });
  const source = readFileSync(new URL("../html5/js/Menu.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  return context.window;
}

test("rebindMenuHandlers wires showMenu and hideMenu on submenu items", () => {
  const item = element("li", ["-hasSubmenu"]);
  const ul = element("ul", ["-hide"]);
  item.children = [ul];
  const document = {
    querySelectorAll: (selector) => {
      if (selector.includes("Menu li.-hasSubmenu")) {
        return [item];
      }
      if (selector.includes("Menu > li.-hasSubmenu")) {
        return [item];
      }
      if (selector.startsWith("#menu_list") || selector.startsWith("#startmenu") || selector.includes(".Menu>li")) {
        return [];
      }
      if (selector === "a") {
        return [];
      }
      return [];
    },
    getElementById: () => null,
    addEventListener: () => {},
  };
  const win = load_menu(document);
  win.rebindMenuHandlers();
  assert.equal(typeof item.showMenu, "function");
  assert.equal(typeof item.hideMenu, "function");
  item.showMenu.call(item);
  assert.equal(item.classList.contains("-active"), true);
  assert.equal(ul.classList.contains("-visible"), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { rgb } from "@rezi-ui/core";

import { parseColor } from "../../translation/colorMap.js";

test("parseColor maps named colors", () => {
  assert.equal(parseColor("green"), rgb(0, 205, 0));
  assert.equal(parseColor("whiteBright"), rgb(255, 255, 255));
  assert.equal(parseColor("GRAY"), rgb(127, 127, 127));
});

test("parseColor parses hex colors", () => {
  assert.equal(parseColor("#00ff7f"), rgb(0, 255, 127));
  assert.equal(parseColor("#abc"), rgb(170, 187, 204));
});

test("parseColor parses rgb() colors", () => {
  assert.equal(parseColor("rgb(12, 34, 56)"), rgb(12, 34, 56));
  assert.equal(parseColor("rgb( 0 , 255 , 127 )"), rgb(0, 255, 127));
});

test("parseColor parses ansi256() colors", () => {
  assert.equal(parseColor("ansi256(196)"), rgb(255, 0, 0));
  assert.equal(parseColor("ansi256(244)"), rgb(128, 128, 128));
  assert.equal(parseColor("ansi256(999)"), undefined);
});

test("parseColor returns undefined for invalid input", () => {
  assert.equal(parseColor(undefined), undefined);
  assert.equal(parseColor(""), undefined);
  assert.equal(parseColor("not-a-color"), undefined);
  assert.equal(parseColor("#12"), undefined);
  assert.equal(parseColor("#xyzxyz"), undefined);
  assert.equal(parseColor("rgb(999, 0, 0)"), undefined);
  assert.equal(parseColor("rgb(a, b, c)"), undefined);
});

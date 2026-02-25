import assert from "node:assert/strict";
import test from "node:test";

import { mapBorderStyle } from "../../translation/borderMap.js";
import { mapAlign, mapJustify } from "../../translation/layoutMap.js";

test("mapBorderStyle maps known Ink border names", () => {
  assert.equal(mapBorderStyle("single"), "single");
  assert.equal(mapBorderStyle("double"), "double");
  assert.equal(mapBorderStyle("round"), "rounded");
  assert.equal(mapBorderStyle("bold"), "heavy");
  assert.equal(mapBorderStyle("singleDouble"), "single");
  assert.equal(mapBorderStyle("doubleSingle"), "double");
  assert.equal(mapBorderStyle("classic"), "single");
  assert.equal(mapBorderStyle("dashed"), "dashed");
  assert.equal(mapBorderStyle("none"), "none");
});

test("mapBorderStyle handles object and unknown fallback", () => {
  assert.equal(mapBorderStyle({ topLeft: "+" }), "single");
  assert.equal(mapBorderStyle("unknown"), "single");
  assert.equal(mapBorderStyle(undefined), undefined);
});

test("mapAlign maps align values", () => {
  assert.equal(mapAlign("flex-start"), "start");
  assert.equal(mapAlign("center"), "center");
  assert.equal(mapAlign("flex-end"), "end");
  assert.equal(mapAlign("stretch"), "stretch");
  assert.equal(mapAlign("baseline"), undefined);
  assert.equal(mapAlign(undefined), undefined);
});

test("mapJustify maps justify values", () => {
  assert.equal(mapJustify("flex-start"), "start");
  assert.equal(mapJustify("flex-end"), "end");
  assert.equal(mapJustify("center"), "center");
  assert.equal(mapJustify("space-between"), "between");
  assert.equal(mapJustify("space-around"), "around");
  assert.equal(mapJustify("space-evenly"), "evenly");
  assert.equal(mapJustify("baseline"), undefined);
  assert.equal(mapJustify(undefined), undefined);
});

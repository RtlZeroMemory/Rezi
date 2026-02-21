import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { normalizeViewport, resolveWidgetDemoLayout } from "../hsr/widget-layout.mjs";

describe("widget demo responsive layout helper", () => {
  test("normalizeViewport applies sane defaults for missing/non-numeric values", () => {
    assert.deepEqual(normalizeViewport(undefined), { cols: 80, rows: 24 });
    assert.deepEqual(normalizeViewport({ cols: Number.NaN, rows: null }), { cols: 80, rows: 24 });
  });

  test("normalizeViewport clamps very small values", () => {
    assert.deepEqual(normalizeViewport({ cols: 1, rows: 2 }), { cols: 20, rows: 8 });
    assert.deepEqual(normalizeViewport({ cols: -99, rows: -99 }), { cols: 20, rows: 8 });
  });

  test("normalizeViewport floors fractional sizes", () => {
    assert.deepEqual(normalizeViewport({ cols: 99.9, rows: 29.2 }), { cols: 99, rows: 29 });
  });

  test("resolveWidgetDemoLayout chooses tiny/compact/full deterministically", () => {
    assert.equal(resolveWidgetDemoLayout({ cols: 63, rows: 30 }), "tiny");
    assert.equal(resolveWidgetDemoLayout({ cols: 80, rows: 24 }), "compact");
    assert.equal(resolveWidgetDemoLayout({ cols: 120, rows: 40 }), "full");
  });

  test("resolveWidgetDemoLayout treats short terminals as tiny even when wide", () => {
    assert.equal(resolveWidgetDemoLayout({ cols: 160, rows: 17 }), "tiny");
  });

  test("resolveWidgetDemoLayout requires roomy viewport for full side-by-side layout", () => {
    assert.equal(resolveWidgetDemoLayout({ cols: 111, rows: 40 }), "compact");
    assert.equal(resolveWidgetDemoLayout({ cols: 120, rows: 29 }), "compact");
    assert.equal(resolveWidgetDemoLayout({ cols: 112, rows: 30 }), "full");
  });
});

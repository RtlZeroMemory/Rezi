import assert from "node:assert/strict";
import test from "node:test";
import { ZrUiError } from "../../abi.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { compileTheme } from "../../theme/theme.js";
import { ui } from "../../ui.js";
import { PRINT_ABOVE_MAX_ROWS, renderViewForScrollback } from "../printAbove.js";

const theme = compileTheme(defaultTheme.definition);

const ZRDL_MAGIC = 0x4c44525a;

function readU32le(bytes: Uint8Array, off: number): number {
  return (
    ((bytes[off] ?? 0) |
      ((bytes[off + 1] ?? 0) << 8) |
      ((bytes[off + 2] ?? 0) << 16) |
      ((bytes[off + 3] ?? 0) << 24)) >>>
    0
  );
}

test("printAbove render: single text line measures one row and emits ZRDL", () => {
  const rendered = renderViewForScrollback(ui.text("hello scrollback"), 40, theme);
  assert.equal(rendered.rows, 1);
  assert.ok(rendered.bytes.byteLength > 64);
  assert.equal(readU32le(rendered.bytes, 0), ZRDL_MAGIC);
  /* header cmd_count at offset 24 must be non-zero for painted content */
  assert.ok(readU32le(rendered.bytes, 24) > 0);
});

test("printAbove render: column of texts measures its natural height", () => {
  /* Default column gap is part of the measured height: 3 texts + 2 gaps. */
  const view = ui.column({}, [ui.text("one"), ui.text("two"), ui.text("three")]);
  const rendered = renderViewForScrollback(view, 40, theme);
  assert.equal(rendered.rows, 5);
});

test("printAbove render: wrapping text grows measured rows at narrow widths", () => {
  const long = "a".repeat(30);
  const wide = renderViewForScrollback(ui.text(long, { wrap: true }), 40, theme);
  const narrow = renderViewForScrollback(ui.text(long, { wrap: true }), 10, theme);
  assert.equal(wide.rows, 1);
  assert.ok(narrow.rows >= 3);
});

test("printAbove render: explicit rows override is respected", () => {
  const rendered = renderViewForScrollback(ui.text("x"), 40, theme, 4);
  assert.equal(rendered.rows, 4);
});

test("printAbove render: invalid inputs are rejected", () => {
  assert.throws(
    () => renderViewForScrollback(ui.text("x"), 0, theme),
    (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
  );
  assert.throws(
    () => renderViewForScrollback(ui.text("x"), 40, theme, 0),
    (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
  );
  assert.throws(
    () => renderViewForScrollback(ui.text("x"), 40, theme, PRINT_ABOVE_MAX_ROWS + 1),
    (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
  );
});

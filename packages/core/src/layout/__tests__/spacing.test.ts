import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveMargin } from "../spacing.js";
import { validateBoxProps, validateStackProps } from "../validateProps.js";

describe("spacing", () => {
  test("resolveMargin: mt/mr/mb/ml overrides mx/my/m", () => {
    const out = resolveMargin({ m: 1, mx: 2, my: 3, mt: 4, ml: 5 });
    assert.deepEqual(out, { top: 4, right: 2, bottom: 3, left: 5 });
  });

  test("validateBoxProps: accepts spacing keys (p/m + legacy pad)", () => {
    const res = validateBoxProps({ p: "md", mx: "lg", mt: "sm", pad: "sm" });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.p, 2);
    assert.equal(res.value.mx, 3);
    assert.equal(res.value.mt, 1);
    assert.equal(res.value.pad, 1);
  });

  test("validateStackProps(row): accepts spacing keys (gap/p/m)", () => {
    const res = validateStackProps("row", { gap: "sm", p: "md", m: "sm" });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.gap, 1);
    assert.equal(res.value.p, 2);
    assert.equal(res.value.m, 1);
  });

  test("validateStackProps(column): accepts spacing keys (gap + legacy pad)", () => {
    const res = validateStackProps("column", { gap: "sm", pad: "md", px: "lg", my: "sm" });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.gap, 1);
    assert.equal(res.value.pad, 2);
    assert.equal(res.value.px, 3);
    assert.equal(res.value.my, 1);
  });

  test("validateBoxProps: accepts signed int32 margins", () => {
    const res = validateBoxProps({
      m: -1,
      mx: -2,
      my: -3,
      mt: -4,
      mr: -5,
      mb: -6,
      ml: -7,
    });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.m, -1);
    assert.equal(res.value.mx, -2);
    assert.equal(res.value.my, -3);
    assert.equal(res.value.mt, -4);
    assert.equal(res.value.mr, -5);
    assert.equal(res.value.mb, -6);
    assert.equal(res.value.ml, -7);
  });

  test("validateBoxProps: rejects negative padding with deterministic detail", () => {
    const pRes = validateBoxProps({ p: -1 });
    assert.equal(pRes.ok, false);
    if (pRes.ok) throw new Error("expected fatal");
    assert.equal(pRes.fatal.code, "ZRUI_INVALID_PROPS");
    assert.equal(pRes.fatal.detail, "box.p must be an int32 >= 0");

    const padRes = validateBoxProps({ pad: -1 });
    assert.equal(padRes.ok, false);
    if (padRes.ok) throw new Error("expected fatal");
    assert.equal(padRes.fatal.code, "ZRUI_INVALID_PROPS");
    assert.equal(padRes.fatal.detail, "box.pad must be an int32 >= 0");
  });

  test("validateStackProps: rejects negative gap with deterministic detail", () => {
    const res = validateStackProps("row", { gap: -1 });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected fatal");
    assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
    assert.equal(res.fatal.detail, "row.gap must be an int32 >= 0");
  });

  test("validate spacing accepts numeric strings and truncates finite numbers", () => {
    const res = validateBoxProps({ p: "2.9", m: "-3.4", pad: 1.8 });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.p, 2);
    assert.equal(res.value.m, -3);
    assert.equal(res.value.pad, 1);
  });

  test("validate spacing rejects negative fractional non-negative fields", () => {
    const res = validateBoxProps({ p: "-0.4" });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected fatal");
    assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
    assert.equal(res.fatal.detail, "box.p must be an int32 >= 0");
  });

  test("stack enum values are normalized for casing/whitespace", () => {
    const res = validateStackProps("row", {
      align: " Center ",
      justify: " BETWEEN ",
      overflow: " Scroll ",
    });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.align, "center");
    assert.equal(res.value.justify, "between");
    assert.equal(res.value.overflow, "scroll");
  });

  test("box border enum is normalized for casing/whitespace", () => {
    const res = validateBoxProps({ border: " Heavy-Dashed " });
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.border, "heavy-dashed");
  });

  test("layout size constraints normalize string numbers and auto", () => {
    const numeric = validateBoxProps({
      width: " 12.8 ",
      minWidth: "2.9",
      maxWidth: "20",
      height: "6.9",
    });
    assert.equal(numeric.ok, true);
    if (!numeric.ok) throw new Error("expected ok");
    assert.equal(numeric.value.width, 12);
    assert.equal(numeric.value.minWidth, 2);
    assert.equal(numeric.value.maxWidth, 20);
    assert.equal(numeric.value.height, 6);

    const auto = validateBoxProps({ width: " AUTO " });
    assert.equal(auto.ok, true);
    if (!auto.ok) throw new Error("expected ok");
    assert.equal(auto.value.width, "auto");
  });

  test("layout size constraints reject removed percentage strings", () => {
    const res = validateBoxProps({ height: "50%" });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected fatal");
    assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
    assert.match(res.fatal.detail, /no longer supports percentage strings/i);
  });
});

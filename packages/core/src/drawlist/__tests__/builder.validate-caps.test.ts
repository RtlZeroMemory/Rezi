import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder } from "../../index.js";

describe("DrawlistBuilder (ZRDL v1) - validation and caps", () => {
  test("invalid params: NaN/Infinity/negative sizes/non-int32 -> ZRDL_BAD_PARAMS", () => {
    {
      const b = createDrawlistBuilder();
      b.fillRect(Number.NaN, 0, 0, 0);
      const res = b.build();
      assert.equal(res.ok, false);
      if (res.ok) return;
      assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
    }

    {
      const b = createDrawlistBuilder();
      b.pushClip(0, Number.POSITIVE_INFINITY, 0, 0);
      const res = b.build();
      assert.equal(res.ok, false);
      if (res.ok) return;
      assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
    }

    {
      const b = createDrawlistBuilder();
      b.fillRect(0, 0, -1, 0);
      const res = b.build();
      assert.equal(res.ok, false);
      if (res.ok) return;
      assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
    }

    {
      const b = createDrawlistBuilder();
      b.fillRect(0, 0, 1.5, 0);
      const res = b.build();
      assert.equal(res.ok, false);
      if (res.ok) return;
      assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
    }

    {
      const b = createDrawlistBuilder();
      b.fillRect(2147483648, 0, 0, 0);
      const res = b.build();
      assert.equal(res.ok, false);
      if (res.ok) return;
      assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
    }

    {
      const b = createDrawlistBuilder();
      // @ts-expect-error runtime bad param test
      b.drawText(0, 0, 123);
      const res = b.build();
      assert.equal(res.ok, false);
      if (res.ok) return;
      assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
    }
  });

  test("cap: maxCmdCount -> ZRDL_TOO_LARGE (and reset restores usability)", () => {
    const b = createDrawlistBuilder({ maxCmdCount: 1 });
    b.clear();
    b.clear();

    const res = b.build();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_TOO_LARGE");

    b.reset();
    b.clear();
    const res2 = b.build();
    assert.equal(res2.ok, true);
  });

  test("cap: maxStrings (persistent strings) -> ZRDL_TOO_LARGE (and reset restores usability)", () => {
    const b = createDrawlistBuilder({ maxStrings: 1 });
    b.setLink("a");
    b.drawText(0, 0, "x");
    b.setLink("b");
    b.drawText(0, 1, "y");

    const res = b.build();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_TOO_LARGE");

    b.reset();
    b.setLink("a");
    b.drawText(0, 0, "x");
    const res2 = b.build();
    assert.equal(res2.ok, true);
  });

  test("cap: maxStringBytes (persistent strings) -> ZRDL_TOO_LARGE (and reset restores usability)", () => {
    const b = createDrawlistBuilder({ maxStringBytes: 1 });
    b.setLink("ab");
    b.drawText(0, 0, "x");

    const res = b.build();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_TOO_LARGE");

    b.reset();
    b.setLink("a");
    b.drawText(0, 0, "x");
    const res2 = b.build();
    assert.equal(res2.ok, true);
  });

  test("cap: maxDrawlistBytes -> ZRDL_TOO_LARGE (and reset restores usability)", () => {
    const b = createDrawlistBuilder({ maxDrawlistBytes: 72 });
    b.fillRect(1, 2, 3, 4);

    const res = b.build();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_TOO_LARGE");

    b.reset();
    b.clear();
    const res2 = b.build();
    assert.equal(res2.ok, true);
  });

  test("cap: reserveTextArena preflights maxDrawlistBytes before allocating", () => {
    const b = createDrawlistBuilder({ maxDrawlistBytes: 128 });
    b.reserveTextArena?.(10_000_000);

    const res = b.build();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_TOO_LARGE");
  });

  test("cap: oversized transient drawText fails with ZRDL_TOO_LARGE", () => {
    const b = createDrawlistBuilder({ maxDrawlistBytes: 128 });
    b.drawText(0, 0, "x".repeat(10_000));

    const res = b.build();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_TOO_LARGE");
  });
});

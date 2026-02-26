import { assert, describe, test } from "@rezi-ui/testkit";
import { align4 } from "../builderBase.js";

describe("drawlist align4", () => {
  test("rounds small non-negative values to 4-byte boundaries", () => {
    assert.equal(align4(0), 0);
    assert.equal(align4(1), 4);
    assert.equal(align4(2), 4);
    assert.equal(align4(3), 4);
    assert.equal(align4(4), 4);
    assert.equal(align4(5), 8);
  });

  test("does not overflow to signed int32 negatives near INT32_MAX", () => {
    assert.equal(align4(2147483644), 2147483644);
    assert.equal(align4(2147483645), 2147483648);
    assert.equal(align4(2147483646), 2147483648);
    assert.equal(align4(2147483647), 2147483648);
  });

  test("preserves legacy behavior for non-positive inputs", () => {
    assert.equal(align4(-3), 0);
    assert.equal(align4(-2), 0);
    assert.equal(align4(-1), 0);
    assert.equal(align4(-4), -4);
    assert.equal(align4(-5), -4);
  });
});

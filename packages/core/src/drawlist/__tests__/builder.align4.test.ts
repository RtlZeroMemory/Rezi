import { assert, describe, test } from "@rezi-ui/testkit";
import { align4 } from "../builderBase.js";

describe("align4", () => {
  test("aligns small values to 4-byte boundaries", () => {
    assert.equal(align4(0), 0);
    assert.equal(align4(1), 4);
    assert.equal(align4(2), 4);
    assert.equal(align4(3), 4);
    assert.equal(align4(4), 4);
    assert.equal(align4(5), 8);
  });

  test("does not overflow near INT32_MAX", () => {
    assert.equal(align4(2_147_483_644), 2_147_483_644);
    assert.equal(align4(2_147_483_645), 2_147_483_648);
    assert.equal(align4(2_147_483_646), 2_147_483_648);
    assert.equal(align4(2_147_483_647), 2_147_483_648);
  });
});

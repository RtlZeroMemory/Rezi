import { assert, describe, test } from "@rezi-ui/testkit";
import { distributeInteger } from "../engine/distributeInteger.js";

describe("distributeInteger", () => {
  test("distributes by fractional remainder then index", () => {
    assert.deepEqual(distributeInteger(100, [33, 33, 33]), [34, 33, 33]);
  });

  test("handles deterministic tie-break by lower index", () => {
    assert.deepEqual(distributeInteger(8, [1, 1, 1, 1, 1]), [2, 2, 2, 1, 1]);
  });

  test("ignores non-positive and non-finite weights", () => {
    assert.deepEqual(distributeInteger(10, [1, 0, -1, Number.NaN, 1]), [5, 0, 0, 0, 5]);
  });
});

import { assert, describe, test } from "@rezi-ui/testkit";
import { createSelector } from "../createSelector.js";

type State = { items: string[]; filter: string; count: number };

describe("createSelector", () => {
  test("computes derived value from single input", () => {
    const selectCount = createSelector(
      (s: State) => s.count,
      (count) => count * 2,
    );

    assert.equal(selectCount({ items: [], filter: "", count: 5 }), 10);
  });

  test("memoizes when inputs unchanged", () => {
    let computeCount = 0;

    const selectFiltered = createSelector(
      (s: State) => s.items,
      (s: State) => s.filter,
      (items, filter) => {
        computeCount++;
        return items.filter((item) => item.includes(filter));
      },
    );

    const state: State = { items: ["apple", "banana"], filter: "a", count: 0 };
    const r1 = selectFiltered(state);
    const r2 = selectFiltered(state);

    assert.strictEqual(r1, r2);
    assert.equal(computeCount, 1);
  });

  test("recomputes when input changes", () => {
    let computeCount = 0;

    const selectFiltered = createSelector(
      (s: State) => s.items,
      (s: State) => s.filter,
      (items, filter) => {
        computeCount++;
        return items.filter((item) => item.includes(filter));
      },
    );

    const s1: State = { items: ["apple", "banana"], filter: "a", count: 0 };
    const s2: State = { items: ["apple", "banana"], filter: "b", count: 0 };

    selectFiltered(s1);
    selectFiltered(s2);

    assert.equal(computeCount, 2);
  });

  test("does not recompute when unrelated state changes", () => {
    let computeCount = 0;
    const items = ["x", "y"];

    const selectFiltered = createSelector(
      (s: State) => s.items,
      (itms) => {
        computeCount++;
        return itms.length;
      },
    );

    selectFiltered({ items, filter: "", count: 0 });
    selectFiltered({ items, filter: "changed", count: 99 });

    assert.equal(computeCount, 1);
  });

  test("works with 3 input selectors", () => {
    const selectCombined = createSelector(
      (s: State) => s.items,
      (s: State) => s.filter,
      (s: State) => s.count,
      (items, filter, count) => ({
        filtered: items.filter((item) => item.includes(filter)),
        total: count,
      }),
    );

    const result = selectCombined({ items: ["ab", "cd"], filter: "a", count: 5 });
    assert.deepEqual(result, { filtered: ["ab"], total: 5 });
  });

  test("works with 4 input selectors", () => {
    type S = { a: number; b: number; c: number; d: number };

    const selectSum = createSelector(
      (s: S) => s.a,
      (s: S) => s.b,
      (s: S) => s.c,
      (s: S) => s.d,
      (a, b, c, d) => a + b + c + d,
    );

    assert.equal(selectSum({ a: 1, b: 2, c: 3, d: 4 }), 10);
  });

  test("custom equality function", () => {
    let computeCount = 0;

    const shallowArrayEqual = (a: unknown, b: unknown): boolean => {
      if (!Array.isArray(a) || !Array.isArray(b)) return Object.is(a, b);
      if (a.length !== b.length) return false;
      return a.every((v, i) => Object.is(v, b[i]));
    };

    const selectLen = createSelector(
      (s: State) => s.items,
      (items) => {
        computeCount++;
        return items.length;
      },
      shallowArrayEqual,
    );

    selectLen({ items: ["a", "b"], filter: "", count: 0 });
    selectLen({ items: ["a", "b"], filter: "", count: 0 }); // new array ref but same contents

    assert.equal(computeCount, 1);
  });
});

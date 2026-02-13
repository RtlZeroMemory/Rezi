import { assert, describe, test } from "@rezi-ui/testkit";
import {
  DEFAULT_DURATION,
  TOAST_HEIGHT,
  addToast,
  filterExpiredToasts,
  getToastX,
  getToastY,
  removeToast,
  updateToastProgress,
} from "../toast.js";
import type { Toast, ToastPosition } from "../types.js";

const TOP_POSITIONS: readonly ToastPosition[] = ["top-left", "top-center", "top-right"];
const BOTTOM_POSITIONS: readonly ToastPosition[] = ["bottom-left", "bottom-center", "bottom-right"];
const ALL_POSITIONS: readonly ToastPosition[] = [...TOP_POSITIONS, ...BOTTOM_POSITIONS];

function makeToast(id: string, overrides: Partial<Toast> = {}): Toast {
  return {
    id,
    message: id,
    type: "info",
    ...overrides,
  };
}

describe("toast helpers", () => {
  test("getToastY stacks downward for all top positions", () => {
    for (const position of TOP_POSITIONS) {
      assert.equal(getToastY(0, position, 40), 0);
      assert.equal(getToastY(2, position, 40), 2 * TOAST_HEIGHT);
    }
  });

  test("getToastY stacks upward for all bottom positions", () => {
    for (const position of BOTTOM_POSITIONS) {
      assert.equal(getToastY(0, position, 20), 20 - TOAST_HEIGHT);
      assert.equal(getToastY(1, position, 20), 20 - 2 * TOAST_HEIGHT);
    }
  });

  test("getToastY handles invalid indices and clamps to container bounds", () => {
    assert.equal(getToastY(-1, "top-left", 20), 0);
    assert.equal(getToastY(Number.NaN, "top-left", 20), 0);
    assert.equal(getToastY(Number.POSITIVE_INFINITY, "bottom-right", 20), 0);
    assert.equal(getToastY(3, "bottom-left", 8), 0);
  });

  test("getToastX resolves left, center, and right offsets for all positions", () => {
    for (const position of ALL_POSITIONS) {
      const x = getToastX(position, 30, 10);
      if (position.endsWith("left")) assert.equal(x, 0);
      if (position.endsWith("center")) assert.equal(x, 10);
      if (position.endsWith("right")) assert.equal(x, 20);
    }
  });

  test("getToastX clamps center and right offsets when toast is wider than container", () => {
    assert.equal(getToastX("top-center", 8, 12), 0);
    assert.equal(getToastX("bottom-right", 8, 12), 0);
  });

  test("getToastX floors centered positions for odd differences", () => {
    assert.equal(getToastX("bottom-center", 31, 10), 10);
  });

  test("filterExpiredToasts applies deterministic expiration math", () => {
    const now = 10_000;
    const toasts: readonly Toast[] = [
      makeToast("expired-custom", { duration: 1_000 }),
      makeToast("fresh-custom", { duration: 1_000 }),
      makeToast("expired-default"),
      makeToast("fresh-default"),
      makeToast("persistent", { duration: 0 }),
      makeToast("missing-created", { duration: 1 }),
      makeToast("future-created", { duration: 1_000 }),
    ];

    const createdAt = new Map<string, number>([
      ["expired-custom", 9_000],
      ["fresh-custom", 9_001],
      ["expired-default", now - DEFAULT_DURATION],
      ["fresh-default", now - DEFAULT_DURATION + 1],
      ["persistent", 0],
      ["future-created", 11_000],
    ]);

    const result = filterExpiredToasts(toasts, now, createdAt);
    assert.deepEqual(
      result.map((toast) => toast.id),
      ["fresh-custom", "fresh-default", "persistent", "missing-created", "future-created"],
    );
    assert.equal(Object.isFrozen(result), true);
  });

  test("addToast prepends new toast and removes existing duplicates by id", () => {
    const a0 = makeToast("a", { message: "old-a-0" });
    const b = makeToast("b");
    const a1 = makeToast("a", { message: "old-a-1" });
    const incoming = makeToast("a", { message: "new-a", type: "success" });

    const source: readonly Toast[] = [a0, b, a1];
    const result = addToast(source, incoming);

    assert.deepEqual(
      result.map((toast) => ({ id: toast.id, message: toast.message })),
      [
        { id: "a", message: "new-a" },
        { id: "b", message: "b" },
      ],
    );
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(
      source.map((toast) => ({ id: toast.id, message: toast.message })),
      [
        { id: "a", message: "old-a-0" },
        { id: "b", message: "b" },
        { id: "a", message: "old-a-1" },
      ],
    );
  });

  test("removeToast removes all matching ids and keeps missing-id removals as no-op", () => {
    const a0 = makeToast("a");
    const b = makeToast("b");
    const a1 = makeToast("a", { message: "again-a" });
    const source: readonly Toast[] = [a0, b, a1];

    const removed = removeToast(source, "a");
    assert.deepEqual(
      removed.map((toast) => toast.id),
      ["b"],
    );
    assert.equal(Object.isFrozen(removed), true);

    const missing = removeToast(source, "missing");
    assert.deepEqual(missing, source);
    assert.notEqual(missing, source);
  });

  test("updateToastProgress clips progress and updates all matching ids", () => {
    const source: readonly Toast[] = [
      makeToast("a", { progress: 10 }),
      makeToast("b", { progress: 30 }),
      makeToast("a", { progress: 90 }),
    ];

    const high = updateToastProgress(source, "a", 150);
    assert.deepEqual(
      high.map((toast) => toast.progress),
      [100, 30, 100],
    );

    const low = updateToastProgress(source, "a", -5);
    assert.deepEqual(
      low.map((toast) => toast.progress),
      [0, 30, 0],
    );

    const exact = updateToastProgress(source, "a", 42.5);
    assert.deepEqual(
      exact.map((toast) => toast.progress),
      [42.5, 30, 42.5],
    );
    assert.equal(Object.isFrozen(exact), true);
  });

  test("updateToastProgress is a no-op for missing ids and preserves NaN behavior", () => {
    const source: readonly Toast[] = [makeToast("a", { progress: 10 }), makeToast("b")];

    const missing = updateToastProgress(source, "missing", 75);
    assert.deepEqual(missing, source);
    assert.notEqual(missing, source);
    assert.equal(missing[0], source[0]);
    assert.equal(missing[1], source[1]);

    const nan = updateToastProgress(source, "a", Number.NaN);
    assert.equal(Number.isNaN(nan[0]?.progress), true);
  });
});

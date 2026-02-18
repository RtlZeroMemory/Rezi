import { assert, describe, test } from "@rezi-ui/testkit";
import {
  DEFAULT_DURATION,
  addToast,
  filterExpiredToasts,
  getToastActionFocusId,
  getToastX,
  getToastY,
  getVisibleToasts,
  parseToastActionFocusId,
  removeToast,
  updateToastProgress,
} from "../toast.js";
import type { Toast } from "../types.js";

function toast(id: string, overrides: Partial<Toast> = {}): Toast {
  return {
    id,
    type: "info",
    message: id,
    ...overrides,
  };
}

describe("toast.lifecycle - visibility and ordering", () => {
  test("getVisibleToasts defaults to max visible cap", () => {
    const all = [toast("a"), toast("b"), toast("c"), toast("d"), toast("e"), toast("f")];
    assert.deepEqual(
      getVisibleToasts(all).map((t) => t.id),
      ["a", "b", "c", "d", "e"],
    );
  });

  test("getVisibleToasts respects explicit maxVisible", () => {
    const all = [toast("a"), toast("b"), toast("c")];
    assert.deepEqual(
      getVisibleToasts(all, 2).map((t) => t.id),
      ["a", "b"],
    );
    assert.deepEqual(getVisibleToasts(all, 0), []);
  });

  test("addToast prepends and deduplicates by id", () => {
    const current = [toast("a"), toast("b"), toast("a", { message: "old" })];
    const next = addToast(current, toast("a", { message: "new", type: "success" }));

    assert.deepEqual(
      next.map((t) => [t.id, t.message]),
      [
        ["a", "new"],
        ["b", "b"],
      ],
    );
  });

  test("removeToast drops all matching ids", () => {
    const current = [toast("a"), toast("b"), toast("a", { message: "again" })];
    const next = removeToast(current, "a");
    assert.deepEqual(
      next.map((t) => t.id),
      ["b"],
    );
  });
});

describe("toast.lifecycle - duration and expiry", () => {
  test("default duration expires at strict boundary", () => {
    const now = 10_000;
    const createdAt = new Map<string, number>([["t", now - DEFAULT_DURATION]]);

    const result = filterExpiredToasts([toast("t")], now, createdAt);
    assert.deepEqual(result, []);
  });

  test("persistent toast with duration=0 never expires", () => {
    const now = 10_000;
    const createdAt = new Map<string, number>([["t", 0]]);

    const result = filterExpiredToasts([toast("t", { duration: 0 })], now, createdAt);
    assert.deepEqual(
      result.map((t) => t.id),
      ["t"],
    );
  });

  test("missing createdAt timestamps are treated as visible", () => {
    const result = filterExpiredToasts([toast("missing", { duration: 1 })], 99_999, new Map());
    assert.deepEqual(
      result.map((t) => t.id),
      ["missing"],
    );
  });

  test("updateToastProgress clamps to [0,100]", () => {
    const current = [toast("a", { progress: 10 }), toast("b", { progress: 50 })];
    const high = updateToastProgress(current, "a", 500);
    const low = updateToastProgress(current, "b", -5);

    assert.equal(high[0]?.progress, 100);
    assert.equal(low[1]?.progress, 0);
  });
});

describe("toast.lifecycle - positioning and action ids", () => {
  test("getToastY stacks top and bottom variants deterministically", () => {
    assert.equal(getToastY(0, "top-left", 30), 0);
    assert.equal(getToastY(2, "top-right", 30), 6);
    assert.equal(getToastY(0, "bottom-left", 30), 27);
    assert.equal(getToastY(2, "bottom-right", 30), 21);
  });

  test("getToastX computes left/center/right offsets", () => {
    assert.equal(getToastX("top-left", 40, 12), 0);
    assert.equal(getToastX("top-center", 40, 12), 14);
    assert.equal(getToastX("bottom-right", 40, 12), 28);
  });

  test("toast action focus ids round-trip reliably", () => {
    const id = getToastActionFocusId("toast-42");
    assert.equal(parseToastActionFocusId(id), "toast-42");
    assert.equal(parseToastActionFocusId("not-a-toast-focus-id"), null);
    assert.equal(parseToastActionFocusId(getToastActionFocusId("")), null);
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { expr } from "../../constraints/expr.js";
import {
  conditionalConstraints,
  groupConstraints,
  heightConstraints,
  spaceConstraints,
  visibilityConstraints,
  widthConstraints,
} from "../../constraints/helpers.js";

describe("constraint helpers", () => {
  test("creates viewport threshold display constraints", () => {
    assert.equal(visibilityConstraints.viewportWidthAtLeast(80).source, "viewport.w >= 80");
    assert.equal(visibilityConstraints.viewportWidthBelow(80).source, "viewport.w < 80");
    assert.equal(visibilityConstraints.viewportHeightAtLeast(24).source, "viewport.h >= 24");
    assert.equal(visibilityConstraints.viewportHeightBelow(24).source, "viewport.h < 24");
    assert.equal(
      visibilityConstraints.viewportAtLeast({ width: 80, height: 40 }).source,
      "if(viewport.w >= 80, viewport.h >= 40, 0)",
    );
  });

  test("creates clamped percent-of-parent sizing constraints", () => {
    const c = widthConstraints.clampedPercentOfParent({ ratio: 0.25, min: 20, max: 50 });
    assert.equal(c.source, "clamp(20, parent.w * 0.25, 50)");
  });

  test("creates viewport-derived sizing constraints", () => {
    assert.equal(widthConstraints.percentOfViewport(0.62).source, "viewport.w * 0.62");
    assert.equal(
      widthConstraints.clampedViewportMinus({ minus: 4, min: 20, max: 140 }).source,
      "clamp(20, viewport.w - 4, 140)",
    );
    assert.equal(
      widthConstraints.minViewportPercent({ ratio: 0.34, min: 56 }).source,
      "max(56, viewport.w * 0.34)",
    );
    assert.equal(
      widthConstraints.stepsByViewportWidth({
        steps: [
          { below: 80, value: 10 },
          { below: 120, value: 20 },
          { below: 160, value: 30 },
        ],
      }).source,
      "steps(viewport.w, 80: 10, 120: 20, 160: 30)",
    );

    assert.equal(heightConstraints.percentOfViewport(0.34).source, "viewport.h * 0.34");
    assert.equal(
      heightConstraints.minViewportPercent({ ratio: 0.34, min: 12 }).source,
      "max(12, viewport.h * 0.34)",
    );
    assert.equal(
      heightConstraints.stepsByViewportHeight({
        steps: [
          { below: 22, value: 0 },
          { below: 34, value: 1 },
        ],
      }).source,
      "steps(viewport.h, 22: 0, 34: 1)",
    );
    assert.equal(
      heightConstraints.clampedPercentOfViewport({ ratio: 0.34, min: 12, max: 22 }).source,
      "clamp(12, viewport.h * 0.34, 22)",
    );
    assert.equal(
      heightConstraints.clampedViewportMinus({ minus: 4, min: 8, max: 40 }).source,
      "clamp(8, viewport.h - 4, 40)",
    );
  });

  test("creates intrinsic-aware sizing constraints", () => {
    const c = widthConstraints.clampedIntrinsicPlus({ pad: 4, min: 18, max: "parent" });
    assert.equal(c.source, "clamp(18, intrinsic.w + 4, parent.w)");
  });

  test("wraps sibling aggregations with semantic helpers", () => {
    assert.equal(groupConstraints.maxSiblingMinWidth("item").source, "max_sibling(#item.min_w)");
    assert.equal(groupConstraints.maxSiblingMinHeight("item").source, "max_sibling(#item.min_h)");
    assert.equal(groupConstraints.sumSiblingWidth("item").source, "sum_sibling(#item.w)");
    assert.equal(groupConstraints.sumSiblingHeight("item").source, "sum_sibling(#item.h)");
  });

  test("creates remaining space constraints with optional aggregation", () => {
    const c = spaceConstraints.remainingWidth({
      subtract: [{ id: "sidebar" }, { id: "items", aggregation: "sum" }],
      minus: 2,
    });
    assert.equal(c.source, "max(0, parent.w - #sidebar.w - sum_sibling(#items.w) - 2)");
  });

  test("composes constraints via explicit conditional intent wrapper", () => {
    const cond = visibilityConstraints.viewportWidthAtLeast(110);
    const out = conditionalConstraints.ifThenElse(cond, 28, expr("clamp(20, parent.w * 0.25, 50)"));
    assert.equal(out.source, "if((viewport.w >= 110), 28, (clamp(20, parent.w * 0.25, 50)))");
  });

  test("formats small numbers without exponent notation", () => {
    const out = conditionalConstraints.ifThenElse(1, 1e-7, 0);
    assert.equal(out.source, "if(1, 0.0000001, 0)");
  });

  test("formats large numbers without exponent notation", () => {
    const out = conditionalConstraints.ifThenElse(1, 1e21, 0);
    assert.equal(out.source, "if(1, 1000000000000000000000, 0)");
  });

  test("rejects invalid widget IDs for #id references", () => {
    assert.throws(() => groupConstraints.maxSiblingWidth("bad id"), /must not contain whitespace/);
    assert.throws(() => groupConstraints.maxSiblingWidth("bad.id"), /must not contain "\."/);
  });

  test("rejects out-of-range viewport thresholds", () => {
    assert.throws(() => visibilityConstraints.viewportWidthAtLeast(-1), /must be >= 0/);
    assert.throws(() => visibilityConstraints.viewportWidthAtLeast(1.5), /must be an integer/);
    assert.throws(() => visibilityConstraints.viewportAtLeast({}), /must specify at least one/);
  });

  test("rejects inverted min/max bounds", () => {
    assert.throws(
      () => widthConstraints.clampedPercentOfParent({ ratio: 0.5, min: 10, max: 5 }),
      /min must be <= max/,
    );
  });
});

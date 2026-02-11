import { assert, describe, test } from "@rezi-ui/testkit";
import {
  ResizeObserver,
  getBoundingBox,
  getScrollHeight,
  render,
  type RenderOptions,
} from "../index.js";

describe("api surface", () => {
  test("exports measurement and observer APIs", () => {
    assert.equal(typeof getBoundingBox, "function");
    assert.equal(typeof getScrollHeight, "function");
    assert.equal(typeof ResizeObserver, "function");
  });

  test("RenderOptions includes Ink-like parity fields", () => {
    const opts: RenderOptions = {
      onRender: (metrics) => {
        assert.ok(metrics.renderTime >= 0);
      },
      isScreenReaderEnabled: true,
      alternateBuffer: true,
      incrementalRendering: true,
    };

    assert.equal(opts.isScreenReaderEnabled, true);
    assert.equal(typeof render, "function");
  });
});

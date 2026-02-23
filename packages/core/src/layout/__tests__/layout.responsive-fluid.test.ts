import { assert, describe, test } from "@rezi-ui/testkit";
import { fluid, ui } from "../../index.js";
import { layout } from "../layout.js";
import {
  getResponsiveViewport,
  resolveResponsiveValue,
  setResponsiveViewport,
} from "../responsive.js";

function withViewport(width: number, height: number, run: () => void): void {
  const prev = getResponsiveViewport();
  setResponsiveViewport(width, height);
  try {
    run();
  } finally {
    setResponsiveViewport(prev.width, prev.height);
  }
}

describe("layout responsive fluid values", () => {
  test("fluid() interpolates between sm and lg thresholds", () => {
    const spec = fluid(20, 40);
    withViewport(79, 24, () => {
      assert.equal(resolveResponsiveValue(spec), 20);
    });
    withViewport(119, 24, () => {
      assert.equal(resolveResponsiveValue(spec), 30);
    });
    withViewport(159, 24, () => {
      assert.equal(resolveResponsiveValue(spec), 40);
    });
    withViewport(220, 24, () => {
      assert.equal(resolveResponsiveValue(spec), 40);
    });
  });

  test("responsive map values can contain fluid()", () => {
    const value = { sm: 12, md: fluid(20, 40), lg: 50 };
    withViewport(79, 24, () => {
      assert.equal(resolveResponsiveValue(value), 12);
    });
    withViewport(119, 24, () => {
      assert.equal(resolveResponsiveValue(value), 30);
    });
  });

  test("nested responsive maps recurse and resolve fluid leaves", () => {
    const value = {
      sm: { sm: 8, md: fluid(10, 20), lg: 22 },
      md: { sm: 12, md: fluid(30, 50), lg: 60 },
      lg: 70,
    };
    withViewport(79, 24, () => {
      assert.equal(resolveResponsiveValue(value), 8);
    });
    withViewport(119, 24, () => {
      assert.equal(resolveResponsiveValue(value), 40);
    });
    withViewport(159, 24, () => {
      assert.equal(resolveResponsiveValue(value), 70);
    });
  });

  test("layout resolves fluid width in widget props", () => {
    withViewport(119, 24, () => {
      const tree = ui.box({ border: "none", width: fluid(20, 40), height: 2 }, []);
      const res = layout(tree, 0, 0, 200, 24, "row");
      assert.ok(res.ok);
      if (!res.ok) return;
      assert.equal(res.value.rect.w, 30);
      assert.equal(res.value.rect.h, 2);
    });
  });
});

import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { createTestRenderer } from "../../testing/renderer.js";
import { measure } from "../layout.js";

type Axis = "row" | "column";

function expectLegacyFatal(
  node: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  detailPattern: RegExp,
): void {
  const renderer = createTestRenderer({ viewport: { cols: maxW, rows: maxH } });
  assert.throws(
    () => renderer.render(node),
    (error) =>
      error instanceof Error &&
      error.message.includes("ZRUI_INVALID_PROPS") &&
      detailPattern.test(error.message),
  );

  const measureRes = measure(node, maxW, maxH, axis);
  assert.equal(measureRes.ok, false);
  if (measureRes.ok) return;
  assert.equal(measureRes.fatal.code, "ZRUI_INVALID_PROPS");
  assert.match(measureRes.fatal.detail, detailPattern);
}

describe("layout legacy size constraints are rejected", () => {
  test("rejects percentage width strings", () => {
    const node = ui.row({ width: "full", height: 10 }, [
      ui.box({ border: "none", width: "50%" as unknown as never }, [ui.text("x")]),
    ]);
    expectLegacyFatal(node, 40, 10, "row", /percentage strings are removed/i);
  });

  test("rejects percentage maxWidth on text", () => {
    const node = ui.column({ width: "full", height: 10 }, [
      ui.text("hello", { maxWidth: "75%" as unknown as never }),
    ]);
    expectLegacyFatal(node, 40, 10, "column", /percentage strings are removed/i);
  });

  test("rejects responsive map width objects", () => {
    const node = ui.row({ width: "full", height: 10 }, [
      ui.box(
        {
          border: "none",
          width: { sm: 10, md: 20, lg: 30, xl: 40 } as unknown as never,
        },
        [],
      ),
    ]);
    expectLegacyFatal(node, 40, 10, "row", /responsive maps are removed/i);
  });

  test("rejects responsive map flexBasis objects", () => {
    const node = ui.row({ width: "full", height: 10 }, [
      ui.box(
        {
          border: "none",
          flex: 1,
          flexBasis: { sm: 4, md: 8, lg: 12, xl: 16 } as unknown as never,
        },
        [],
      ),
    ]);
    expectLegacyFatal(node, 40, 10, "row", /responsive maps are removed/i);
  });
});

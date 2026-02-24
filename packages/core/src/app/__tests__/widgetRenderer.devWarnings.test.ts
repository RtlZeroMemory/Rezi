import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { type LayoutTree, layout } from "../../layout/layout.js";
import type { VNode } from "../../widgets/types.js";
import { emitDevLayoutWarnings } from "../widgetRenderer/devWarnings.js";

// Intentional test-only exception: emitDevLayoutWarnings requires a LayoutTree,
// and TestRenderer/createTestRenderer currently expose rendered output/rects, not
// the internal tree. We call layout() directly through layoutOrThrow() here until
// LayoutTree access is added to TestRenderer in a future API change.
function layoutOrThrow(vnode: VNode): LayoutTree {
  const result = layout(vnode, 0, 0, 80, 24, "column");
  if (!result.ok) {
    assert.fail(`layout failed: ${result.fatal.code}: ${result.fatal.detail}`);
  }
  return result.value;
}

function collectWarnings(root: LayoutTree): readonly string[] {
  const warnings: string[] = [];
  emitDevLayoutWarnings(
    {
      devMode: true,
      warnedLayoutIssues: new Set<string>(),
      warn: (message) => warnings.push(message),
      pooledLayoutStack: [],
    },
    root,
    { cols: 80, rows: 24 },
  );
  return warnings;
}

describe("widget renderer dev layout warnings", () => {
  test("uses drawable-specific warning for zero-size drawable nodes", () => {
    const tree = ui.column({ id: "root" }, [
      ui.canvas({
        id: "reactor-canvas",
        width: 12,
        height: 0,
        draw: () => {},
      }),
    ]);
    const warnings = collectWarnings(layoutOrThrow(tree));
    assert.equal(
      warnings.some(
        (warning) =>
          warning.includes("[rezi][layout]") &&
          warning.includes("canvas#reactor-canvas") &&
          warning.includes("never draw"),
      ),
      true,
    );
  });

  test("keeps generic zero-size warning for non-drawable nodes", () => {
    const tree = ui.column({ id: "root", gap: 0 }, [
      ui.box({ id: "zero-box", border: "none", width: 0 }, [ui.text("hidden")]),
    ]);
    const warnings = collectWarnings(layoutOrThrow(tree));
    assert.equal(
      warnings.some(
        (warning) =>
          warning.includes("[rezi][layout]") &&
          warning.includes("box#zero-box") &&
          warning.includes("may be invisible"),
      ),
      true,
    );
  });
});

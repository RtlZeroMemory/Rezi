import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { __resetLayoutConstraintWarningsForTest } from "../engine/layoutEngine.js";
import { layout, measure } from "../layout.js";

function captureWarnings(run: () => void): readonly string[] {
  const warnings: string[] = [];
  const consoleWithWarn = globalThis.console as {
    warn: ((message?: unknown) => void) | undefined;
  };
  const originalWarn = consoleWithWarn.warn;
  consoleWithWarn.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    run();
  } finally {
    consoleWithWarn.warn = originalWarn;
  }
  return Object.freeze(warnings);
}

describe("layout unsupported child-constraint warnings", () => {
  test("warns once when non-constraint widgets receive flex/grid child constraints", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.row({ width: 20, height: 3 }, [
      ui.button({ id: "save", label: "Save", flex: 1 } as unknown as never),
    ]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "row");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "row");
      assert.equal(laidOut.ok, true);
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /button ignores flex/i);
  });

  test("does not warn for supported child-constraint kinds", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.row({ width: 20, height: 3 }, [ui.box({ border: "none", flex: 1 }, [])]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "row");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "row");
      assert.equal(laidOut.ok, true);
    });

    assert.deepEqual(warnings, []);
  });
});

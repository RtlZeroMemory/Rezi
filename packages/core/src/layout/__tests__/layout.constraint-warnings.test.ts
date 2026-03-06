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

  test("warns when absolute positioning is used under unsupported parents", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.grid({ columns: 1 }, [
      ui.box({ border: "none", position: "absolute", left: 2, top: 0, width: 4, height: 1 }, []),
    ]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "column");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "column");
      assert.equal(laidOut.ok, true);
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /absolute positioning is only honored/i);
  });

  test("does not warn when absolute positioning is used under row children", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.row({ width: 20, height: 3 }, [
      ui.box({ border: "none", position: "absolute", left: 2, top: 0, width: 4, height: 1 }, []),
    ]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "row");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "row");
      assert.equal(laidOut.ok, true);
    });

    assert.deepEqual(warnings, []);
  });

  test("does not treat unrelated left/right props as absolute positioning", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.grid({ columns: 1 }, [
      ui.button({ id: "save", label: "Save", left: [ui.text("left")] } as unknown as never),
    ]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "column");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "column");
      assert.equal(laidOut.ok, true);
    });

    assert.deepEqual(warnings, []);
  });

  test("does not warn when spacer uses flex", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.row({ width: 20, height: 3 }, [ui.spacer({ flex: 1 })]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "row");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "row");
      assert.equal(laidOut.ok, true);
    });

    assert.deepEqual(warnings, []);
  });

  test("warns when spacer receives unsupported child constraints", () => {
    __resetLayoutConstraintWarningsForTest();
    const vnode = ui.row({ width: 20, height: 3 }, [
      ui.spacer({ flex: 1, gridColumn: 2 } as unknown as never),
    ]);

    const warnings = captureWarnings(() => {
      const measured = measure(vnode, 20, 3, "row");
      assert.equal(measured.ok, true);
      const laidOut = layout(vnode, 0, 0, 20, 3, "row");
      assert.equal(laidOut.ok, true);
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /spacer ignores gridColumn/i);
  });
});

import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { measureMaxContent, measureMinContent } from "../engine/intrinsic.js";
import { measure } from "../layout.js";

describe("layout intrinsic sizing with absolute children", () => {
  test("box intrinsic sizing ignores absolute children the same way normal measure does", () => {
    const vnode = ui.box({ border: "none" }, [
      ui.box({ border: "none", position: "absolute", left: 0, top: 0 }, [ui.text("abcdefghij")]),
    ]);

    const measured = measure(vnode, 40, 10, "column");
    assert.equal(measured.ok, true);
    if (!measured.ok) return;

    const minContent = measureMinContent(vnode, "column", measure);
    assert.equal(minContent.ok, true);
    if (!minContent.ok) return;

    const maxContent = measureMaxContent(vnode, "column", measure);
    assert.equal(maxContent.ok, true);
    if (!maxContent.ok) return;

    assert.deepEqual(measured.value, { w: 0, h: 0 });
    assert.deepEqual(minContent.value, measured.value);
    assert.deepEqual(maxContent.value, measured.value);
  });
});

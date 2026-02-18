import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveIconGlyph } from "../../icons/resolveGlyph.js";
import { ui } from "../../widgets/ui.js";
import { measure } from "../layout.js";

function mustMeasureIcon(iconPath: string) {
  const vnode = ui.icon(iconPath);
  const measured = measure(vnode, 80, 1, "row");
  assert.equal(measured.ok, true, "icon measure should succeed");
  if (!measured.ok) {
    assert.fail("icon measure should succeed");
  }
  return measured.value.w;
}

describe("layout icon measurement", () => {
  test("uses resolved glyph width for stable unicode icons", () => {
    const expected = resolveIconGlyph("status.check").width;
    assert.equal(mustMeasureIcon("status.check"), expected);
  });

  test("uses fallback width for risky emoji-like icons", () => {
    const expected = resolveIconGlyph("ui.pause").width;
    assert.equal(resolveIconGlyph("ui.pause").source, "fallback");
    assert.equal(mustMeasureIcon("ui.pause"), expected);
  });
});

import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveIconGlyph } from "../resolveGlyph.js";

describe("icons.resolveIconGlyph", () => {
  test("keeps stable unicode glyphs", () => {
    const resolved = resolveIconGlyph("status.check");
    assert.equal(resolved.glyph, "✓");
    assert.equal(resolved.width, 1);
    assert.equal(resolved.source, "primary");
  });

  test("downgrades risky emoji-like glyphs to fallback", () => {
    const resolved = resolveIconGlyph("ui.pause");
    assert.equal(resolved.glyph, "||");
    assert.equal(resolved.width, 2);
    assert.equal(resolved.source, "fallback");
  });

  test("returns path text for unknown icon keys", () => {
    const resolved = resolveIconGlyph("unknown.icon");
    assert.equal(resolved.glyph, "unknown.icon");
    assert.ok(resolved.width > 0);
    assert.equal(resolved.source, "path");
  });
});

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { buildWidgetSnippet, extractBannerFromSnippet } from "../hsr/widget-code-snippet.mjs";
import { DEFAULT_SELF_EDIT_BANNER } from "../hsr/widget-view-self-edit.mjs";

describe("widget code snippet helper", () => {
  test("buildWidgetSnippet emits TypeScript-like snippet with declaration", () => {
    const snippet = buildWidgetSnippet('say "REZO" now');
    assert.match(snippet, /import \{ ui \} from "@rezi-ui\/core";/);
    assert.match(snippet, /export const SELF_EDIT_BANNER = "say \\"REZO\\" now";/);
    assert.match(snippet, /export function renderHeroTitle\(\)/);
  });

  test("extractBannerFromSnippet reads double-quoted declaration", () => {
    const source = [
      "const x = 1;",
      'export const SELF_EDIT_BANNER = "Alpha Banner";',
      "const y = 2;",
    ].join("\n");
    assert.equal(extractBannerFromSnippet(source, "fallback"), "Alpha Banner");
  });

  test("extractBannerFromSnippet reads single-quoted declaration", () => {
    const source = "export const SELF_EDIT_BANNER = 'Beta Banner';";
    assert.equal(extractBannerFromSnippet(source, "fallback"), "Beta Banner");
  });

  test("extractBannerFromSnippet reads backtick declaration", () => {
    const source = "export const SELF_EDIT_BANNER = `Gamma Banner`;";
    assert.equal(extractBannerFromSnippet(source, "fallback"), "Gamma Banner");
  });

  test("extractBannerFromSnippet unescapes escaped literals", () => {
    const source = 'export const SELF_EDIT_BANNER = "Line\\nBreak and \\"quote\\"";';
    assert.equal(extractBannerFromSnippet(source, "fallback"), 'Line Break and "quote"');
  });

  test("extractBannerFromSnippet falls back when declaration is missing", () => {
    const source = "export const OTHER = 'x';";
    assert.equal(extractBannerFromSnippet(source, "  fallback banner "), "fallback banner");
  });

  test("extractBannerFromSnippet sanitizes control characters and clamps long values", () => {
    const long = `one\u0000two\n${"x".repeat(120)}`;
    const source = `export const SELF_EDIT_BANNER = ${JSON.stringify(long)};`;
    const out = extractBannerFromSnippet(source, "fallback");
    assert.equal(out.includes("\u0000"), false);
    assert.equal(out.includes("\n"), false);
    assert.equal(out.length <= 60, true);
  });

  test("extractBannerFromSnippet uses project default when fallback is empty", () => {
    assert.equal(extractBannerFromSnippet("const nope = true;", ""), DEFAULT_SELF_EDIT_BANNER);
  });
});

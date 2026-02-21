import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { tokenizeCodeLine } from "../hsr/widget-code-highlighting.mjs";

function findToken(tokens, text) {
  return tokens.find((token) => token.text === text) ?? null;
}

describe("widget code highlighting helper", () => {
  test("tokenizeCodeLine classifies keywords, identifiers, strings, and comments", () => {
    const tokens = tokenizeCodeLine('export const SELF_EDIT_BANNER = "REZO"; // note');
    assert.equal(Array.isArray(tokens), true);
    assert.equal(Object.isFrozen(tokens), true);

    assert.equal(findToken(tokens, "export")?.tone, "keyword");
    assert.equal(findToken(tokens, "const")?.tone, "keyword");
    assert.equal(findToken(tokens, "SELF_EDIT_BANNER")?.tone, "identifier");
    assert.equal(findToken(tokens, '"REZO"')?.tone, "string");
    assert.equal(tokens[tokens.length - 1]?.tone, "comment");
    assert.equal(tokens[tokens.length - 1]?.text, "// note");
  });

  test("tokenizeCodeLine marks function calls and numeric literals", () => {
    const tokens = tokenizeCodeLine("renderHeroTitle(1_024, ui);");
    assert.equal(findToken(tokens, "renderHeroTitle")?.tone, "call");
    assert.equal(findToken(tokens, "1_024")?.tone, "number");
    assert.equal(findToken(tokens, "(")?.tone, "punct");
    assert.equal(findToken(tokens, ")")?.tone, "punct");
  });

  test("tokenizeCodeLine keeps escaped strings in a single token", () => {
    const tokens = tokenizeCodeLine('const message = "say \\"REZO\\" now";');
    assert.equal(findToken(tokens, "const")?.tone, "keyword");
    assert.equal(findToken(tokens, '"say \\"REZO\\" now"')?.tone, "string");
  });

  test("tokenizeCodeLine is deterministic for invalid input", () => {
    assert.deepEqual(tokenizeCodeLine(undefined), []);
    assert.deepEqual(tokenizeCodeLine(null), []);
  });
});

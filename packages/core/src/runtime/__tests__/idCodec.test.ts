import { decodeIdSegment, encodeIdSegment, makeCompoundId, parseCompoundId } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";

describe("idCodec", () => {
  test("decodeIdSegment(encodeIdSegment(s)) round-trips common values", () => {
    const samples = [
      "plain",
      "with spaces",
      "path/segment",
      "key:value",
      "unicode-\u03c0-\u6f22\u5b57",
    ];
    for (const sample of samples) {
      const decoded = decodeIdSegment(encodeIdSegment(sample));
      assert.equal(decoded, sample);
    }
  });

  test("special characters are encoded and decoded safely", () => {
    const sample = "a b:c/d?x=1&y=2#z";
    const encoded = encodeIdSegment(sample);
    assert.equal(encoded.includes(":"), false);
    assert.equal(encoded.includes("/"), false);
    assert.equal(decodeIdSegment(encoded), sample);
  });

  test("decodeIdSegment returns null for empty string", () => {
    assert.equal(decodeIdSegment(""), null);
  });

  test("decodeIdSegment returns null for invalid encoding", () => {
    assert.equal(decodeIdSegment("%ZZ"), null);
  });

  test("makeCompoundId/parseCompoundId round-trip", () => {
    const id = makeCompoundId("__prefix__", "left/right", "item:1", "hello world");
    assert.deepEqual(parseCompoundId(id, "__prefix__", 3), ["left/right", "item:1", "hello world"]);
  });

  test("parseCompoundId returns null for wrong prefix", () => {
    const id = makeCompoundId("__right__", "a", "b");
    assert.equal(parseCompoundId(id, "__wrong__", 2), null);
  });

  test("parseCompoundId returns null for wrong segment count", () => {
    const id = makeCompoundId("__prefix__", "a", "b");
    assert.equal(parseCompoundId(id, "__prefix__", 1), null);
    assert.equal(parseCompoundId(id, "__prefix__", 3), null);
  });

  test("parseCompoundId returns null when any segment is empty", () => {
    const id = makeCompoundId("__prefix__", "a", "");
    assert.equal(parseCompoundId(id, "__prefix__", 2), null);
  });
});

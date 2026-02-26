import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder } from "../../index.js";

function countCalls(calls: readonly string[], value: string): number {
  let count = 0;
  for (const call of calls) {
    if (call === value) count++;
  }
  return count;
}

function withTextEncoderSpy<T>(
  run: (calls: Readonly<{ encode: readonly string[]; encodeInto: readonly string[] }>) => T,
): T {
  const OriginalTextEncoder = globalThis.TextEncoder;
  assert.equal(typeof OriginalTextEncoder, "function", "TextEncoder should exist in runtime");

  const encode: string[] = [];
  const encodeInto: string[] = [];

  class SpyTextEncoder {
    private readonly encoder = new OriginalTextEncoder();

    encode(input: string): Uint8Array {
      encode.push(input);
      return this.encoder.encode(input);
    }

    encodeInto(input: string, destination: Uint8Array): { read: number; written: number } {
      encodeInto.push(input);
      return this.encoder.encodeInto(input, destination);
    }
  }

  (globalThis as { TextEncoder: typeof TextEncoder }).TextEncoder =
    SpyTextEncoder as unknown as typeof TextEncoder;

  try {
    return run({ encode, encodeInto });
  } finally {
    (globalThis as { TextEncoder: typeof TextEncoder }).TextEncoder = OriginalTextEncoder;
  }
}

describe("drawlist encoded string cache + text arena counters", () => {
  test("cap=0 re-encodes persistent link strings every frame", () => {
    const uri = "https://example.com/dócş";
    const id = "dócş";

    withTextEncoderSpy((calls) => {
      const b = createDrawlistBuilder({ encodedStringCacheCap: 0 });

      for (let frame = 0; frame < 3; frame++) {
        b.reset();
        b.setLink(uri, id);
        b.drawText(0, frame, "x");
        const built = b.build();
        assert.equal(built.ok, true, `frame ${String(frame)} should build`);
      }

      assert.equal(countCalls(calls.encode, uri), 3, "uri should re-encode each frame");
      assert.equal(countCalls(calls.encode, id), 3, "id should re-encode each frame");
    });
  });

  test("cap>0 caches persistent link strings across frames", () => {
    const uri = "https://example.com/dócş";
    const id = "dócş";

    withTextEncoderSpy((calls) => {
      const b = createDrawlistBuilder({ encodedStringCacheCap: 8 });

      for (let frame = 0; frame < 3; frame++) {
        b.reset();
        b.setLink(uri, id);
        b.drawText(0, frame, "x");
        const built = b.build();
        assert.equal(built.ok, true, `frame ${String(frame)} should build`);
      }

      assert.equal(countCalls(calls.encode, uri), 1, "uri should encode once with cache");
      assert.equal(countCalls(calls.encode, id), 1, "id should encode once with cache");
    });
  });

  test("capacity=1 eviction clears old cached persistent strings", () => {
    const a = "https://example.com/á";
    const bText = "https://example.com/ß";

    withTextEncoderSpy((calls) => {
      const b = createDrawlistBuilder({ encodedStringCacheCap: 1 });

      b.setLink(a);
      b.drawText(0, 0, "a");
      assert.equal(b.build().ok, true);

      b.reset();
      b.setLink(bText);
      b.drawText(0, 0, "b");
      assert.equal(b.build().ok, true);

      b.reset();
      b.setLink(a);
      b.drawText(0, 0, "a");
      assert.equal(b.build().ok, true);

      assert.equal(countCalls(calls.encode, a), 2, "a should miss after eviction");
      assert.equal(countCalls(calls.encode, bText), 1, "b should encode once");
    });
  });

  test("within a frame duplicate setLink values encode once", () => {
    const uri = "https://example.com/óncé";

    withTextEncoderSpy((calls) => {
      const b = createDrawlistBuilder({ encodedStringCacheCap: 0 });
      b.setLink(uri);
      b.drawText(0, 0, "a");
      b.setLink(uri);
      b.drawText(0, 1, "b");

      const built = b.build();
      assert.equal(built.ok, true);
      assert.equal(countCalls(calls.encode, uri), 1, "intern map dedupes within frame");
    });
  });

  test("drawText path uses encodeInto and reports text arena counters", () => {
    withTextEncoderSpy((calls) => {
      const b = createDrawlistBuilder();
      b.drawText(0, 0, "A");
      b.drawText(0, 1, "");
      const blobIndex = b.addTextRunBlob([{ text: "BC" }, { text: "D" }]);
      assert.equal(blobIndex, 0);
      if (blobIndex === null) return;
      b.drawTextRun(0, 2, blobIndex);

      const built = b.build();
      assert.equal(built.ok, true);

      const counters = b.getTextPerfCounters?.();
      assert.ok(counters !== undefined, "counters should be available");
      if (!counters) return;

      assert.equal(counters.textSegments, 4, "2 drawText + 2 text-run segments");
      assert.equal(counters.textArenaBytes, 4, "A + BC + D");
      assert.equal(counters.textEncoderCalls >= 3, true, "non-empty segments encode at least once");
      assert.equal(calls.encodeInto.length >= 3, true, "encodeInto used for transient text");
    });
  });

  test("reset clears text arena counters", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "hello");
    assert.equal(b.build().ok, true);

    const before = b.getTextPerfCounters?.();
    assert.ok(before !== undefined);
    if (!before) return;
    assert.equal(before.textArenaBytes > 0, true);

    b.reset();
    const after = b.getTextPerfCounters?.();
    assert.ok(after !== undefined);
    if (!after) return;
    assert.equal(after.textArenaBytes, 0);
    assert.equal(after.textSegments, 0);
    assert.equal(after.textEncoderCalls, 0);
  });
});

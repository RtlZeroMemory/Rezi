import { assert, describe, test } from "@rezi-ui/testkit";
import { parseDrawTextCommands, parseInternedStrings } from "../../__tests__/drawlistDecode.js";
import { createDrawlistBuilder } from "../../index.js";

type BuildResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; error: Readonly<{ code: string; detail: string }> }>;

type BuilderLike = Readonly<{
  drawText(x: number, y: number, text: string, style?: unknown): void;
  build(): BuildResult;
  reset(): void;
}>;

type BuilderOpts = Readonly<{
  encodedStringCacheCap?: number;
}>;

const FACTORIES: readonly Readonly<{
  name: string;
  create(opts?: BuilderOpts): BuilderLike;
}>[] = [{ name: "current", create: (opts?: BuilderOpts) => createDrawlistBuilder(opts) }];

type DrawTextEntry = Readonly<{ stringId: number; byteLen: number }>;

function readDrawTextEntries(bytes: Uint8Array): DrawTextEntry[] {
  return parseDrawTextCommands(bytes).map((cmd) => ({
    stringId: cmd.stringId,
    byteLen: cmd.byteLen,
  }));
}

function buildOk(builder: BuilderLike, label: string): Uint8Array {
  const res = builder.build();
  if (!res.ok) {
    throw new Error(`${label}: build should succeed (${res.error.code}: ${res.error.detail})`);
  }
  return res.bytes;
}

function encodeCallCount(calls: readonly string[], value: string): number {
  let count = 0;
  for (const call of calls) {
    if (call === value) count++;
  }
  return count;
}

function withTextEncoderSpy<T>(run: (calls: string[]) => T): T {
  const OriginalTextEncoder = globalThis.TextEncoder;
  assert.equal(
    typeof OriginalTextEncoder,
    "function",
    "TextEncoder should exist in the test runtime",
  );

  const calls: string[] = [];
  class SpyTextEncoder {
    private readonly encoder = new OriginalTextEncoder();

    encode(input: string): Uint8Array {
      calls.push(input);
      return this.encoder.encode(input);
    }
  }

  (globalThis as { TextEncoder: typeof TextEncoder }).TextEncoder =
    SpyTextEncoder as unknown as typeof TextEncoder;

  try {
    return run(calls);
  } finally {
    (globalThis as { TextEncoder: typeof TextEncoder }).TextEncoder = OriginalTextEncoder;
  }
}

describe("drawlist encoded string cache", () => {
  test("cap=0 fallback re-encodes the same string every frame", () => {
    const text = "cache-é";
    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 0 });

        b.drawText(0, 0, text);
        buildOk(b, `${factory.name} frame 1`);
        b.reset();

        b.drawText(0, 0, text);
        buildOk(b, `${factory.name} frame 2`);
        b.reset();

        b.drawText(0, 0, text);
        buildOk(b, `${factory.name} frame 3`);

        assert.equal(
          encodeCallCount(calls, text),
          3,
          `${factory.name}: cap=0 should not cache encoded bytes`,
        );
      });
    }
  });

  test("cap>0 cache hit avoids re-encode across frames", () => {
    const text = "hit-é";
    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 8 });

        b.drawText(0, 0, text);
        buildOk(b, `${factory.name} frame 1`);
        b.reset();

        b.drawText(0, 0, text);
        buildOk(b, `${factory.name} frame 2`);
        b.reset();

        b.drawText(0, 0, text);
        buildOk(b, `${factory.name} frame 3`);

        assert.equal(
          encodeCallCount(calls, text),
          1,
          `${factory.name}: cached string should encode once`,
        );
      });
    }
  });

  test("cache hit still produces correct command byte_len and decoded string data", () => {
    const text = "roundtrip 😀 e\u0301 漢字";
    const expectedLen = new TextEncoder().encode(text).byteLength;

    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 4 });

        b.drawText(0, 0, text);
        const frame1 = buildOk(b, `${factory.name} frame 1`);
        b.reset();

        b.drawText(0, 0, text);
        const frame2 = buildOk(b, `${factory.name} frame 2`);

        const f1Entry = readDrawTextEntries(frame1)[0];
        const f2Entry = readDrawTextEntries(frame2)[0];

        assert.equal(f1Entry?.byteLen, expectedLen, `${factory.name}: frame1 byte_len`);
        assert.equal(f2Entry?.byteLen, expectedLen, `${factory.name}: frame2 byte_len`);
        assert.deepEqual(parseInternedStrings(frame1), [text], `${factory.name}: frame1 decode`);
        assert.deepEqual(parseInternedStrings(frame2), [text], `${factory.name}: frame2 decode`);
        assert.equal(encodeCallCount(calls, text), 1, `${factory.name}: one encode with hit`);
      });
    }
  });

  test("eviction at capacity=1 causes prior entry misses", () => {
    const a = "A-é";
    const bText = "B-é";

    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 1 });

        b.drawText(0, 0, a);
        buildOk(b, `${factory.name} frame A1`);
        b.reset();

        b.drawText(0, 0, bText);
        buildOk(b, `${factory.name} frame B`);
        b.reset();

        b.drawText(0, 0, a);
        buildOk(b, `${factory.name} frame A2`);

        assert.equal(encodeCallCount(calls, a), 2, `${factory.name}: A re-encoded after eviction`);
        assert.equal(encodeCallCount(calls, bText), 1, `${factory.name}: B encoded once`);
      });
    }
  });

  test("capacity=2 keeps existing entries until a third unique string is inserted", () => {
    const a = "a-é";
    const bText = "b-é";

    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 2 });

        b.drawText(0, 0, a);
        buildOk(b, `${factory.name} frame a`);
        b.reset();

        b.drawText(0, 0, bText);
        buildOk(b, `${factory.name} frame b`);
        b.reset();

        b.drawText(0, 0, a);
        buildOk(b, `${factory.name} frame a hit`);

        assert.equal(encodeCallCount(calls, a), 1, `${factory.name}: A should hit cache`);
        assert.equal(encodeCallCount(calls, bText), 1, `${factory.name}: B encoded once`);
      });
    }
  });

  test("capacity=2 insertion of third unique string clears cache and evicts old entries", () => {
    const a = "aa-é";
    const bText = "bb-é";
    const c = "cc-é";

    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 2 });

        b.drawText(0, 0, a);
        b.drawText(0, 1, bText);
        buildOk(b, `${factory.name} frame ab`);
        b.reset();

        b.drawText(0, 0, c);
        buildOk(b, `${factory.name} frame c`);
        b.reset();

        b.drawText(0, 0, bText);
        buildOk(b, `${factory.name} frame b again`);

        assert.equal(
          encodeCallCount(calls, a),
          1,
          `${factory.name}: A encoded only in first frame`,
        );
        assert.equal(encodeCallCount(calls, c), 1, `${factory.name}: C encoded once`);
        assert.equal(
          encodeCallCount(calls, bText),
          2,
          `${factory.name}: B should miss after clear`,
        );
      });
    }
  });

  test("post-eviction re-encode still emits correct UTF-8 bytes", () => {
    const a = "post-evict 😀 e\u0301";
    const bText = "other-é";
    const expectedLen = new TextEncoder().encode(a).byteLength;

    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 1 });

        b.drawText(0, 0, a);
        buildOk(b, `${factory.name} frame a1`);
        b.reset();

        b.drawText(0, 0, bText);
        buildOk(b, `${factory.name} frame b`);
        b.reset();

        b.drawText(0, 0, a);
        const frameA2 = buildOk(b, `${factory.name} frame a2`);

        assert.equal(encodeCallCount(calls, a), 2, `${factory.name}: A should be re-encoded`);
        assert.equal(
          readDrawTextEntries(frameA2)[0]?.byteLen,
          expectedLen,
          `${factory.name}: byte_len`,
        );
        assert.deepEqual(parseInternedStrings(frameA2), [a], `${factory.name}: decoded string`);
      });
    }
  });

  test("reset/new frame semantics: string index restarts at 0 even when cache hits", () => {
    const text = "index-reset-é";
    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 8 });

        b.drawText(0, 0, text);
        const frame1 = buildOk(b, `${factory.name} frame 1`);
        b.reset();

        b.drawText(0, 0, text);
        const frame2 = buildOk(b, `${factory.name} frame 2`);

        assert.equal(readDrawTextEntries(frame1)[0]?.stringId, 1, `${factory.name}: frame1 index`);
        assert.equal(readDrawTextEntries(frame2)[0]?.stringId, 1, `${factory.name}: frame2 index`);
        assert.equal(encodeCallCount(calls, text), 1, `${factory.name}: cache hit across frames`);
      });
    }
  });

  test("reset/new frame has no stale string table data", () => {
    const first = "first-é";
    const second = "second-é";

    for (const factory of FACTORIES) {
      const b = factory.create({ encodedStringCacheCap: 8 });

      b.drawText(0, 0, first);
      const frame1 = buildOk(b, `${factory.name} frame 1`);
      b.reset();

      b.drawText(0, 0, second);
      const frame2 = buildOk(b, `${factory.name} frame 2`);

      assert.deepEqual(parseInternedStrings(frame1), [first], `${factory.name}: frame1 strings`);
      assert.deepEqual(parseInternedStrings(frame2), [second], `${factory.name}: frame2 strings`);
    }
  });

  test("within a frame, duplicate strings dedupe independently of cache state", () => {
    const text = "intra-frame-é";
    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 0 });
        b.drawText(0, 0, text);
        b.drawText(0, 1, text);
        const frame = buildOk(b, `${factory.name} intra-frame`);

        const entries = readDrawTextEntries(frame);
        assert.equal(entries.length, 2, `${factory.name}: two drawText commands`);
        assert.equal(entries[0]?.stringId, 1, `${factory.name}: first id`);
        assert.equal(entries[1]?.stringId, 1, `${factory.name}: duplicate id`);
        assert.equal(encodeCallCount(calls, text), 1, `${factory.name}: one encode within frame`);
      });
    }
  });

  test("cap=0 fallback still preserves correct decoded output across frame changes", () => {
    const first = "cap0-first-é";
    const second = "cap0-second-é";

    for (const factory of FACTORIES) {
      withTextEncoderSpy((calls) => {
        const b = factory.create({ encodedStringCacheCap: 0 });

        b.drawText(0, 0, first);
        const frame1 = buildOk(b, `${factory.name} cap0 frame 1`);
        b.reset();

        b.drawText(0, 0, second);
        const frame2 = buildOk(b, `${factory.name} cap0 frame 2`);

        assert.deepEqual(parseInternedStrings(frame1), [first], `${factory.name}: frame1 decode`);
        assert.deepEqual(parseInternedStrings(frame2), [second], `${factory.name}: frame2 decode`);
        assert.equal(encodeCallCount(calls, first), 1, `${factory.name}: first encoded once`);
        assert.equal(encodeCallCount(calls, second), 1, `${factory.name}: second encoded once`);
      });
    }
  });
});

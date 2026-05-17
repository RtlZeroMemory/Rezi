import { assert, type Rng, chance, pick, randomInt, runFuzz, test } from "@rezi-ui/testkit";
import {
  clearTextMeasureCache,
  getTextMeasureCacheSize,
  measureTextCells,
  setTextMeasureEmojiPolicy,
  truncateMiddle,
  truncateStart,
  truncateWithEllipsis,
} from "../textMeasure.js";

const ASCII = "abcdefghijklmnopqrstuvwxyz0123456789 /_-";
const COMBINING = [0x0301, 0x0308, 0x20e3] as const;
const WIDE = [0x4e2d, 0x754c, 0xac00, 0x3000] as const;
const EMOJI = [0x1f600, 0x1f680, 0x1f469, 0x1f4bb] as const;

function appendCodePoint(out: string[], value: number): void {
  out.push(String.fromCodePoint(value));
}

function randomText(rng: Rng): string {
  const clusters = randomInt(rng, 0, 48);
  const out: string[] = [];

  for (let i = 0; i < clusters; i++) {
    const kind = randomInt(rng, 0, 9);
    if (kind <= 3) {
      out.push(ASCII[rng.u32() % ASCII.length] ?? "x");
      continue;
    }
    if (kind === 4) {
      appendCodePoint(out, pick(rng, COMBINING));
      continue;
    }
    if (kind === 5) {
      appendCodePoint(out, pick(rng, WIDE));
      continue;
    }
    if (kind === 6) {
      appendCodePoint(out, pick(rng, EMOJI));
      if (chance(rng, 45)) appendCodePoint(out, 0xfe0f);
      continue;
    }
    if (kind === 7) {
      appendCodePoint(out, 0x200d);
      appendCodePoint(out, pick(rng, EMOJI));
      continue;
    }
    if (kind === 8) {
      out.push(String.fromCharCode(randomInt(rng, 0xd800, 0xdbff)));
      continue;
    }
    out.push(String.fromCharCode(randomInt(rng, 0xdc00, 0xdfff)));
  }

  return out.join("");
}

function assertWidth(width: number, text: string): void {
  assert.equal(Number.isInteger(width), true);
  assert.equal(width >= 0, true);
  assert.equal(width <= Math.max(2, text.length * 2), true);
}

function assertTruncationFits(text: string, maxWidth: number, actual: string): void {
  assertWidth(measureTextCells(actual), actual);
  if (maxWidth <= 0) {
    assert.equal(actual, "");
    return;
  }
  assert.equal(measureTextCells(actual) <= maxWidth, true);
}

test("text measurement fuzz: malformed unicode and truncation stay deterministic", async () => {
  await runFuzz(
    {
      seed: 0x7e57_0001,
      iterations: 4096,
      label: "text measurement",
    },
    (ctx) => {
      const text = randomText(ctx.rng);
      const maxWidth = randomInt(ctx.rng, 0, 32);
      ctx.note(`len=${String(text.length)} maxWidth=${String(maxWidth)}`);

      setTextMeasureEmojiPolicy("wide");
      const wideA = measureTextCells(text);
      const wideB = measureTextCells(text);
      assert.equal(wideA, wideB);
      assertWidth(wideA, text);

      setTextMeasureEmojiPolicy("narrow");
      const narrow = measureTextCells(text);
      assertWidth(narrow, text);
      assert.equal(narrow <= wideA, true);

      assertTruncationFits(text, maxWidth, truncateWithEllipsis(text, maxWidth));
      assertTruncationFits(text, maxWidth, truncateStart(text, maxWidth));
      assertTruncationFits(text, maxWidth, truncateMiddle(text, maxWidth));

      assert.equal(getTextMeasureCacheSize() <= 10000, true);
      clearTextMeasureCache();
      setTextMeasureEmojiPolicy("wide");
    },
  );
});

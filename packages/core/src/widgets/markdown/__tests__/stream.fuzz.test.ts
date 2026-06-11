import { assert, describe, test } from "@rezi-ui/testkit";
import { type Rng, chance, pick, randomAsciiString, randomInt, runFuzz } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../../testing/index.js";
import { parseMarkdown } from "../parse.js";
import { renderMarkdown } from "../render.js";
import { createMarkdownStream } from "../stream.js";

const MARKDOWN_ALPHABET = "ab c\n*_~`#>-|[]()!\\<>&;:.0123456789\t\"'=+xhttps/\r";

const SNIPPETS = [
  "# heading",
  "paragraph **bold** `code` text",
  "[link](https://example.com)",
  "- one\n- two\n  - nested",
  "1. a\n2. b",
  "- [x] done",
  "> quote line",
  "```ts\nconst a = 1;\n```",
  "    indented code",
  "| a | b |\n| - | - |\n| 1 | 2 |",
  "---",
  "hard  \nbreak",
] as const;

function buildDoc(rng: Rng): string {
  const parts: string[] = [];
  const count = randomInt(rng, 1, 6);
  for (let i = 0; i < count; i++) {
    parts.push(
      chance(rng, 70)
        ? pick(rng, SNIPPETS)
        : randomAsciiString(rng, { maxLength: 60, alphabet: MARKDOWN_ALPHABET }),
    );
  }
  return parts.join(chance(rng, 75) ? "\n\n" : "\n");
}

/** Appends `source` to a fresh stream in random-sized chunks. */
function appendInRandomChunks(
  rng: Rng,
  stream: ReturnType<typeof createMarkdownStream>,
  source: string,
): void {
  let i = 0;
  while (i < source.length) {
    const size = randomInt(rng, 1, 24);
    stream.append(source.slice(i, i + size));
    i += size;
  }
}

describe("markdown stream fuzz", () => {
  test("randomly chunked appends always match whole-source parsing", async () => {
    await runFuzz(
      { label: "markdown-stream-chunk-equivalence", seed: 0x6d73_0001, iterations: 200 },
      (ctx) => {
        const source = buildDoc(ctx.rng);
        const stream = createMarkdownStream();
        appendInRandomChunks(ctx.rng, stream, source);
        assert.deepEqual(stream.document(), parseMarkdown(stream.source()));
        // Querying the document mid-stream must not corrupt later appends.
        const extra = buildDoc(ctx.rng);
        appendInRandomChunks(ctx.rng, stream, extra);
        assert.deepEqual(stream.document(), parseMarkdown(stream.source()));
      },
    );
  });

  test("interleaved document() and vnode() queries keep render equality", async () => {
    await runFuzz(
      { label: "markdown-stream-render-equality", seed: 0x6d73_0002, iterations: 60 },
      (ctx) => {
        const stream = createMarkdownStream();
        const rounds = randomInt(ctx.rng, 1, 4);
        for (let round = 0; round < rounds; round++) {
          appendInRandomChunks(ctx.rng, stream, buildDoc(ctx.rng));
          if (chance(ctx.rng, 50)) stream.document();
          if (chance(ctx.rng, 30)) stream.vnode();
          if (chance(ctx.rng, 10)) stream.reset(buildDoc(ctx.rng));
        }
        const renderer = createTestRenderer({ viewport: { cols: 40, rows: 30 } });
        const streamed = renderer.render(stream.vnode()).toText();
        const whole = createTestRenderer({ viewport: { cols: 40, rows: 30 } })
          .render(renderMarkdown(parseMarkdown(stream.source())))
          .toText();
        assert.equal(streamed, whole);
      },
    );
  });

  test("unicode soup chunked at arbitrary boundaries stays equivalent", async () => {
    await runFuzz(
      { label: "markdown-stream-unicode", seed: 0x6d73_0003, iterations: 100 },
      (ctx) => {
        const length = randomInt(ctx.rng, 0, 160);
        let source = "";
        for (let i = 0; i < length; i++) {
          const code = randomInt(ctx.rng, 1, 0x2fff);
          source += code >= 0xd800 && code <= 0xdfff ? "�" : String.fromCodePoint(code);
        }
        const stream = createMarkdownStream();
        appendInRandomChunks(ctx.rng, stream, source);
        assert.deepEqual(stream.document(), parseMarkdown(stream.source()));
      },
    );
  });
});

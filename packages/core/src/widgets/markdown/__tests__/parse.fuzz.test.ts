import { assert, describe, test } from "@rezi-ui/testkit";
import { type Rng, chance, pick, randomAsciiString, randomInt, runFuzz } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../../testing/index.js";
import { ui } from "../../ui.js";
import { parseMarkdown } from "../parse.js";
import { renderMarkdown } from "../render.js";

const MARKDOWN_ALPHABET = "ab c\n*_~`#>-|[]()!\\<>&;:.0123456789\t\"'=+xhttps/";

const SNIPPETS = [
  "# heading",
  "## sub *heading*",
  "plain paragraph text",
  "**bold** and *italic* and ~~struck~~ and `code`",
  "[link](https://example.com) and <https://example.com/auto>",
  "bare https://example.com/path, trailing",
  "- item one\n- item two\n  - nested",
  "1. first\n2. second",
  "- [x] done\n- [ ] todo",
  "> quoted text\n> more quote",
  "```ts\nconst a = 1;\n```",
  "    indented code",
  "| a | b |\n| - | - |\n| 1 | 2 |",
  "---",
  "a  \nhard break",
  "&amp; &#65; &bogus;",
  "\\*escaped\\* markers",
  "***x* unbalanced **",
  "<div>html-ish</div>",
] as const;

const PATHOLOGICAL = [
  "*".repeat(2048),
  "[".repeat(2048),
  "`".repeat(1023),
  "~~".repeat(512),
  `${"> ".repeat(128)}deep`,
  Array.from({ length: 64 }, (_, i) => `${"  ".repeat(i)}- nest`).join("\n"),
  `${"|".repeat(512)}\n${"|-".repeat(256)}`,
  `${"&#65;".repeat(512)}`,
  `[a](${"(".repeat(512)}`,
  `**${"a ".repeat(1024)}`,
] as const;

function buildStructuredDoc(rng: Rng): string {
  const parts: string[] = [];
  const count = randomInt(rng, 1, 8);
  for (let i = 0; i < count; i++) {
    parts.push(pick(rng, SNIPPETS));
    if (chance(rng, 20)) {
      parts.push(randomAsciiString(rng, { maxLength: 40, alphabet: MARKDOWN_ALPHABET }));
    }
  }
  return parts.join(chance(rng, 80) ? "\n\n" : "\n");
}

function assertParsesSafely(source: string): void {
  const first = parseMarkdown(source);
  const second = parseMarkdown(source);
  assert.deepEqual(first, second, "parse must be deterministic");
  assert.ok(Object.isFrozen(first), "document must be frozen");
  const vnode = renderMarkdown(first);
  assert.ok(vnode !== null && typeof vnode === "object", "render must produce a vnode");
}

describe("markdown parser fuzz", () => {
  test("random markdown-flavored input never throws and stays deterministic", async () => {
    await runFuzz({ label: "markdown-random-input", seed: 0x6d64_0001, iterations: 300 }, (ctx) => {
      const source = randomAsciiString(ctx.rng, {
        maxLength: 400,
        alphabet: MARKDOWN_ALPHABET,
      });
      assertParsesSafely(source);
    });
  });

  test("structured snippet documents parse and render to frames", async () => {
    await runFuzz(
      { label: "markdown-structured-docs", seed: 0x6d64_0002, iterations: 120 },
      (ctx) => {
        const source = buildStructuredDoc(ctx.rng);
        assertParsesSafely(source);
        if (chance(ctx.rng, 25)) {
          const out = createTestRenderer({ viewport: { cols: 40, rows: 30 } })
            .render(ui.markdown(source))
            .toText();
          assert.equal(typeof out, "string");
        }
      },
    );
  });

  test("pathological inputs stay bounded and never throw", () => {
    for (const source of PATHOLOGICAL) {
      assertParsesSafely(source);
    }
  });

  test("parser tolerates arbitrary unicode and control characters", async () => {
    await runFuzz({ label: "markdown-unicode-soup", seed: 0x6d64_0003, iterations: 200 }, (ctx) => {
      const length = randomInt(ctx.rng, 0, 120);
      let source = "";
      for (let i = 0; i < length; i++) {
        const code = randomInt(ctx.rng, 0, 0x2fff);
        source += code >= 0xd800 && code <= 0xdfff ? "�" : String.fromCodePoint(code);
      }
      assertParsesSafely(source);
    });
  });
});

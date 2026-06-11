import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../../testing/index.js";
import { ui } from "../../ui.js";
import { parseMarkdown } from "../parse.js";
import { createMarkdownStream } from "../stream.js";

const KITCHEN_SINK = [
  "# Title",
  "",
  "Some **bold** text with `code` and [a link](https://rezitui.dev).",
  "",
  "- item one",
  "- item two",
  "  - nested",
  "",
  "> quoted",
  "",
  "```ts",
  "const a = 1; // comment",
  "```",
  "",
  "| a | b |",
  "| - | -: |",
  "| 1 | 2 |",
  "",
  "Tail paragraph https://example.com.",
].join("\n");

function renderText(vnode: Parameters<ReturnType<typeof createTestRenderer>["render"]>[0]): string {
  return createTestRenderer({ viewport: { cols: 44, rows: 36 } }).render(vnode).toText();
}

describe("createMarkdownStream", () => {
  test("char-by-char appends match whole-source parsing", () => {
    const stream = createMarkdownStream();
    for (const ch of KITCHEN_SINK) stream.append(ch);
    assert.deepEqual(stream.document(), parseMarkdown(KITCHEN_SINK));
    assert.equal(stream.source(), KITCHEN_SINK);
  });

  test("chunked appends match whole-source parsing at several widths", () => {
    for (const width of [3, 7, 16, 64]) {
      const stream = createMarkdownStream();
      for (let i = 0; i < KITCHEN_SINK.length; i += width) {
        stream.append(KITCHEN_SINK.slice(i, i + width));
      }
      assert.deepEqual(stream.document(), parseMarkdown(KITCHEN_SINK), `width ${width}`);
    }
  });

  test("CRLF pairs split across chunk boundaries normalize correctly", () => {
    const stream = createMarkdownStream();
    stream.append("alpha\r");
    stream.append("\nbeta\r");
    stream.append("\n\r\ngamma");
    assert.deepEqual(stream.document(), parseMarkdown("alpha\r\nbeta\r\n\r\ngamma"));
  });

  test("appending can extend the last block across blank lines", () => {
    const stream = createMarkdownStream();
    stream.append("- item\n\n");
    const before = stream.document();
    assert.equal(before.blocks.length, 1);
    stream.append("  continuation");
    assert.deepEqual(stream.document(), parseMarkdown("- item\n\n  continuation"));
  });

  test("an unclosed fence keeps absorbing appends until it closes", () => {
    const stream = createMarkdownStream();
    stream.append("```ts\nconst a");
    const open = stream.document().blocks[0];
    assert.ok(open !== undefined && open.kind === "codeBlock");
    assert.equal(open.text, "const a");
    stream.append(" = 1;\n```\nafter");
    assert.deepEqual(stream.document(), parseMarkdown("```ts\nconst a = 1;\n```\nafter"));
  });

  test("completed blocks keep referential identity across appends", () => {
    const stream = createMarkdownStream();
    stream.append("# one\n\ntwo\n\n# three\n\n");
    const before = stream.document().blocks;
    stream.append("growing tail");
    stream.append(" with more words");
    const after = stream.document().blocks;
    assert.equal(after[0], before[0]);
    assert.equal(after[1], before[1]);
    assert.equal(after[2], before[2]);
  });

  test("vnode() reuses cached VNodes for completed blocks", () => {
    const stream = createMarkdownStream();
    stream.append("# head\n\nstable paragraph\n\ntail");
    const first = stream.vnode();
    stream.append(" grows");
    const second = stream.vnode();
    assert.ok(first.kind === "column" && second.kind === "column");
    assert.equal(second.children?.[0], first.children?.[0], "heading vnode cached");
    assert.equal(second.children?.[1], first.children?.[1], "paragraph vnode cached");
    assert.notEqual(second.children?.[2], first.children?.[2], "tail re-rendered");
  });

  test("vnode() renders identically to ui.markdown over the same source", () => {
    const stream = createMarkdownStream({ blockGap: 2 });
    for (let i = 0; i < KITCHEN_SINK.length; i += 11) {
      stream.append(KITCHEN_SINK.slice(i, i + 11));
    }
    const streamed = renderText(stream.vnode());
    const whole = renderText(ui.markdown(stream.source(), { blockGap: 2 }));
    assert.equal(streamed, whole);
  });

  test("reset clears state and accepts replacement source", () => {
    const stream = createMarkdownStream();
    stream.append("# old\n\ncontent");
    stream.reset("# fresh");
    assert.deepEqual(stream.document(), parseMarkdown("# fresh"));
    assert.equal(stream.source(), "# fresh");
    stream.reset();
    assert.equal(stream.source(), "");
    assert.equal(stream.document().blocks.length, 0);
  });

  test("empty appends and empty streams are safe", () => {
    const stream = createMarkdownStream();
    stream.append("");
    assert.equal(stream.document().blocks.length, 0);
    assert.equal(renderText(stream.vnode()).trim(), "");
    stream.append("text");
    stream.append("");
    assert.deepEqual(stream.document(), parseMarkdown("text"));
  });

  test("document results stay deeply frozen", () => {
    const stream = createMarkdownStream();
    stream.append("# a\n\nb");
    const doc = stream.document();
    assert.ok(Object.isFrozen(doc));
    assert.ok(Object.isFrozen(doc.blocks));
    assert.ok(Object.isFrozen(doc.blocks[0]));
  });
});

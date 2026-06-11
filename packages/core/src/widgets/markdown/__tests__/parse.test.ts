import { assert, describe, test } from "@rezi-ui/testkit";
import type { MarkdownBlock, MarkdownInline } from "../ast.js";
import { parseMarkdown } from "../parse.js";

function blocks(source: string): readonly MarkdownBlock[] {
  return parseMarkdown(source).blocks;
}

function only(source: string): MarkdownBlock {
  const parsed = blocks(source);
  assert.equal(parsed.length, 1, source);
  const first = parsed[0];
  assert.ok(first !== undefined);
  return first;
}

function inlinePlain(nodes: readonly MarkdownInline[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
      case "code":
        out += node.text;
        break;
      case "break":
        out += "\n";
        break;
      case "strong":
      case "em":
      case "del":
      case "link":
        out += inlinePlain(node.children);
        break;
    }
  }
  return out;
}

describe("markdown block parsing", () => {
  test("ATX headings parse levels and strip trailing closers", () => {
    const parsed = blocks("# One\n###### Six ######\n####### seven");
    assert.equal(parsed.length, 3);
    assert.deepEqual(parsed[0], {
      kind: "heading",
      level: 1,
      children: [{ kind: "text", text: "One" }],
    });
    const six = parsed[1];
    assert.ok(six !== undefined && six.kind === "heading");
    assert.equal(six.level, 6);
    assert.equal(inlinePlain(six.children), "Six");
    const seven = parsed[2];
    assert.ok(seven !== undefined && seven.kind === "paragraph");
  });

  test("paragraph lines join with soft spaces", () => {
    const block = only("first line\nsecond line");
    assert.ok(block.kind === "paragraph");
    assert.equal(inlinePlain(block.children), "first line second line");
  });

  test("two trailing spaces and trailing backslash create hard breaks", () => {
    const spaces = only("alpha  \nbeta");
    assert.ok(spaces.kind === "paragraph");
    assert.equal(inlinePlain(spaces.children), "alpha\nbeta");

    const backslash = only("alpha\\\nbeta");
    assert.ok(backslash.kind === "paragraph");
    assert.equal(inlinePlain(backslash.children), "alpha\nbeta");
  });

  test("fenced code keeps content verbatim and records the language", () => {
    const block = only('```ts\nconst a = "`x`";\n\n  indented\n```');
    assert.ok(block.kind === "codeBlock");
    assert.equal(block.language, "ts");
    assert.equal(block.text, 'const a = "`x`";\n\n  indented');
  });

  test("tilde fences and unclosed fences parse to end of input", () => {
    const tilde = only("~~~\nplain\n~~~");
    assert.ok(tilde.kind === "codeBlock");
    assert.equal(tilde.text, "plain");

    const open = only("```\ndangling");
    assert.ok(open.kind === "codeBlock");
    assert.equal(open.text, "dangling");
  });

  test("indented code blocks parse at block start", () => {
    const block = only("    line one\n    line two");
    assert.ok(block.kind === "codeBlock");
    assert.equal(block.language, "");
    assert.equal(block.text, "line one\nline two");
  });

  test("blockquotes nest and join paragraph lines", () => {
    const block = only("> outer\n> > inner quote");
    assert.ok(block.kind === "blockquote");
    const [para, nested] = block.children;
    assert.ok(para !== undefined && para.kind === "paragraph");
    assert.equal(inlinePlain(para.children), "outer");
    assert.ok(nested !== undefined && nested.kind === "blockquote");
  });

  test("unordered lists nest by indentation", () => {
    const block = only("- parent\n  - child\n- sibling");
    assert.ok(block.kind === "list");
    assert.equal(block.ordered, false);
    assert.equal(block.items.length, 2);
    const firstItem = block.items[0];
    assert.ok(firstItem !== undefined);
    const nested = firstItem.blocks.find((child) => child.kind === "list");
    assert.ok(nested !== undefined, "expected nested list inside first item");
  });

  test("ordered lists keep their start number and paren markers work", () => {
    const block = only("3. three\n4. four");
    assert.ok(block.kind === "list");
    assert.equal(block.ordered, true);
    assert.equal(block.start, 3);
    assert.equal(block.items.length, 2);

    const paren = only("1) one");
    assert.ok(paren.kind === "list" && paren.ordered);
  });

  test("task items capture their checked state", () => {
    const block = only("- [x] done\n- [ ] todo\n- plain");
    assert.ok(block.kind === "list");
    assert.deepEqual(
      block.items.map((item) => item.checked),
      [true, false, null],
    );
  });

  test("switching list type starts a new list block", () => {
    const parsed = blocks("- bullet\n1. number");
    assert.equal(parsed.length, 2);
    assert.ok(parsed[0]?.kind === "list" && parsed[0].ordered === false);
    assert.ok(parsed[1]?.kind === "list" && parsed[1].ordered === true);
  });

  test("thematic breaks parse from -, *, and _ runs", () => {
    for (const hr of ["---", "* * *", "___", "- - -"]) {
      assert.equal(only(hr).kind, "hr", hr);
    }
  });

  test("pipe tables parse alignment, escaped pipes, and ragged rows", () => {
    const block = only(
      [
        "| Name | Mid | End |",
        "| :--- | :-: | --: |",
        "| a\\|b | c |",
        "| d | e | f | extra |",
      ].join("\n"),
    );
    assert.ok(block.kind === "table");
    assert.deepEqual(block.align, ["left", "center", "right"]);
    assert.equal(inlinePlain(block.head[0] ?? []), "Name");
    const firstRow = block.rows[0];
    assert.ok(firstRow !== undefined);
    assert.equal(inlinePlain(firstRow[0] ?? []), "a|b");
    assert.equal(inlinePlain(firstRow[2] ?? []), "");
    const secondRow = block.rows[1];
    assert.ok(secondRow !== undefined);
    assert.equal(secondRow.length, 3, "extra cells are dropped");
  });

  test("a dash row without pipes is not a table delimiter", () => {
    const parsed = blocks("Name\n----");
    assert.ok(parsed[0]?.kind === "paragraph");
    assert.ok(parsed[1]?.kind === "hr");
  });

  test("CRLF input normalizes and NUL bytes are replaced", () => {
    const block = only("one\r\ntwo\u0000three");
    assert.ok(block.kind === "paragraph");
    assert.equal(inlinePlain(block.children), "one two�three");
  });

  test("results are deeply frozen and parsing is deterministic", () => {
    const source = "# h\n\n- a\n- b\n\n> q";
    const first = parseMarkdown(source);
    const second = parseMarkdown(source);
    assert.deepEqual(first, second);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.blocks));
    assert.ok(Object.isFrozen(first.blocks[0]));
  });

  test("deeply nested structures stay bounded and never throw", () => {
    const quotes = `${"> ".repeat(64)}deep`;
    assert.ok(parseMarkdown(quotes).blocks.length > 0);
    const lists = Array.from({ length: 40 }, (_, i) => `${"  ".repeat(i)}- item`).join("\n");
    assert.ok(parseMarkdown(lists).blocks.length > 0);
  });
});

describe("markdown inline parsing", () => {
  function paragraphInlines(source: string): readonly MarkdownInline[] {
    const block = only(source);
    assert.ok(block.kind === "paragraph");
    return block.children;
  }

  test("strong, em, del, and inline code parse", () => {
    const nodes = paragraphInlines("**b** *i* ~~d~~ `c`");
    assert.deepEqual(
      nodes.map((node) => node.kind),
      ["strong", "text", "em", "text", "del", "text", "code"],
    );
  });

  test("nested emphasis closes cleanly without stray markers", () => {
    const nodes = paragraphInlines("**bold *nested***");
    assert.equal(nodes.length, 1);
    const strong = nodes[0];
    assert.ok(strong !== undefined && strong.kind === "strong");
    assert.equal(inlinePlain(strong.children), "bold nested");
    assert.ok(strong.children.some((child) => child.kind === "em"));
  });

  test("triple markers parse as em wrapping strong", () => {
    const nodes = paragraphInlines("***both***");
    const em = nodes[0];
    assert.ok(em !== undefined && em.kind === "em");
    assert.ok(em.children[0]?.kind === "strong");
  });

  test("intraword underscores stay literal", () => {
    const nodes = paragraphInlines("snake_case_name stays");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]?.kind, "text");
  });

  test("unmatched markers stay literal text", () => {
    const nodes = paragraphInlines("a * b ** c");
    assert.equal(inlinePlain(nodes), "a * b ** c");
  });

  test("links parse labels, targets, titles, and bracket nesting", () => {
    const [link] = paragraphInlines('[label [inner]](https://example.com "title")');
    assert.ok(link !== undefined && link.kind === "link");
    assert.equal(link.href, "https://example.com");
    assert.equal(inlinePlain(link.children), "label [inner]");

    const [wrapped] = paragraphInlines("[x](<https://example.com/a b>)");
    assert.ok(wrapped !== undefined && wrapped.kind === "link");
    assert.equal(wrapped.href, "https://example.com/a b");
  });

  test("autolinks and bare urls parse, trimming trailing punctuation", () => {
    const [auto] = paragraphInlines("<https://example.com/x>");
    assert.ok(auto !== undefined && auto.kind === "link");

    const nodes = paragraphInlines("see https://example.com/a(b), done");
    const bare = nodes.find((node) => node.kind === "link");
    assert.ok(bare !== undefined && bare.kind === "link");
    assert.equal(bare.href, "https://example.com/a(b)");
    assert.equal(inlinePlain(nodes), "see https://example.com/a(b), done");
  });

  test("backslash escapes suppress markup", () => {
    const nodes = paragraphInlines("\\*not em\\* and \\`not code\\`");
    assert.equal(inlinePlain(nodes), "*not em* and `not code`");
    assert.ok(nodes.every((node) => node.kind === "text"));
  });

  test("double-backtick code spans contain single backticks", () => {
    const nodes = paragraphInlines("`` a ` b ``");
    const code = nodes.find((node) => node.kind === "code");
    assert.ok(code !== undefined && code.kind === "code");
    assert.equal(code.text, "a ` b");
  });

  test("named and numeric entities decode in text", () => {
    const nodes = paragraphInlines("&amp; &lt; &#65; &#x41; &bogus;");
    assert.equal(inlinePlain(nodes), "& < A A &bogus;");
  });

  test("extra opening markers re-emit as literal text", () => {
    const nodes = paragraphInlines("***x*");
    assert.equal(inlinePlain(nodes), "**x");
    assert.ok(nodes.some((node) => node.kind === "em"));
  });
});

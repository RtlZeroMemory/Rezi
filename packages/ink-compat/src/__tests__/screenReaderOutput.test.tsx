import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Static, Text, Transform } from "../index.js";
import { createRootContainer, type HostRoot, updateRootContainer } from "../reconciler.js";

function renderToScreenReaderText(element: React.ReactNode, terminalWidth = 80): string {
  let last: unknown = null;

  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    internal_isScreenReaderEnabled: true,
    internal_terminalWidth: terminalWidth,
    onCommit(vnode) {
      last = vnode;
    },
  };

  const container = createRootContainer(root);
  updateRootContainer(container, element);

  if (
    last === null ||
    typeof last !== "object" ||
    !("kind" in last) ||
    (last as { kind?: unknown }).kind !== "text" ||
    !("text" in last) ||
    typeof (last as { text?: unknown }).text !== "string"
  ) {
    throw new Error("Expected screen-reader conversion to produce a text vnode");
  }
  return (last as unknown as { text: string }).text;
}

function createScreenReaderHarness(terminalWidth = 80) {
  let last = "";
  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    internal_isScreenReaderEnabled: true,
    internal_terminalWidth: terminalWidth,
    onCommit(vnode) {
      if (vnode?.kind === "text") last = vnode.text;
      else last = "";
    },
  };

  const container = createRootContainer(root);
  return {
    update(node: React.ReactNode) {
      updateRootContainer(container, node);
    },
    output() {
      return last;
    },
  };
}

describe("screen-reader output conversion", () => {
  test("joins row children with spaces and column children with newlines", () => {
    const row = renderToScreenReaderText(
      <Box flexDirection="row">
        <Text>first</Text>
        <Text>second</Text>
      </Box>,
    );
    assert.equal(row, "first second");

    const column = renderToScreenReaderText(
      <Box flexDirection="column">
        <Text>first</Text>
        <Text>second</Text>
      </Box>,
    );
    assert.equal(column, "first\nsecond");
  });

  test("includes accessibility role/state prefixes when roles differ by parent", () => {
    const output = renderToScreenReaderText(
      <Box aria-role="list" aria-state={{ busy: true }}>
        <Box aria-role="listitem" aria-state={{ selected: true }}>
          <Text>entry</Text>
        </Box>
      </Box>,
    );

    assert.equal(output, "list: (busy) listitem: (selected) entry");
  });

  test("strips ANSI styling and ignores border drawing", () => {
    const output = renderToScreenReaderText(
      <Box borderStyle="round">
        <Text>
          <Transform transform={(s) => `\u001b[31m${s}\u001b[0m`}>value</Transform>
        </Text>
      </Box>,
    );

    assert.equal(output, "value");
    assert.equal(output.includes("\u001b"), false);
    assert.equal(/[┌┐└┘─│]/.test(output), false);
  });

  test("wraps output to configured terminal width", () => {
    const output = renderToScreenReaderText(<Text>abcdef</Text>, 4);
    assert.equal(output, "abcd\nef");
  });

  test("preserves Static output across updates", () => {
    const h = createScreenReaderHarness();

    const view = (items: number[]) => (
      <>
        <Static items={items}>{(item, i) => <Text key={String(i)}>{String(item)}</Text>}</Static>
        <Text>dyn</Text>
      </>
    );

    h.update(view([1]));
    assert.equal(h.output(), "1\ndyn");

    h.update(view([1, 2]));
    assert.equal(h.output(), "1\n2\ndyn");
  });
});

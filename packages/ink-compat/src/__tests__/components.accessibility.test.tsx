import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import AccessibilityContext from "../context/AccessibilityContext.js";
import { Box, Text } from "../index.js";
import { createRootContainer, type HostElement, type HostNode, type HostRoot, updateRootContainer } from "../reconciler.js";

function renderToRoot(element: React.ReactNode): HostRoot {
  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit() {},
  };

  const container = createRootContainer(root);
  updateRootContainer(container, element);
  return root;
}

function asElement(node: HostNode | undefined): HostElement {
  assert.ok(node !== undefined);
  assert.equal(node.kind, "element");
  return node;
}

function findFirstText(node: HostNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.kind === "text") return node.text;

  for (const child of node.children) {
    const text = findFirstText(child);
    if (text !== undefined) return text;
  }

  return undefined;
}

describe("components: accessibility + default behavior", () => {
  test("Box sets default layout/overflow props and accessibility role/state", () => {
    const root = renderToRoot(
      <Box aria-role="button" aria-state={{ disabled: true }}>
        <Text>x</Text>
      </Box>,
    );

    const box = asElement(root.children[0]);
    assert.equal(box.type, "ink-box");
    assert.equal(box.props["flexWrap"], "nowrap");
    assert.equal(box.props["flexDirection"], "row");
    assert.equal(box.props["flexGrow"], 0);
    assert.equal(box.props["flexShrink"], 1);
    assert.equal(box.props["overflowX"], "visible");
    assert.equal(box.props["overflowY"], "visible");
    assert.deepEqual(box.internal_accessibility, { role: "button", state: { disabled: true } });
  });

  test("Box aria-hidden and aria-label only affect output in screen reader mode", () => {
    const hiddenRoot = renderToRoot(
      <AccessibilityContext.Provider value={true}>
        <Box aria-hidden>
          <Text>hidden</Text>
        </Box>
      </AccessibilityContext.Provider>,
    );
    assert.equal(hiddenRoot.children.length, 0);

    const labelRoot = renderToRoot(
      <AccessibilityContext.Provider value={true}>
        <Box aria-label="screen-reader-box">
          <Text>visual</Text>
        </Box>
      </AccessibilityContext.Provider>,
    );

    const box = asElement(labelRoot.children[0]);
    assert.equal(findFirstText(box), "screen-reader-box");
  });

  test("Text aria-hidden and aria-label apply only in screen reader mode", () => {
    const hiddenRoot = renderToRoot(
      <AccessibilityContext.Provider value={true}>
        <Text aria-hidden>secret</Text>
      </AccessibilityContext.Provider>,
    );
    assert.equal(hiddenRoot.children.length, 0);

    const screenReaderRoot = renderToRoot(
      <AccessibilityContext.Provider value={true}>
        <Text aria-label="screen-reader-text">visual</Text>
      </AccessibilityContext.Provider>,
    );
    assert.equal(findFirstText(screenReaderRoot.children[0]), "screen-reader-text");

    const nonScreenReaderRoot = renderToRoot(<Text aria-label="screen-reader-text">visual</Text>);
    assert.equal(findFirstText(nonScreenReaderRoot.children[0]), "visual");
  });

  test("Text inherits backgroundColor from parent Box unless explicitly set", () => {
    const inheritedRoot = renderToRoot(
      <Box backgroundColor="red">
        <Text>value</Text>
      </Box>,
    );
    const inheritedBox = asElement(inheritedRoot.children[0]);
    const inheritedText = asElement(inheritedBox.children[0]);
    assert.equal(inheritedText.props["backgroundColor"], "red");

    const explicitRoot = renderToRoot(
      <Box backgroundColor="red">
        <Text backgroundColor="blue">value</Text>
      </Box>,
    );
    const explicitBox = asElement(explicitRoot.children[0]);
    const explicitText = asElement(explicitBox.children[0]);
    assert.equal(explicitText.props["backgroundColor"], "blue");
  });
});

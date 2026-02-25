/**
 * Tests for newly added Ink-compat APIs:
 * - useIsScreenReaderEnabled
 * - getBoundingBox
 * - getInnerHeight / getScrollHeight
 * - ResizeObserver
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

import { useIsScreenReaderEnabled } from "../../hooks/useIsScreenReaderEnabled.js";
import { kittyFlags, kittyModifiers, useCursor } from "../../index.js";
import { reconciler } from "../../reconciler/reconciler.js";
import { appendChild, createHostContainer, createHostNode } from "../../reconciler/types.js";
import { InkResizeObserver } from "../../runtime/ResizeObserver.js";
import { InkContext, type InkContextValue } from "../../runtime/context.js";
import { getInnerHeight, getScrollHeight } from "../../runtime/domHelpers.js";
import { getBoundingBox } from "../../runtime/getBoundingBox.js";

// --- useIsScreenReaderEnabled ---

test("export surface includes kitty flags/modifiers and useCursor", () => {
  assert.equal(typeof useCursor, "function");
  assert.equal(kittyFlags.disambiguateEscapeCodes, 1);
  assert.equal(kittyModifiers.ctrl, 4);
});

test("useIsScreenReaderEnabled reads context flag", async () => {
  const rootNode = createHostContainer();
  const root = reconciler.createContainer(
    rootNode,
    0,
    null,
    false,
    null,
    "",
    () => {},
    null,
    null,
    null,
  );

  const mockContext = {
    exit: () => {},
    rerender: () => {},
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    isRawModeSupported: false,
    setRawMode: () => {},
    writeStdout: () => {},
    writeStderr: () => {},
    isScreenReaderEnabled: true,
    setCursorPosition: (_position) => {},
    getCursorPosition: () => undefined,
    registerFocusable: () => {},
    unregisterFocusable: () => {},
    getFocusedId: () => undefined,
    focusNext: () => {},
    focusPrevious: () => {},
    focusById: () => {},
    setFocusEnabled: () => {},
    onKeyEvent: () => () => {},
  } satisfies InkContextValue;

  let seen = false;
  const Probe = (): null => {
    seen = useIsScreenReaderEnabled();
    return null;
  };

  if (typeof reconciler.updateContainerSync === "function") {
    reconciler.updateContainerSync(
      React.createElement(InkContext.Provider, { value: mockContext }, React.createElement(Probe)),
      root,
      null,
      null,
    );
    reconciler.flushSyncWork?.();
    reconciler.flushPassiveEffects?.();
  } else {
    await new Promise<void>((resolve) => {
      reconciler.updateContainer(
        React.createElement(
          InkContext.Provider,
          { value: mockContext },
          React.createElement(Probe),
        ),
        root,
        null,
        () => resolve(),
      );
    });
  }

  assert.equal(seen, true);
});

// --- getBoundingBox ---

test("getBoundingBox returns zeros for node without layout", () => {
  const node = createHostNode("ink-box", {});
  const box = getBoundingBox(node);
  assert.deepEqual(box, { x: 0, y: 0, width: 0, height: 0 });
});

test("getBoundingBox reads __inkLayout", () => {
  const node = createHostNode("ink-box", {}) as ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  node.__inkLayout = { x: 5, y: 10, w: 40, h: 20 };
  const box = getBoundingBox(node);
  assert.deepEqual(box, { x: 5, y: 10, width: 40, height: 20 });
});

test("layout readers ignore stale generation-tagged layouts", () => {
  type LayoutNode = ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
    __inkLayoutGen?: number;
  };

  const container = createHostContainer();
  const node = createHostNode("ink-box", {}) as LayoutNode;
  appendChild(container, node);

  node.__inkLayout = { x: 1, y: 2, w: 30, h: 10 };
  node.__inkLayoutGen = 1;
  container.__inkLayoutGeneration = 2;

  assert.deepEqual(getBoundingBox(node), { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(getInnerHeight(node), 0);
  assert.equal(getScrollHeight(node), 0);
});

// --- getInnerHeight ---

test("getInnerHeight returns 0 for node without layout", () => {
  const node = createHostNode("ink-box", {});
  assert.equal(getInnerHeight(node), 0);
});

test("getInnerHeight returns layout height", () => {
  const node = createHostNode("ink-box", {}) as ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  node.__inkLayout = { x: 0, y: 0, w: 80, h: 24 };
  assert.equal(getInnerHeight(node), 24);
});

// --- getScrollHeight ---

test("getScrollHeight returns element height when no children have layout", () => {
  const node = createHostNode("ink-box", {}) as ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  node.__inkLayout = { x: 0, y: 0, w: 80, h: 10 };
  assert.equal(getScrollHeight(node), 10);
});

test("getScrollHeight computes from children layout", () => {
  type LayoutNode = ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  const parent = createHostNode("ink-box", {}) as LayoutNode;
  parent.__inkLayout = { x: 0, y: 0, w: 80, h: 10 };

  const child1 = createHostNode("ink-box", {}) as LayoutNode;
  child1.__inkLayout = { x: 0, y: 0, w: 80, h: 5 };
  child1.parent = parent;
  parent.children.push(child1);

  const child2 = createHostNode("ink-box", {}) as LayoutNode;
  child2.__inkLayout = { x: 0, y: 5, w: 80, h: 30 };
  child2.parent = parent;
  parent.children.push(child2);

  // Scroll height = max(child.y + child.h) - parent.y = (5 + 30) - 0 = 35
  assert.equal(getScrollHeight(parent), 35);
});

// --- ResizeObserver ---

test("ResizeObserver fires initial callback on observe", () => {
  const entries: Array<{ width: number; height: number }> = [];
  const observer = new InkResizeObserver((e) => {
    entries.push(e[0]!.contentRect);
  });

  const node = createHostNode("ink-box", {}) as ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  node.__inkLayout = { x: 0, y: 0, w: 80, h: 24 };

  observer.observe(node);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { width: 80, height: 24 });

  observer.disconnect();
});

test("ResizeObserver fires on size change via check()", () => {
  const entries: Array<{ width: number; height: number }> = [];
  const observer = new InkResizeObserver((e) => {
    entries.push(e[0]!.contentRect);
  });

  type LayoutNode = ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  const node = createHostNode("ink-box", {}) as LayoutNode;
  node.__inkLayout = { x: 0, y: 0, w: 80, h: 24 };

  observer.observe(node);
  assert.equal(entries.length, 1);

  // No change — should not fire
  observer.check();
  assert.equal(entries.length, 1);

  // Change height — should fire
  node.__inkLayout = { x: 0, y: 0, w: 80, h: 30 };
  observer.check();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[1], { width: 80, height: 30 });

  observer.disconnect();
});

test("ResizeObserver does not fire after disconnect", () => {
  let callCount = 0;
  const observer = new InkResizeObserver(() => {
    callCount++;
  });

  type LayoutNode = ReturnType<typeof createHostNode> & {
    __inkLayout?: { x: number; y: number; w: number; h: number };
  };
  const node = createHostNode("ink-box", {}) as LayoutNode;
  node.__inkLayout = { x: 0, y: 0, w: 80, h: 24 };

  observer.observe(node);
  assert.equal(callCount, 1);

  observer.disconnect();

  node.__inkLayout = { x: 0, y: 0, w: 80, h: 50 };
  observer.check();
  assert.equal(callCount, 1, "should not fire after disconnect");
});

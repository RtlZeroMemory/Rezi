import { createTestRenderer } from "@rezi-ui/core";
import { PassThrough } from "node:stream";
import React from "react";

import { createBridge } from "../runtime/bridge.js";
import { InkContext } from "../runtime/context.js";
import { commitSync, createReactRoot } from "../runtime/reactHelpers.js";

export interface RenderResult {
  lastFrame(): string;
  frames: string[];
  rerender(element: React.ReactElement): void;
  unmount(): void;
  stdin: {
    write(data: string): void;
  };
}

export function render(element: React.ReactElement): RenderResult {
  const mockStdout = new PassThrough();
  const mockStdin = new PassThrough();
  const mockStderr = new PassThrough();

  const bridge = createBridge({
    stdout: mockStdout,
    stdin: mockStdin,
    stderr: mockStderr,
  });

  const container = createReactRoot(bridge.rootNode);
  const frames: string[] = [];
  const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });

  const captureFrame = (): void => {
    const vnode = bridge.translateToVNode();
    const output = renderer.render(vnode).toText();
    frames.push(output);
  };

  bridge.rootNode.onCommit = captureFrame;

  // Track the child element so rerender() can swap it.
  let currentChild = element;

  // React bails out when it sees the same element reference, so we must
  // create a fresh element tree on every commit to force a re-render.
  const commit = (): void => {
    commitSync(
      container,
      React.createElement(
        InkContext.Provider,
        { value: bridge.context },
        React.cloneElement(currentChild),
      ),
    );
  };

  // Initial render
  commit();
  // Effects (e.g. useFocus registration) schedule state updates that React
  // batches asynchronously. A second commit with a new element reference
  // forces React to re-render and pick up those updates.
  commit();
  captureFrame();

  return {
    lastFrame: () => frames[frames.length - 1] ?? "",
    frames,
    rerender: (newElement: React.ReactElement) => {
      currentChild = newElement;
      commit();
    },
    unmount: () => {
      commitSync(container, null);
    },
    stdin: {
      write: (data: string) => {
        bridge.simulateInput(data);
        // Re-commit with a new element reference to flush state updates
        // from input handlers and pick up external state changes (focus).
        commit();
      },
    },
  };
}

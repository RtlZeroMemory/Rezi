import { PassThrough } from "node:stream";
import { createTestRenderer } from "@rezi-ui/core";
import React from "react";

import { createBridge } from "./bridge.js";
import { InkContext } from "./context.js";
import { commitSync, createReactRoot } from "./reactHelpers.js";

export interface RenderToStringOptions {
  columns?: number;
}

export function renderToString(
  element: React.ReactElement,
  options: RenderToStringOptions = {},
): string {
  const cols = options.columns ?? 80;

  const mockStdout = new PassThrough();
  const mockStdin = new PassThrough();
  const mockStderr = new PassThrough();

  const bridge = createBridge({
    stdout: mockStdout,
    stdin: mockStdin,
    stderr: mockStderr,
  });

  const container = createReactRoot(bridge.rootNode);
  const staticRenderer = createTestRenderer({ viewport: { cols, rows: 999 } });
  const dynamicRenderer = createTestRenderer({ viewport: { cols, rows: 999 } });
  let staticBuffer = "";

  bridge.rootNode.onCommit = () => {
    if (!bridge.hasStaticNodes()) return;
    const staticVNode = bridge.translateStaticToVNode();
    const staticOutput = staticRenderer.render(staticVNode).toText();
    if (staticOutput.length > 0) {
      staticBuffer += `${staticOutput}\n`;
    }
  };

  commitSync(
    container,
    React.createElement(InkContext.Provider, { value: bridge.context }, element),
  );
  // Effects can schedule updates that require a second commit to flush.
  commitSync(
    container,
    React.createElement(
      InkContext.Provider,
      { value: bridge.context },
      React.cloneElement(element),
    ),
  );
  bridge.rootNode.onCommit = null;

  const dynamicVNode = bridge.translateDynamicToVNode();
  const dynamicOutput = dynamicRenderer.render(dynamicVNode).toText();
  const normalizedStatic = staticBuffer.endsWith("\n") ? staticBuffer.slice(0, -1) : staticBuffer;

  const output =
    normalizedStatic.length > 0 && dynamicOutput.length > 0
      ? `${normalizedStatic}\n${dynamicOutput}`
      : normalizedStatic.length > 0
        ? normalizedStatic
        : dynamicOutput;

  bridge.dispose();

  return output;
}

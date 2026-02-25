import { createTestRenderer } from "@rezi-ui/core";
import { PassThrough } from "node:stream";
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
  const wrapped = React.createElement(InkContext.Provider, { value: bridge.context }, element);

  commitSync(container, wrapped);

  const vnode = bridge.translateToVNode();
  const renderer = createTestRenderer({ viewport: { cols, rows: 999 } });
  return renderer.render(vnode).toText();
}

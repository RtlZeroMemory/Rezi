import { type VNode, ui } from "@rezi-ui/core";
import { EventEmitter } from "node:events";
import React from "react";
import AppContext, { type AppContextValue } from "../../context/AppContext.js";
import FocusProvider from "../../context/FocusProvider.js";
import StdioContext, { type StdioContextValue } from "../../context/StdioContext.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../../reconciler.js";

function flushPassiveEffects(): void {
  while (reconciler.flushPassiveEffects()) {}
}

export type TestHarness = Readonly<{
  emitter: StdioContextValue["internal_eventEmitter"];
  getLast: () => VNode;
  update: (node: React.ReactNode) => void;
  flush: () => void;
  unmount: () => void;
}>;

export function createHarness(
  opts?: Readonly<{ app?: AppContextValue; stdio?: Partial<StdioContextValue> }>,
): TestHarness {
  let last: VNode | null = null;

  const emitter = new EventEmitter();

  const stdio: StdioContextValue = Object.freeze({
    stdin: opts?.stdio?.stdin ?? process.stdin,
    stdout: opts?.stdio?.stdout ?? process.stdout,
    stderr: opts?.stdio?.stderr ?? process.stderr,
    internal_writeToStdout: opts?.stdio?.internal_writeToStdout ?? (() => {}),
    internal_writeToStderr: opts?.stdio?.internal_writeToStderr ?? (() => {}),
    setRawMode: opts?.stdio?.setRawMode ?? (() => {}),
    isRawModeSupported: opts?.stdio?.isRawModeSupported ?? false,
    internal_exitOnCtrlC: opts?.stdio?.internal_exitOnCtrlC ?? true,
    internal_eventEmitter: emitter,
  });

  const app: AppContextValue = opts?.app ?? { exit: () => {} };

  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit(vnode) {
      // Note: static nodes are accumulated in root.staticVNodes by the compat reconciler.
      last = vnode;
    },
  };

  const container = createRootContainer(root);

  const wrap = (node: React.ReactNode) =>
    React.createElement(
      AppContext.Provider,
      { value: app },
      React.createElement(
        StdioContext.Provider,
        { value: stdio },
        React.createElement(FocusProvider, null, node),
      ),
    );

  const update = (node: React.ReactNode) => {
    updateRootContainer(container, wrap(node));
    flushPassiveEffects();
  };

  const flush = () => {
    flushPassiveEffects();
  };

  const unmount = () => {
    updateRootContainer(container, null);
    flushPassiveEffects();
  };

  return Object.freeze({
    emitter,
    getLast: () => last ?? ui.text(""),
    update,
    flush,
    unmount,
  });
}

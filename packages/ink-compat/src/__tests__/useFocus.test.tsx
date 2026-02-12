import { assert, describe, test } from "@rezi-ui/testkit";
import { EventEmitter } from "node:events";
import React from "react";
import FocusProvider from "../context/FocusProvider.js";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useFocus } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

function flushPassiveEffects(): void {
  while (reconciler.flushPassiveEffects()) {}
}

function mount(element: React.ReactNode, stdio: StdioContextValue) {
  const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
  const container = createRootContainer(root);

  const wrapped = React.createElement(
    StdioContext.Provider,
    { value: stdio },
    React.createElement(FocusProvider, null, element),
  );
  updateRootContainer(container, wrapped);
  flushPassiveEffects();

  return {
    unmount() {
      updateRootContainer(container, null);
      flushPassiveEffects();
    },
  };
}

describe("useFocus()", () => {
  test("Tab cycles focus between focusables (best-effort Ink parity)", () => {
    const emitter = new EventEmitter();
    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: true,
      internal_eventEmitter: emitter,
    });

    const seen: Array<{ a: boolean; b: boolean }> = [];

    function App() {
      const a = useFocus({ id: "a" });
      const b = useFocus({ id: "b" });
      seen.push({ a: a.isFocused, b: b.isFocused });
      return <Text>hi</Text>;
    }

    const inst = mount(<App />, stdio);

    // Initially no focus.
    assert.deepEqual(seen[seen.length - 1], { a: false, b: false });

    emitter.emit("input", "\t");
    assert.deepEqual(seen[seen.length - 1], { a: true, b: false });

    emitter.emit("input", "\t");
    assert.deepEqual(seen[seen.length - 1], { a: false, b: true });

    emitter.emit("input", "\u001B[Z");
    assert.deepEqual(seen[seen.length - 1], { a: true, b: false });

    inst.unmount();
  });
});

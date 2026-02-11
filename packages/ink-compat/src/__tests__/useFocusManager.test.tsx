import type { UiEvent } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import FocusProvider from "../context/FocusProvider.js";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useFocus, useFocusManager } from "../index.js";
import { createInputEventEmitter } from "../internal/emitter.js";
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

describe("useFocusManager()", () => {
  test("exposes focus navigation methods", () => {
    const emitter = createInputEventEmitter<UiEvent>();
    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: true,
      internal_eventEmitter: emitter,
    });

    const seen: Array<{ a: boolean; b: boolean }> = [];
    let mgr: ReturnType<typeof useFocusManager> | undefined;

    function App() {
      mgr = useFocusManager();
      const a = useFocus({ id: "a" });
      const b = useFocus({ id: "b" });
      seen.push({ a: a.isFocused, b: b.isFocused });
      return <Text>hi</Text>;
    }

    const inst = mount(<App />, stdio);

    assert.ok(mgr);

    mgr?.focusNext();
    assert.deepEqual(seen[seen.length - 1], { a: true, b: false });

    mgr?.focusNext();
    assert.deepEqual(seen[seen.length - 1], { a: false, b: true });

    mgr?.focusPrevious();
    assert.deepEqual(seen[seen.length - 1], { a: true, b: false });

    inst.unmount();
  });
});

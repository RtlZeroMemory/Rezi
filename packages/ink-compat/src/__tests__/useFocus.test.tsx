import type { UiEvent, ZrevEvent } from "@rezi-ui/core";
import { ZR_KEY_TAB, ZR_MOD_SHIFT } from "@rezi-ui/core/keybindings";
import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import FocusProvider from "../context/FocusProvider.js";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useFocus } from "../index.js";
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

function engine(ev: ZrevEvent): UiEvent {
  return { kind: "engine", event: ev };
}

describe("useFocus()", () => {
  test("Tab cycles focus between focusables (best-effort Ink parity)", () => {
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

    function App() {
      const a = useFocus({ id: "a" });
      const b = useFocus({ id: "b" });
      seen.push({ a: a.isFocused, b: b.isFocused });
      return <Text>hi</Text>;
    }

    const inst = mount(<App />, stdio);

    // Initially no focus.
    assert.deepEqual(seen[seen.length - 1], { a: false, b: false });

    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 0, key: ZR_KEY_TAB, mods: 0, action: "down" }),
    );
    assert.deepEqual(seen[seen.length - 1], { a: true, b: false });

    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 1, key: ZR_KEY_TAB, mods: 0, action: "down" }),
    );
    assert.deepEqual(seen[seen.length - 1], { a: false, b: true });

    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 2, key: ZR_KEY_TAB, mods: ZR_MOD_SHIFT, action: "down" }),
    );
    assert.deepEqual(seen[seen.length - 1], { a: true, b: false });

    inst.unmount();
  });
});

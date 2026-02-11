import type { UiEvent, ZrevEvent } from "@rezi-ui/core";
import { ZR_KEY_UP, ZR_MOD_CTRL, ZR_MOD_SHIFT } from "@rezi-ui/core/keybindings";
import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useInput } from "../index.js";
import { createInputEventEmitter } from "../internal/emitter.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

function flushPassiveEffects(): void {
  // Drain until stable (React may schedule nested passive effects).
  while (reconciler.flushPassiveEffects()) {}
}

function mountWithStdio(element: React.ReactNode, stdio: StdioContextValue) {
  const root: HostRoot = { kind: "root", children: [], staticVNodes: [], onCommit: () => {} };
  const container = createRootContainer(root);

  const wrapped = React.createElement(StdioContext.Provider, { value: stdio }, element);
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

describe("useInput()", () => {
  test("maps UP arrow key events", async () => {
    const seen: Array<{ input: string; key: unknown }> = [];

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

    function App() {
      useInput((input, key) => seen.push({ input, key }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 0, key: ZR_KEY_UP, mods: 0, action: "down" }),
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.input, "");
    assert.deepEqual(seen[0]?.key, {
      upArrow: true,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
    });

    inst.unmount();
  });

  test("does not forward Ctrl+C when exitOnCtrlC=true", async () => {
    const seen: Array<{ input: string; ctrl: boolean }> = [];

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

    function App() {
      useInput((input, key) => seen.push({ input, ctrl: key.ctrl }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    // Best-effort: engine key codes for letters are typically ASCII uppercase.
    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 0, key: 67 /* 'C' */, mods: ZR_MOD_CTRL, action: "down" }),
    );

    assert.equal(seen.length, 0);

    inst.unmount();
  });

  test("does not forward Ctrl+Shift+C when exitOnCtrlC=true", async () => {
    const seen: Array<{ input: string; ctrl: boolean }> = [];

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

    function App() {
      useInput((input, key) => seen.push({ input, ctrl: key.ctrl }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    emitter.emit(
      "input",
      engine({
        kind: "key",
        timeMs: 0,
        key: 67 /* 'C' */,
        mods: ZR_MOD_CTRL | ZR_MOD_SHIFT,
        action: "down",
      }),
    );

    assert.equal(seen.length, 0);

    inst.unmount();
  });

  test("ignores key up events", async () => {
    const seen: Array<{ input: string }> = [];

    const emitter = createInputEventEmitter<UiEvent>();
    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input) => seen.push({ input }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 0, key: ZR_KEY_UP, mods: 0, action: "down" }),
    );
    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 1, key: ZR_KEY_UP, mods: 0, action: "up" }),
    );

    assert.equal(seen.length, 1);

    inst.unmount();
  });

  test("ignores invalid text codepoints", async () => {
    const seen: Array<{ input: string }> = [];

    const emitter = createInputEventEmitter<UiEvent>();
    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input) => seen.push({ input }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    emitter.emit("input", engine({ kind: "text", timeMs: 0, codepoint: 0x110000 }));

    assert.equal(seen.length, 0);

    inst.unmount();
  });

  test("respects isActive=false", async () => {
    const seen: Array<{ input: string }> = [];

    const emitter = createInputEventEmitter<UiEvent>();
    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      setRawMode: () => {},
      isRawModeSupported: false,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input) => seen.push({ input }), { isActive: false });
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    emitter.emit(
      "input",
      engine({ kind: "key", timeMs: 0, key: ZR_KEY_UP, mods: 0, action: "down" }),
    );
    assert.equal(seen.length, 0);

    inst.unmount();
  });
});

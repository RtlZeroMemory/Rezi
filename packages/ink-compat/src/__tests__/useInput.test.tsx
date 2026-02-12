import { assert, describe, test } from "@rezi-ui/testkit";
import { EventEmitter } from "node:events";
import React from "react";
import StdioContext, { type StdioContextValue } from "../context/StdioContext.js";
import { Text, useInput } from "../index.js";
import reconciler, {
  createRootContainer,
  runWithSyncPriority,
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

describe("useInput()", () => {
  test("enables/disables raw mode while active", () => {
    const seen: string[] = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: (enabled: boolean) => {
        seen.push(`raw:${String(enabled)}`);
      },
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput(() => {});
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);
    assert.deepEqual(seen, ["raw:true"]);

    inst.unmount();
    assert.deepEqual(seen, ["raw:true", "raw:false"]);
  });

  test("maps UP arrow keypress chunks (non-alphanumeric => input is empty)", () => {
    const seen: Array<{ input: string; key: unknown }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, key }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    runWithSyncPriority(() => {
      emitter.emit("input", "\u001B[A");
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.input, "");
    assert.deepEqual(seen[0]?.key, {
      upArrow: true,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: false,
      hyper: false,
      capsLock: false,
      numLock: false,
      eventType: undefined,
    });

    inst.unmount();
  });

  test("maps HOME/END keypress chunks", () => {
    const seen: Array<{ input: string; key: unknown }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, key }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    runWithSyncPriority(() => {
      emitter.emit("input", "\u001B[H");
      emitter.emit("input", "\u001B[F");
    });

    assert.equal(seen.length, 2);
    assert.equal(seen[0]?.input, "");
    assert.equal(seen[1]?.input, "");

    assert.deepEqual(seen[0]?.key, {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: true,
      end: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: false,
      hyper: false,
      capsLock: false,
      numLock: false,
      eventType: undefined,
    });

    assert.deepEqual(seen[1]?.key, {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: true,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: false,
      hyper: false,
      capsLock: false,
      numLock: false,
      eventType: undefined,
    });

    inst.unmount();
  });

  test("does not forward Ctrl+C when exitOnCtrlC=true", () => {
    const seen: Array<{ input: string; ctrl: boolean }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: true,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, ctrl: key.ctrl }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    // eslint-disable-next-line unicorn/no-hex-escape
    runWithSyncPriority(() => {
      emitter.emit("input", "\x03");
    });

    assert.equal(seen.length, 0);
    inst.unmount();
  });

  test("forwards Ctrl+C when exitOnCtrlC=false", () => {
    const seen: Array<{ input: string; ctrl: boolean }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, ctrl: key.ctrl }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    // eslint-disable-next-line unicorn/no-hex-escape
    runWithSyncPriority(() => {
      emitter.emit("input", "\x03");
    });

    assert.deepEqual(seen, [{ input: "c", ctrl: true }]);
    inst.unmount();
  });

  test("supports kitty keyboard protocol sequences (modifiers, eventType, printable text)", () => {
    const seen: Array<{ input: string; key: unknown }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, key }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    // CSI u: codepoint=97 ('a'), modifiers=9 => (9-1)=8 => super, eventType=2 => repeat.
    runWithSyncPriority(() => {
      // eslint-disable-next-line unicorn/no-hex-escape
      emitter.emit("input", "\x1b[97;9:2u");
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.input, "a");
    assert.deepEqual(seen[0]?.key, {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: true,
      hyper: false,
      capsLock: false,
      numLock: false,
      eventType: "repeat",
    });

    inst.unmount();
  });

  test("kitty non-printable keys produce empty input (arrow key press)", () => {
    const seen: Array<{ input: string; key: unknown }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, key }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    // Kitty-enhanced special key: CSI 1 ; 1 : 1 A -> up arrow press (mods=0, eventType=press)
    runWithSyncPriority(() => {
      // eslint-disable-next-line unicorn/no-hex-escape
      emitter.emit("input", "\x1b[1;1:1A");
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.input, "");
    assert.deepEqual(seen[0]?.key, {
      upArrow: true,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: false,
      hyper: false,
      capsLock: false,
      numLock: false,
      eventType: "press",
    });

    inst.unmount();
  });

  test("kitty Ctrl+letter maps to input name even though key is non-printable", () => {
    const seen: Array<{ input: string; key: unknown }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, key }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    // CSI u: codepoint=3 => Ctrl+C, modifiers=5 => (5-1)=4 => ctrl.
    runWithSyncPriority(() => {
      // eslint-disable-next-line unicorn/no-hex-escape
      emitter.emit("input", "\x1b[3;5u");
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.input, "c");
    assert.deepEqual(seen[0]?.key, {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: false,
      return: false,
      escape: false,
      ctrl: true,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: false,
      hyper: false,
      capsLock: false,
      numLock: false,
      eventType: "press",
    });

    inst.unmount();
  });

  test("strips meta prefix from meta keypresses (\\u001Bf -> input='f')", () => {
    const seen: Array<{ input: string; meta: boolean }> = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: () => {},
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input, key) => seen.push({ input, meta: key.meta }));
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);

    runWithSyncPriority(() => {
      emitter.emit("input", "\u001Bf");
    });

    assert.deepEqual(seen, [{ input: "f", meta: true }]);
    inst.unmount();
  });

  test("respects isActive=false (no subscription and no raw mode enable)", () => {
    const seen: string[] = [];
    const emitter = new EventEmitter();

    const stdio: StdioContextValue = Object.freeze({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      internal_writeToStdout: () => {},
      internal_writeToStderr: () => {},
      setRawMode: (enabled: boolean) => {
        seen.push(`raw:${String(enabled)}`);
      },
      isRawModeSupported: true,
      internal_exitOnCtrlC: false,
      internal_eventEmitter: emitter,
    });

    function App() {
      useInput((input) => seen.push(`input:${input}`), { isActive: false });
      return <Text>hi</Text>;
    }

    const inst = mountWithStdio(<App />, stdio);
    runWithSyncPriority(() => {
      emitter.emit("input", "x");
    });

    assert.deepEqual(seen, []);

    inst.unmount();
  });
});

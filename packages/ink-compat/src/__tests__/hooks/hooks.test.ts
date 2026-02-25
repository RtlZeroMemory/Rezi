import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import React from "react";

import { useApp } from "../../hooks/useApp.js";
import { useCursor } from "../../hooks/useCursor.js";
import { useFocus } from "../../hooks/useFocus.js";
import { useFocusManager } from "../../hooks/useFocusManager.js";
import { useInput } from "../../hooks/useInput.js";
import { useStderr } from "../../hooks/useStderr.js";
import { useStdin } from "../../hooks/useStdin.js";
import { useStdout } from "../../hooks/useStdout.js";
import { reconciler } from "../../reconciler/reconciler.js";
import { createHostContainer } from "../../reconciler/types.js";
import { InkContext, type InkContextValue, type Key } from "../../runtime/context.js";

function createKey(): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    pageUp: false,
    pageDown: false,
    home: false,
    end: false,
    meta: false,
    capsLock: false,
    numLock: false,
    super: false,
    hyper: false,
  };
}

function createMockContext(): InkContextValue {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  let focusedId: string | undefined;
  let cursorPosition: { x: number; y: number } | undefined;
  const handlers = new Set<(input: string, key: Key) => void>();

  return {
    exit: () => {},
    rerender: () => {},
    stdin,
    stdout,
    stderr,
    isRawModeSupported: true,
    setRawMode: () => {},
    writeStdout: (data: string) => {
      stdout.write(data);
    },
    writeStderr: (data: string) => {
      stderr.write(data);
    },
    isScreenReaderEnabled: false,
    setCursorPosition: (position) => {
      cursorPosition = position;
    },
    getCursorPosition: () => cursorPosition,
    registerFocusable: (id, opts) => {
      if (opts?.autoFocus && !focusedId) {
        focusedId = id;
      }
    },
    unregisterFocusable: () => {},
    getFocusedId: () => focusedId,
    focusNext: () => {},
    focusPrevious: () => {},
    focusById: (id) => {
      focusedId = id;
    },
    setFocusEnabled: () => {},
    onKeyEvent: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

function createReactRoot() {
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

  return { root, rootNode };
}

function commitSync(container: unknown, element: React.ReactNode): void {
  if (typeof reconciler.updateContainerSync === "function") {
    reconciler.updateContainerSync(element, container, null, null);
    reconciler.flushSyncWork?.();
    reconciler.flushPassiveEffects?.();
    return;
  }

  reconciler.updateContainer(element, container, null, () => {});
}

test("useApp exposes exit", () => {
  const { root } = createReactRoot();
  const calls: string[] = [];
  const context = {
    ...createMockContext(),
    exit: () => {
      calls.push("exit");
    },
  } satisfies InkContextValue;

  function Probe(): null {
    const app = useApp();
    app.exit();
    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );

  assert.deepEqual(calls, ["exit"]);
});

test("useInput registers handler when active", () => {
  const { root } = createReactRoot();

  const registered: Array<(input: string, key: Key) => void> = [];
  let disposed = 0;

  const context = {
    ...createMockContext(),
    onKeyEvent: (handler: (input: string, key: Key) => void) => {
      registered.push(handler);
      return () => {
        disposed += 1;
      };
    },
  } satisfies InkContextValue;

  function Probe(): null {
    useInput(() => {}, { isActive: true });
    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );
  assert.equal(registered.length, 1);

  commitSync(root, null);
  assert.equal(disposed, 1);
});

test("useFocus registers and exposes isFocused", () => {
  const { root } = createReactRoot();

  const registered: string[] = [];
  const unregistered: string[] = [];
  const focused: string[] = [];
  const context = {
    ...createMockContext(),
    registerFocusable: (id: string) => {
      registered.push(id);
    },
    unregisterFocusable: (id: string) => {
      unregistered.push(id);
    },
    getFocusedId: () => "focus-a",
    focusById: (id: string) => {
      focused.push(id);
    },
  } satisfies InkContextValue;

  let isFocused = false;
  let focusFn: (() => void) | undefined;

  function Probe(): null {
    const focus = useFocus({ id: "focus-a", autoFocus: true });
    isFocused = focus.isFocused;
    focusFn = focus.focus;
    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );

  assert.equal(isFocused, true);
  assert.deepEqual(registered, ["focus-a"]);
  focusFn?.();
  assert.deepEqual(focused, ["focus-a"]);

  commitSync(root, null);
  assert.deepEqual(unregistered, ["focus-a"]);
});

test("useFocusManager forwards operations", () => {
  const { root } = createReactRoot();

  const calls: string[] = [];
  const context = {
    ...createMockContext(),
    setFocusEnabled: (enabled: boolean) => {
      calls.push(enabled ? "enable" : "disable");
    },
    focusNext: () => {
      calls.push("next");
    },
    focusPrevious: () => {
      calls.push("prev");
    },
    focusById: (id: string) => {
      calls.push(`focus:${id}`);
    },
    getFocusedId: () => "active-id",
  } satisfies InkContextValue;

  let activeId = "";

  function Probe(): null {
    const fm = useFocusManager();
    fm.enableFocus();
    fm.disableFocus();
    fm.focusNext();
    fm.focusPrevious();
    fm.focus("item-1");
    activeId = fm.activeId ?? "";
    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );

  assert.deepEqual(calls, ["enable", "disable", "next", "prev", "focus:item-1"]);
  assert.equal(activeId, "active-id");
});

test("useStdin/useStdout/useStderr expose streams and write helpers", async () => {
  const { root } = createReactRoot();

  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  const outChunks: string[] = [];
  const errChunks: string[] = [];

  stdout.on("data", (chunk) => {
    outChunks.push(String(chunk));
  });
  stderr.on("data", (chunk) => {
    errChunks.push(String(chunk));
  });

  const context = {
    ...createMockContext(),
    stdin,
    stdout,
    stderr,
    isRawModeSupported: false,
    writeStdout: (data: string) => {
      stdout.write(data);
    },
    writeStderr: (data: string) => {
      stderr.write(data);
    },
  } satisfies InkContextValue;

  let sameStdin = false;
  let rawSupported = true;

  function Probe(): null {
    const sIn = useStdin();
    const sOut = useStdout();
    const sErr = useStderr();

    sameStdin = (sIn.stdin as unknown) === stdin;
    rawSupported = sIn.isRawModeSupported;

    sOut.write("hello");
    sErr.write("oops");

    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );
  await Promise.resolve();

  assert.equal(sameStdin, true);
  assert.equal(rawSupported, false);
  assert.deepEqual(outChunks.join(""), "hello");
  assert.deepEqual(errChunks.join(""), "oops");
});

test("useInput can be disabled via options", () => {
  const { root } = createReactRoot();

  let registrations = 0;

  const context = {
    ...createMockContext(),
    onKeyEvent: () => {
      registrations += 1;
      return () => {};
    },
  } satisfies InkContextValue;

  function Probe(): null {
    useInput(() => {}, { isActive: false });
    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );

  assert.equal(registrations, 0);
});

test("mock key shape helper includes expected flags", () => {
  const key = createKey();
  assert.equal(key.tab, false);
  assert.equal(key.ctrl, false);
});

test("useCursor forwards cursor positions to context", async () => {
  const { root } = createReactRoot();
  const positions: Array<{ x: number; y: number } | undefined> = [];

  const context = {
    ...createMockContext(),
    setCursorPosition: (position: { x: number; y: number } | undefined) => {
      positions.push(position);
    },
  } satisfies InkContextValue;

  function Probe(): null {
    const { setCursorPosition } = useCursor();
    React.useEffect(() => {
      setCursorPosition({ x: 2, y: 1 });
    }, [setCursorPosition]);
    return null;
  }

  commitSync(
    root,
    React.createElement(InkContext.Provider, { value: context }, React.createElement(Probe)),
  );

  await Promise.resolve();
  assert.deepEqual(positions[positions.length - 1], { x: 2, y: 1 });
});

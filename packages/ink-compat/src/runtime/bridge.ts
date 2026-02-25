import type { VNode } from "@rezi-ui/core";
import type { Readable, Writable } from "node:stream";

import { createHostContainer, type InkHostContainer } from "../reconciler/types.js";
import { translateTree } from "../translation/propsToVNode.js";
import type { InkContextValue, Key } from "./context.js";

export interface BridgeOptions {
  stdout: Writable;
  stdin: Readable;
  stderr: Writable;
  exitOnCtrlC?: boolean;
}

export interface InkBridge {
  rootNode: InkHostContainer;
  context: InkContextValue;
  translateToVNode(): VNode;
  exit(error?: Error): void;
  exitPromise: Promise<void>;
  clearOutput(): void;
  dispose(): void;
  onReactCommit(): void;
  simulateInput(data: string): void;
}

export function createBridge(options: BridgeOptions): InkBridge {
  const rootNode = createHostContainer();
  const keyListeners = new Set<(input: string, key: Key) => void>();
  const focusables = new Map<string, { autoFocus?: boolean }>();

  let focusedId: string | undefined;
  let focusEnabled = true;
  let didExit = false;

  let exitResolve: (() => void) | undefined;
  let exitReject: ((error: Error) => void) | undefined;

  const exitPromise = new Promise<void>((resolve, reject) => {
    exitResolve = resolve;
    exitReject = reject;
  });

  function exit(error?: Error): void {
    if (didExit) return;
    didExit = true;

    if (error) {
      exitReject?.(error);
      return;
    }

    exitResolve?.();
  }

  function orderedFocusIds(): string[] {
    return [...focusables.keys()];
  }

  function registerFocusable(id: string, opts?: { autoFocus?: boolean }): void {
    focusables.set(id, opts ?? {});
    if (!focusEnabled) return;

    if (opts?.autoFocus && !focusedId) {
      focusedId = id;
      return;
    }

    if (!focusedId) {
      focusedId = id;
    }
  }

  function unregisterFocusable(id: string): void {
    focusables.delete(id);

    if (focusedId !== id) return;

    const ids = orderedFocusIds();
    focusedId = ids[0];
  }

  function focusNext(): void {
    if (!focusEnabled) return;
    const ids = orderedFocusIds();
    if (ids.length === 0) return;

    const idx = focusedId ? ids.indexOf(focusedId) : -1;
    focusedId = ids[(idx + 1) % ids.length];
  }

  function focusPrevious(): void {
    if (!focusEnabled) return;
    const ids = orderedFocusIds();
    if (ids.length === 0) return;

    const idx = focusedId ? ids.indexOf(focusedId) : 0;
    focusedId = ids[(idx - 1 + ids.length) % ids.length];
  }

  const context: InkContextValue = {
    exit,
    rerender: () => {
      // No-op by default. The render() function replaces this with
      // a real rerender that creates a new element reference.
    },
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr,
    isRawModeSupported:
      typeof (options.stdin as { setRawMode?: unknown }).setRawMode === "function",
    setRawMode: (enabled: boolean) => {
      const maybe = options.stdin as { setRawMode?: (value: boolean) => void };
      maybe.setRawMode?.(enabled);
    },
    registerFocusable,
    unregisterFocusable,
    getFocusedId: () => focusedId,
    focusNext,
    focusPrevious,
    focusById: (id: string) => {
      if (!focusables.has(id)) return;
      focusedId = id;
    },
    setFocusEnabled: (enabled: boolean) => {
      focusEnabled = enabled;
      if (!enabled) return;
      if (focusedId) return;
      const ids = orderedFocusIds();
      focusedId = ids[0];
    },
    onKeyEvent: (handler: (input: string, key: Key) => void) => {
      keyListeners.add(handler);
      return () => {
        keyListeners.delete(handler);
      };
    },
  };

  return {
    rootNode,
    context,
    translateToVNode: () => translateTree(rootNode),
    exit,
    exitPromise,
    clearOutput: () => {
      options.stdout.write("\u001b[2J\u001b[H");
    },
    dispose: () => {
      keyListeners.clear();
      focusables.clear();
      rootNode.onCommit = null;
    },
    onReactCommit: () => {
      rootNode.onCommit?.();
    },
    simulateInput: (data: string) => {
      const key = parseKeyFromStdin(data);

      if (key.tab && !key.shift) {
        focusNext();
      } else if (key.tab && key.shift) {
        focusPrevious();
      }

      if (key.ctrl && data === "\u0003" && options.exitOnCtrlC !== false) {
        exit();
        return;
      }

      let input = "";
      const isSpecial =
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.return ||
        key.escape ||
        key.tab ||
        key.backspace ||
        key.delete ||
        key.pageUp ||
        key.pageDown ||
        key.home ||
        key.end;

      if (!isSpecial && !key.ctrl && !key.meta) {
        input = data;
      } else if (key.ctrl && data.length === 1) {
        const code = data.charCodeAt(0);
        if (code >= 1 && code <= 26) {
          input = String.fromCharCode(code + 96);
        }
      } else if (key.meta && data.length === 2) {
        input = data[1]!;
      }

      for (const listener of keyListeners) {
        listener(input, key);
      }
    },
  };
}

function parseKeyFromStdin(data: string): Key {
  const key: Key = {
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

  if (data === "\u001b[A") key.upArrow = true;
  else if (data === "\u001b[B") key.downArrow = true;
  else if (data === "\u001b[C") key.rightArrow = true;
  else if (data === "\u001b[D") key.leftArrow = true;
  else if (data === "\r" || data === "\n") key.return = true;
  else if (data === "\u001b") key.escape = true;
  else if (data === "\t") key.tab = true;
  else if (data === "\u001b[Z") {
    key.tab = true;
    key.shift = true;
  } else if (data === "\u007f" || data === "\b") key.backspace = true;
  else if (data === "\u001b[3~") key.delete = true;
  else if (data === "\u001b[5~") key.pageUp = true;
  else if (data === "\u001b[6~") key.pageDown = true;
  else if (data === "\u001b[H" || data === "\u001b[1~") key.home = true;
  else if (data === "\u001b[F" || data === "\u001b[4~") key.end = true;

  if (data.length === 1 && data.charCodeAt(0) > 0 && data.charCodeAt(0) < 27) {
    key.ctrl = true;
  }

  if (data.startsWith("\u001b") && data.length === 2) {
    key.meta = true;
  }

  return key;
}

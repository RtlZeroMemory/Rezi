import type { VNode } from "@rezi-ui/core";
import type { Readable, Writable } from "node:stream";

import { kittyModifiers } from "../kitty-keyboard.js";
import { createHostContainer, type InkHostContainer } from "../reconciler/types.js";
import {
  translateDynamicTree,
  translateStaticTree,
  translateTree,
} from "../translation/propsToVNode.js";
import type { InkContextValue, Key } from "./context.js";

export interface BridgeOptions {
  stdout: Writable;
  stdin: Readable;
  stderr: Writable;
  exitOnCtrlC?: boolean;
  isScreenReaderEnabled?: boolean;
  kittyKeyboard?: boolean;
}

export interface InkBridge {
  rootNode: InkHostContainer;
  context: InkContextValue;
  translateToVNode(): VNode;
  translateDynamicToVNode(): VNode;
  translateStaticToVNode(): VNode;
  hasStaticNodes(): boolean;
  exit(result?: unknown): void;
  exitPromise: Promise<unknown>;
  clearOutput(): void;
  dispose(): void;
  onReactCommit(): void;
  simulateInput(data: string): void;
}

interface ParsedInputEvent {
  consumed: number;
  input: string;
  key: Key;
}

type ParseResult = ParsedInputEvent | { incomplete: true } | null;

const ESC = "\u001b";

function createEmptyKey(): Key {
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

function mapXtermModifierBits(key: Key, modifierParam: number | undefined): void {
  if (modifierParam == null) return;
  const bits = Math.max(0, modifierParam - 1);
  key.shift = (bits & 1) !== 0;
  key.meta = (bits & 2) !== 0;
  key.ctrl = (bits & 4) !== 0;
}

function mapKittyModifierBits(key: Key, modifierParam: number | undefined): void {
  if (modifierParam == null) return;
  const bits = Math.max(0, modifierParam - 1);
  key.shift = (bits & kittyModifiers.shift) !== 0;
  const hasAlt = (bits & kittyModifiers.alt) !== 0;
  const hasMeta = (bits & kittyModifiers.meta) !== 0;
  key.meta = hasAlt || hasMeta;
  key.ctrl = (bits & kittyModifiers.ctrl) !== 0;
  key.super = (bits & kittyModifiers.super) !== 0;
  key.hyper = (bits & kittyModifiers.hyper) !== 0;
  key.capsLock = (bits & kittyModifiers.capsLock) !== 0;
  key.numLock = (bits & kittyModifiers.numLock) !== 0;
}

function parseKittyProtocolU(sequence: string): ParsedInputEvent | null {
  const match = sequence.match(/^\u001b\[(\d+)(?:;(\d+)(?::\d+)?(?:;[\d:]+)?)?u$/);
  if (!match) return null;

  const codepoint = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(codepoint) || codepoint < 0) return null;

  const modifierParam = match[2] == null ? undefined : Number.parseInt(match[2], 10);
  const key = createEmptyKey();
  mapKittyModifierBits(key, modifierParam);

  let input = "";
  if (codepoint === 9) {
    key.tab = true;
  } else if (codepoint === 13) {
    key.return = true;
  } else if (codepoint === 27) {
    key.escape = true;
  } else if (codepoint === 8 || codepoint === 127) {
    key.backspace = true;
    if (codepoint === 127) key.delete = true;
  } else if (codepoint >= 1 && codepoint <= 26) {
    key.ctrl = true;
    input = String.fromCharCode(codepoint + 96);
  } else if (codepoint >= 32 && codepoint <= 0x10ffff) {
    input = String.fromCodePoint(codepoint);
    if (input.length === 1 && /[A-Z]/.test(input)) key.shift = true;
  }

  return {
    consumed: sequence.length,
    input,
    key,
  };
}

function parseKittySpecialKey(sequence: string): ParsedInputEvent | null {
  const match = sequence.match(/^\u001b\[(\d+);(\d+):\d+([A-Za-z~])$/);
  if (!match) return null;

  const key = createEmptyKey();
  mapKittyModifierBits(key, Number.parseInt(match[2]!, 10));

  const suffix = match[3]!;
  if (suffix === "A") key.upArrow = true;
  else if (suffix === "B") key.downArrow = true;
  else if (suffix === "C") key.rightArrow = true;
  else if (suffix === "D") key.leftArrow = true;
  else if (suffix === "F") key.end = true;
  else if (suffix === "H") key.home = true;
  else if (suffix === "~") {
    const code = Number.parseInt(match[1]!, 10);
    if (code === 3) key.delete = true;
    else if (code === 5) key.pageUp = true;
    else if (code === 6) key.pageDown = true;
    else if (code === 1 || code === 7) key.home = true;
    else if (code === 4 || code === 8) key.end = true;
    else return null;
  } else {
    return null;
  }

  return {
    consumed: sequence.length,
    input: "",
    key,
  };
}

function findCsiEnd(buffer: string): number {
  for (let index = 2; index < buffer.length; index += 1) {
    const code = buffer.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index;
  }
  return -1;
}

function parseCsi(buffer: string, kittyEnabled: boolean): ParseResult {
  const endIndex = findCsiEnd(buffer);
  if (endIndex === -1) return { incomplete: true };

  const sequence = buffer.slice(0, endIndex + 1);
  if (kittyEnabled) {
    const kittyU = parseKittyProtocolU(sequence);
    if (kittyU) return kittyU;
    const kittySpecial = parseKittySpecialKey(sequence);
    if (kittySpecial) return kittySpecial;
  }

  const match = sequence.match(/^\u001b\[(?:(\d+)(?:;(\d+))?)?([A-Za-z~])$/);
  if (!match) {
    return { consumed: sequence.length, input: "", key: createEmptyKey() };
  }

  const primary = match[1] == null ? undefined : Number.parseInt(match[1], 10);
  const modifier = match[2] == null ? undefined : Number.parseInt(match[2], 10);
  const suffix = match[3]!;

  const key = createEmptyKey();
  mapXtermModifierBits(key, modifier);

  if (suffix === "A") key.upArrow = true;
  else if (suffix === "B") key.downArrow = true;
  else if (suffix === "C") key.rightArrow = true;
  else if (suffix === "D") key.leftArrow = true;
  else if (suffix === "H") key.home = true;
  else if (suffix === "F") key.end = true;
  else if (suffix === "Z") {
    key.tab = true;
    key.shift = true;
  } else if (suffix === "~") {
    if (primary === 3) key.delete = true;
    else if (primary === 5) key.pageUp = true;
    else if (primary === 6) key.pageDown = true;
    else if (primary === 1 || primary === 7) key.home = true;
    else if (primary === 4 || primary === 8) key.end = true;
  }

  return {
    consumed: sequence.length,
    input: "",
    key,
  };
}

function parseEscapedMeta(buffer: string): ParseResult {
  if (buffer.length < 2) return { incomplete: true };

  const key = createEmptyKey();
  key.meta = true;

  const next = buffer.codePointAt(1);
  if (next == null) {
    return { incomplete: true };
  }

  const char = String.fromCodePoint(next);
  const consumed = 1 + char.length;
  if (char.length === 1 && /[A-Z]/.test(char)) key.shift = true;

  return {
    consumed,
    input: char,
    key,
  };
}

function parseSingleInput(buffer: string, kittyEnabled: boolean): ParseResult {
  if (buffer.length === 0) return null;

  if (buffer.startsWith(`${ESC}[`)) {
    return parseCsi(buffer, kittyEnabled);
  }

  if (buffer.startsWith(`${ESC}O`)) {
    if (buffer.length < 3) return { incomplete: true };
    const suffix = buffer[2];
    if (!suffix) return { incomplete: true };
    const key = createEmptyKey();
    if (suffix === "A") key.upArrow = true;
    else if (suffix === "B") key.downArrow = true;
    else if (suffix === "C") key.rightArrow = true;
    else if (suffix === "D") key.leftArrow = true;
    else if (suffix === "H") key.home = true;
    else if (suffix === "F") key.end = true;
    return { consumed: 3, input: "", key };
  }

  if (buffer.startsWith(ESC)) {
    return parseEscapedMeta(buffer);
  }

  const firstCodePoint = buffer.codePointAt(0);
  if (firstCodePoint == null) return null;
  const firstChar = String.fromCodePoint(firstCodePoint);
  const consumed = firstChar.length;

  const key = createEmptyKey();
  let input = firstChar;

  if (firstChar === "\r" || firstChar === "\n") {
    key.return = true;
    input = "";
  } else if (firstChar === "\t") {
    key.tab = true;
    input = "";
  } else if (firstChar === "\u007f" || firstChar === "\b") {
    key.backspace = true;
    input = "";
  } else if (firstCodePoint >= 1 && firstCodePoint <= 26) {
    key.ctrl = true;
    input = String.fromCharCode(firstCodePoint + 96);
  } else if (firstChar.length === 1 && /[A-Z]/.test(firstChar)) {
    key.shift = true;
  }

  return { consumed, input, key };
}

export function createBridge(options: BridgeOptions): InkBridge {
  const rootNode = createHostContainer();
  const keyListeners = new Set<(input: string, key: Key) => void>();
  const focusables = new Map<string, { autoFocus?: boolean }>();

  let focusedId: string | undefined;
  let focusEnabled = true;
  let didExit = false;
  let cursorPosition: { x: number; y: number } | undefined;
  let pendingInput = "";

  let exitResolve: ((value: unknown) => void) | undefined;
  let exitReject: ((error: Error) => void) | undefined;

  const exitPromise = new Promise<unknown>((resolve, reject) => {
    exitResolve = resolve;
    exitReject = reject;
  });

  function exit(result?: unknown): void {
    if (didExit) return;
    didExit = true;

    if (result instanceof Error) {
      exitReject?.(result);
      return;
    }

    exitResolve?.(result);
  }

  function orderedFocusIds(): string[] {
    return [...focusables.keys()];
  }

  function notifyFocusMaybeChanged(before: string | undefined): void {
    if (before !== focusedId) {
      context.rerender();
    }
  }

  function registerFocusable(id: string, opts?: { autoFocus?: boolean }): void {
    const before = focusedId;
    focusables.set(id, opts ?? {});
    if (focusEnabled) {
      if (opts?.autoFocus && !focusedId) {
        focusedId = id;
      } else if (!focusedId) {
        focusedId = id;
      }
    }
    notifyFocusMaybeChanged(before);
  }

  function unregisterFocusable(id: string): void {
    const before = focusedId;
    focusables.delete(id);
    if (focusedId === id) {
      const ids = orderedFocusIds();
      focusedId = ids[0];
    }
    notifyFocusMaybeChanged(before);
  }

  function focusNext(): void {
    if (!focusEnabled) return;
    const ids = orderedFocusIds();
    if (ids.length === 0) return;
    const before = focusedId;
    const idx = focusedId ? ids.indexOf(focusedId) : -1;
    focusedId = ids[(idx + 1) % ids.length];
    notifyFocusMaybeChanged(before);
  }

  function focusPrevious(): void {
    if (!focusEnabled) return;
    const ids = orderedFocusIds();
    if (ids.length === 0) return;
    const before = focusedId;
    const idx = focusedId ? ids.indexOf(focusedId) : 0;
    focusedId = ids[(idx - 1 + ids.length) % ids.length];
    notifyFocusMaybeChanged(before);
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
    writeStdout: (data: string) => {
      options.stdout.write(data);
    },
    writeStderr: (data: string) => {
      options.stderr.write(data);
    },
    isScreenReaderEnabled: options.isScreenReaderEnabled === true,
    setCursorPosition: (position) => {
      cursorPosition = position;
    },
    getCursorPosition: () => cursorPosition,
    registerFocusable,
    unregisterFocusable,
    getFocusedId: () => focusedId,
    focusNext,
    focusPrevious,
    focusById: (id: string) => {
      if (!focusables.has(id)) return;
      const before = focusedId;
      focusedId = id;
      notifyFocusMaybeChanged(before);
    },
    setFocusEnabled: (enabled: boolean) => {
      const before = focusedId;
      focusEnabled = enabled;
      if (enabled && !focusedId) {
        const ids = orderedFocusIds();
        focusedId = ids[0];
      }
      notifyFocusMaybeChanged(before);
    },
    onKeyEvent: (handler: (input: string, key: Key) => void) => {
      keyListeners.add(handler);
      return () => {
        keyListeners.delete(handler);
      };
    },
  };

  const hasStaticNodes = (): boolean => {
    const stack = [...rootNode.children];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;

      if (node.type === "ink-box" && node.props["__inkStatic"] === true) {
        return true;
      }

      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index];
        if (child) stack.push(child);
      }
    }

    return false;
  };

  return {
    rootNode,
    context,
    translateToVNode: () => translateTree(rootNode),
    translateDynamicToVNode: () => translateDynamicTree(rootNode),
    translateStaticToVNode: () => translateStaticTree(rootNode),
    hasStaticNodes,
    exit,
    exitPromise,
    clearOutput: () => {
      options.stdout.write("\u001b[2J\u001b[H");
    },
    dispose: () => {
      keyListeners.clear();
      focusables.clear();
      rootNode.onCommit = null;
      pendingInput = "";
    },
    onReactCommit: () => {
      rootNode.onCommit?.();
    },
    simulateInput: (data: string) => {
      if (data.length === 0) return;
      pendingInput += data;

      while (pendingInput.length > 0) {
        const parsed = parseSingleInput(pendingInput, options.kittyKeyboard === true);
        if (parsed == null) {
          pendingInput = pendingInput.slice(1);
          continue;
        }
        if ("incomplete" in parsed) {
          break;
        }

        pendingInput = pendingInput.slice(parsed.consumed);
        const { key } = parsed;
        const focusedBeforeInput = focusedId;

        if (key.tab && !key.shift) {
          focusNext();
        } else if (key.tab && key.shift) {
          focusPrevious();
        }

        const ctrlC = key.ctrl && parsed.input.toLowerCase() === "c";
        if (ctrlC && options.exitOnCtrlC !== false) {
          exit();
          return;
        }

        for (const listener of keyListeners) {
          listener(parsed.input, key);
        }

        if (focusedBeforeInput !== focusedId) {
          context.rerender();
        }
      }
    },
  };
}

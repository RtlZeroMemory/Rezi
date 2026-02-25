import type { Readable, Writable } from "node:stream";
import React from "react";

export interface CursorPosition {
  x: number;
  y: number;
}

export interface InkContextValue {
  exit: (result?: unknown) => void;
  rerender: () => void;

  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isRawModeSupported: boolean;
  setRawMode: (enabled: boolean) => void;
  writeStdout: (data: string) => void;
  writeStderr: (data: string) => void;
  isScreenReaderEnabled: boolean;
  setCursorPosition: (position: CursorPosition | undefined) => void;
  getCursorPosition: () => CursorPosition | undefined;

  registerFocusable: (id: string, opts?: { autoFocus?: boolean }) => void;
  unregisterFocusable: (id: string) => void;
  getFocusedId: () => string | undefined;
  focusNext: () => void;
  focusPrevious: () => void;
  focusById: (id: string) => void;
  setFocusEnabled: (enabled: boolean) => void;

  onKeyEvent: (handler: (input: string, key: Key) => void) => () => void;
}

export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  pageUp: boolean;
  pageDown: boolean;
  home: boolean;
  end: boolean;
  meta: boolean;
  capsLock: boolean;
  numLock: boolean;
  super: boolean;
  hyper: boolean;
}

export const InkContext = React.createContext<InkContextValue | null>(null);

export function useInkContext(): InkContextValue {
  const ctx = React.useContext(InkContext);
  if (!ctx) {
    throw new Error("Ink hooks can only be used inside an Ink render tree.");
  }
  return ctx;
}

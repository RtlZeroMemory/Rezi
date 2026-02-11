/**
 * blessed benchmark backend.
 *
 * Creates a blessed Screen that outputs to an in-memory Writable,
 * similar to the MeasuringStream approach used for Ink benchmarks.
 */

import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";

const require = createRequire(import.meta.url);

// biome-ignore lint/suspicious/noExplicitAny: blessed has no type definitions
type BlessedModule = any;

export interface BlessedContext {
  screen: {
    render: () => void;
    destroy: () => void;
    append: (el: unknown) => void;
    remove: (el: unknown) => void;
    children: unknown[];
  };
  blessed: BlessedModule;
  /** Flush program buffer to the output stream. */
  flush(): void;
  /** Total bytes written to the output stream since last resetBytes(). */
  totalBytes: number;
  /** Reset byte counter. */
  resetBytes(): void;
  /** Remove all children except the screen itself, then re-render. */
  clearChildren(): void;
  /** Clean up blessed resources. */
  dispose(): void;
}

// Cache the module
let _blessed: BlessedModule | null = null;
function getBlessed(): BlessedModule {
  if (!_blessed) {
    _blessed = require("blessed");
  }
  return _blessed;
}

/**
 * Create a blessed Screen that outputs to an in-memory Writable.
 */
export function createBlessedContext(cols: number, rows: number): BlessedContext {
  const blessed = getBlessed();

  let totalBytes = 0;

  const measureStream = new Writable({
    write(
      chunk: Buffer | string,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ) {
      totalBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
      callback();
    },
    highWaterMark: 1024 * 1024,
  });

  // blessed needs a stream that looks like a TTY
  Object.defineProperty(measureStream, "columns", { value: cols, writable: true });
  Object.defineProperty(measureStream, "rows", { value: rows, writable: true });
  Object.defineProperty(measureStream, "isTTY", { value: true });

  const nullInput = new Readable({ read() {} }) as Readable & {
    setRawMode?: (mode: boolean) => unknown;
  };
  Object.defineProperty(nullInput, "isTTY", { value: false });
  // blessed calls setRawMode on stdin
  nullInput.setRawMode = () => nullInput;

  const screen = blessed.screen({
    output: measureStream,
    input: nullInput,
    smartCSR: true,
    autoPadding: false,
    mouse: false,
    cursor: { artificial: true, shape: "block", blink: false },
    fullUnicode: false,
    warnings: false,
    // Prevent blessed from taking over signal handlers
    resizeTimeout: 0,
  });

  return {
    screen,
    blessed,
    flush() {
      if (screen.program?.flush) {
        screen.program.flush();
      }
    },
    get totalBytes() {
      return totalBytes;
    },
    resetBytes() {
      totalBytes = 0;
    },
    clearChildren() {
      while (screen.children.length > 0) {
        screen.remove(screen.children[0]);
      }
    },
    dispose() {
      try {
        screen.destroy();
      } catch {
        // blessed can throw on cleanup — ignore
      }
      measureStream.destroy();
      nullInput.destroy();
    },
  };
}

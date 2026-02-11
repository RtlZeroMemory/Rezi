/**
 * terminal-kit benchmark backend.
 *
 * Creates a ScreenBuffer → Terminal pipeline that writes to an
 * in-memory Writable, matching the MeasuringStream approach used
 * for Ink benchmarks. No real terminal I/O occurs.
 */

import { createRequire } from "node:module";
import { Writable } from "node:stream";

const require = createRequire(import.meta.url);

// biome-ignore lint/suspicious/noExplicitAny: terminal-kit has no type definitions
type TermkitModule = any;

export interface TermkitContext {
  /** The ScreenBuffer to render into. */
  buffer: {
    put: (opts: Record<string, unknown>, str: string) => void;
    fill: (opts?: Record<string, unknown>) => void;
    draw: (opts: { delta: boolean }) => void;
    width: number;
    height: number;
  };
  /** Total bytes written to the output stream since last resetBytes(). */
  totalBytes: number;
  /** Reset byte counter without resetting the buffer state. */
  resetBytes(): void;
  /** Full reset: bytes + buffer fill. */
  reset(): void;
  /** Clean up terminal-kit resources. */
  dispose(): void;
}

/**
 * Create a terminal-kit ScreenBuffer → Terminal pipeline that outputs
 * to an in-memory Writable for benchmarking.
 */
// Cache the module — loading it once is the fair approach since
// all other frameworks also only pay import cost once.
let _termkit: TermkitModule | null = null;
function getTermkit(): TermkitModule {
  if (!_termkit) {
    _termkit = require("terminal-kit");
    // terminal-kit registers exit/beforeExit listeners on each createTerminal;
    // raise the cap to avoid spurious warnings during bench loops.
    process.setMaxListeners(Math.max(process.getMaxListeners(), 200));
  }
  return _termkit;
}

export function createTermkitContext(cols: number, rows: number): TermkitContext {
  const termkit = getTermkit();

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
    // High watermark to avoid backpressure during benchmarks
    highWaterMark: 1024 * 1024,
  });

  const term = termkit.createTerminal({
    stdout: measureStream,
    stdin: process.stdin,
    generic: "xterm-256color",
    processSigwinch: false,
  });

  const buffer = new termkit.ScreenBuffer({
    dst: term,
    width: cols,
    height: rows,
    noFill: false,
  });

  return {
    buffer,
    get totalBytes() {
      return totalBytes;
    },
    resetBytes() {
      totalBytes = 0;
    },
    reset() {
      totalBytes = 0;
      buffer.fill();
    },
    dispose() {
      measureStream.destroy();
    },
  };
}

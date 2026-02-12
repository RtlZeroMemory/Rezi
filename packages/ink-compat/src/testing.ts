import { PassThrough, Writable } from "node:stream";

import type { ReactElement } from "react";

import { type RenderOptions, type RenderResult, render as compatRender } from "./render.js";

export class TestingStdout extends Writable {
  public readonly isTTY: boolean;
  public readonly columns: number;
  public readonly frames: string[] = [];

  #lastFrame: string | undefined;

  constructor(options: Readonly<{ isTTY: boolean; columns: number }>) {
    super();
    this.isTTY = options.isTTY;
    this.columns = options.columns;
  }

  _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const frame = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    this.frames.push(frame);
    this.#lastFrame = frame;
    callback();
  }

  public lastFrame(): string | undefined {
    return this.#lastFrame;
  }

  public getColorDepth(_env?: Record<string, unknown>): number {
    return this.isTTY ? 8 : 1;
  }

  public hasColors(_count?: number, _env?: Record<string, unknown>): boolean {
    return this.isTTY;
  }
}

export class TestingStderr extends Writable {
  public readonly isTTY: boolean;
  public readonly columns: number;
  public readonly frames: string[] = [];

  #lastFrame: string | undefined;

  constructor(options: Readonly<{ isTTY: boolean; columns: number }>) {
    super();
    this.isTTY = options.isTTY;
    this.columns = options.columns;
  }

  _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const frame = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    this.frames.push(frame);
    this.#lastFrame = frame;
    callback();
  }

  public lastFrame(): string | undefined {
    return this.#lastFrame;
  }

  public getColorDepth(_env?: Record<string, unknown>): number {
    return this.isTTY ? 8 : 1;
  }

  public hasColors(_count?: number, _env?: Record<string, unknown>): boolean {
    return this.isTTY;
  }
}

export type TestingStdin = PassThrough & NodeJS.ReadStream;

function createTestingStdin(isTTY = true): TestingStdin {
  const stdin = new PassThrough() as TestingStdin;
  stdin.isTTY = isTTY;
  stdin.isRaw = false;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  stdin.setRawMode = (mode: boolean) => {
    stdin.isRaw = mode;
    return stdin;
  };
  stdin.setEncoding("utf8");
  stdin.resume();
  return stdin;
}

export type TestingRenderOptions = Omit<RenderOptions, "stdout" | "stderr" | "stdin"> &
  Readonly<{
    stdout?: TestingStdout;
    stderr?: TestingStderr;
    stdin?: TestingStdin;
    isTTY?: boolean;
    columns?: number;
  }>;

export type TestingRenderResult = Readonly<{
  rerender: (tree: ReactElement) => void;
  unmount: () => void;
  cleanup: () => void;
  stdout: TestingStdout;
  stderr: TestingStderr;
  stdin: TestingStdin;
  frames: string[];
  lastFrame: () => string | undefined;
}>;

type ActiveRenderEntry = Readonly<{
  unmount: () => void;
  cleanup: () => void;
}>;

const activeRenders = new Set<ActiveRenderEntry>();

export function render(
  tree: ReactElement,
  options: TestingRenderOptions = {},
): TestingRenderResult {
  const {
    stdout: customStdout,
    stderr: customStderr,
    stdin: customStdin,
    isTTY = false,
    columns = 100,
    ...renderOptions
  } = options;

  const stdout = customStdout ?? new TestingStdout({ isTTY, columns });
  const stderr = customStderr ?? new TestingStderr({ isTTY, columns });
  const stdin = customStdin ?? createTestingStdin(isTTY);

  const app = compatRender(tree, {
    ...renderOptions,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin,
    debug: renderOptions.debug ?? true,
    exitOnCtrlC: renderOptions.exitOnCtrlC ?? false,
    patchConsole: renderOptions.patchConsole ?? false,
  });

  let cleaned = false;
  const entry: ActiveRenderEntry = {
    unmount: app.unmount,
    cleanup: () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      activeRenders.delete(entry);
      app.cleanup();
    },
  };

  activeRenders.add(entry);

  return {
    rerender: (nextTree) => {
      app.rerender(nextTree);
    },
    unmount: entry.unmount,
    cleanup: entry.cleanup,
    stdout,
    stderr,
    stdin,
    frames: stdout.frames,
    lastFrame: () => stdout.lastFrame(),
  };
}

export function cleanup(): void {
  const entries = [...activeRenders];
  activeRenders.clear();

  for (const entry of entries) {
    entry.unmount();
    entry.cleanup();
  }
}

export type { RenderResult };

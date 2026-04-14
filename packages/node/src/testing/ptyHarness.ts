import pty from "node-pty";
import { createTerminalScreen } from "./screen.js";
import type { TerminalScreenSnapshot } from "./screen.js";

export interface PtyExitResult {
  readonly exitCode: number;
  readonly signal?: number;
}

export interface StartPtyHarnessOptions {
  readonly cwd: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cols: number;
  readonly rows: number;
}

export interface PtyHarness {
  readonly pid: number;
  write(data: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  snapshot(): TerminalScreenSnapshot;
  rawOutput(): Uint8Array;
  waitForExit(): Promise<PtyExitResult>;
  kill(signal?: string): void;
}

export async function startPtyHarness(opts: StartPtyHarnessOptions): Promise<PtyHarness> {
  const screen = createTerminalScreen({ cols: opts.cols, rows: opts.rows });
  const filteredEnv = Object.fromEntries(
    Object.entries(opts.env ?? {}).filter(([, value]) => value !== undefined),
  ) as Readonly<Record<string, string> & { FORCE_COLOR?: string }>;
  const term = pty.spawn(opts.command, [...(opts.args ?? [])], {
    name: process.platform === "win32" ? "xterm" : "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: {
      ...filteredEnv,
      TERM: process.platform === "win32" ? "xterm" : "xterm-256color",
      COLUMNS: String(opts.cols),
      LINES: String(opts.rows),
      FORCE_COLOR: filteredEnv.FORCE_COLOR ?? "1",
    },
  });

  const raw: Buffer[] = [];
  const exitPromise = new Promise<PtyExitResult>((resolve) => {
    term.onExit((event) => {
      resolve(
        Object.freeze({
          exitCode: event.exitCode,
          ...(event.signal === undefined ? {} : { signal: event.signal }),
        }),
      );
    });
  });

  term.onData((chunk) => {
    raw.push(Buffer.from(chunk, "utf8"));
    void screen.write(chunk);
  });

  return Object.freeze({
    pid: term.pid,
    write: async (data: string) => {
      term.write(data);
      await screen.flush();
    },
    resize: async (cols: number, rows: number) => {
      term.resize(cols, rows);
      await screen.resize(cols, rows);
    },
    snapshot: () => screen.snapshot(),
    rawOutput: () => Uint8Array.from(Buffer.concat(raw)),
    waitForExit: async () => {
      const result = await exitPromise;
      await screen.flush();
      return result;
    },
    kill: (signal?: string) => {
      term.kill(signal);
    },
  });
}

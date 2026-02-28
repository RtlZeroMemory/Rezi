import { createHash } from "node:crypto";
import xtermHeadless from "@xterm/headless";

export type ScreenSnapshot = Readonly<{
  cols: number;
  rows: number;
  lines: readonly string[];
  hash: string;
}>;

export function createScreen(opts: Readonly<{ cols: number; rows: number }>): {
  write: (data: string) => Promise<void>;
  flush: () => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  snapshot: () => ScreenSnapshot;
} {
  type HeadlessLine = { translateToString(trimRight?: boolean): string };
  type HeadlessTerminal = {
    write(data: string, callback?: () => void): void;
    resize(cols: number, rows: number): void;
    buffer: { active: { getLine(row: number): HeadlessLine | undefined } };
  };
  type HeadlessTerminalCtor = new (opts: {
    cols: number;
    rows: number;
    allowProposedApi: boolean;
    convertEol: boolean;
    scrollback: number;
  }) => HeadlessTerminal;

  const Terminal = (xtermHeadless as unknown as { Terminal?: unknown }).Terminal;
  if (typeof Terminal !== "function") {
    throw new Error("Unexpected @xterm/headless shape: missing Terminal export");
  }
  let cols = opts.cols;
  let rows = opts.rows;

  const term = new (Terminal as HeadlessTerminalCtor)({
    cols,
    rows,
    allowProposedApi: true,
    convertEol: false,
    scrollback: 0,
  });

  let pending = Promise.resolve();
  const write = async (data: string): Promise<void> => {
    pending = pending.then(
      () =>
        new Promise<void>((resolve) => {
          term.write(data, resolve);
        }),
    );
    await pending;
  };

  const flush = async (): Promise<void> => {
    await pending;
  };

  const resize = async (nextCols: number, nextRows: number): Promise<void> => {
    cols = nextCols;
    rows = nextRows;
    pending = pending.then(() => {
      term.resize(nextCols, nextRows);
    });
    await pending;
  };

  const snapshot = (): ScreenSnapshot => {
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      const line = term.buffer.active.getLine(r);
      const text = line?.translateToString(false) ?? "";
      lines.push(text.padEnd(cols, " ").slice(0, cols));
    }
    const hash = createHash("sha256").update(lines.join("\n")).digest("hex");
    return { cols, rows, lines, hash };
  };

  return { write, flush, resize, snapshot };
}

import xtermHeadless from "@xterm/headless";
import { createHash } from "node:crypto";

export type ScreenSnapshot = Readonly<{
  cols: number;
  rows: number;
  lines: readonly string[];
  hash: string;
}>;

export function createScreen(opts: Readonly<{ cols: number; rows: number }>): {
  write: (data: string) => Promise<void>;
  flush: () => Promise<void>;
  snapshot: () => ScreenSnapshot;
} {
  const Terminal = (xtermHeadless as unknown as { Terminal?: unknown }).Terminal;
  if (typeof Terminal !== "function") {
    throw new Error("Unexpected @xterm/headless shape: missing Terminal export");
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const term = new (Terminal as any)({
    cols: opts.cols,
    rows: opts.rows,
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

  const snapshot = (): ScreenSnapshot => {
    const lines: string[] = [];
    for (let r = 0; r < opts.rows; r++) {
      const line = term.buffer.active.getLine(r);
      const text = line?.translateToString(false) ?? "";
      lines.push(text.padEnd(opts.cols, " ").slice(0, opts.cols));
    }
    const hash = createHash("sha256").update(lines.join("\n")).digest("hex");
    return { cols: opts.cols, rows: opts.rows, lines, hash };
  };

  return { write, flush, snapshot };
}

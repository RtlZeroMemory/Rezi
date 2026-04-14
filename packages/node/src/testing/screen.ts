import xtermHeadless from "@xterm/headless";
import type { ScenarioScreenSnapshot } from "@rezi-ui/core/testing";

export type TerminalScreenCursor =
  | Readonly<{ visible: false; x: number; y: number }>
  | Readonly<{ visible: true; x: number; y: number }>;

export type TerminalScreenSnapshot = Readonly<{
  screen: ScenarioScreenSnapshot;
  cursor: TerminalScreenCursor;
}>;

type HeadlessLine = { translateToString(trimRight?: boolean): string };
type HeadlessTerminal = {
  write(data: string, callback?: () => void): void;
  resize(cols: number, rows: number): void;
  buffer: {
    active: {
      cursorX: number;
      cursorY: number;
      getLine(row: number): HeadlessLine | undefined;
    };
  };
  _core?: {
    _inputHandler?: {
      _coreService?: {
        isCursorHidden?: boolean;
      };
    };
  };
};
type HeadlessTerminalCtor = new (opts: {
  cols: number;
  rows: number;
  allowProposedApi: boolean;
  convertEol: boolean;
  scrollback: number;
}) => HeadlessTerminal;

export function createTerminalScreen(opts: Readonly<{ cols: number; rows: number }>): {
  write: (data: string) => Promise<void>;
  flush: () => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  snapshot: () => TerminalScreenSnapshot;
} {
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

  const snapshot = (): TerminalScreenSnapshot => {
    const lines: string[] = [];
    for (let row = 0; row < rows; row++) {
      const line = term.buffer.active.getLine(row);
      const text = line?.translateToString(false) ?? "";
      lines.push(text.padEnd(cols, " ").slice(0, cols));
    }
    const hidden = term._core?._inputHandler?._coreService?.isCursorHidden === true;
    const cursor = hidden
      ? Object.freeze({
          visible: false as const,
          x: term.buffer.active.cursorX,
          y: term.buffer.active.cursorY,
        })
      : Object.freeze({
          visible: true as const,
          x: term.buffer.active.cursorX,
          y: term.buffer.active.cursorY,
        });
    return Object.freeze({
      screen: Object.freeze({ cols, rows, lines: Object.freeze(lines) }),
      cursor,
    });
  };

  return Object.freeze({ write, flush, resize, snapshot });
}

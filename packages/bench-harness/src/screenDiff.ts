import type { ScreenSnapshot } from "./screen.js";

export type ScreenDiff = Readonly<{
  equal: boolean;
  firstDiffRow: number | null;
  aLine: string | null;
  bLine: string | null;
}>;

export function diffScreens(a: ScreenSnapshot, b: ScreenSnapshot): ScreenDiff {
  if (a.cols !== b.cols || a.rows !== b.rows) {
    return {
      equal: false,
      firstDiffRow: null,
      aLine: `size=${a.cols}x${a.rows}`,
      bLine: `size=${b.cols}x${b.rows}`,
    };
  }
  for (let i = 0; i < a.lines.length; i++) {
    const aLine = a.lines[i];
    const bLine = b.lines[i];
    if (aLine !== bLine) {
      return { equal: false, firstDiffRow: i + 1, aLine: aLine ?? null, bLine: bLine ?? null };
    }
  }
  return { equal: true, firstDiffRow: null, aLine: null, bLine: null };
}


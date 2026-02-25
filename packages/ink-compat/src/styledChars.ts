import { measureTextCells } from "@rezi-ui/core";

/**
 * StyledChar utilities — text measurement and wrapping with ANSI awareness.
 *
 * These are from the @jrichman/ink fork, used in Gemini CLI's TableRenderer
 * for calculating column widths and wrapping styled text.
 *
 * A StyledChar represents a single terminal character with its associated
 * ANSI styling (colors, bold, etc.). Operating on StyledChar arrays allows
 * correct width measurement even in the presence of ANSI escape codes.
 */

export interface StyledChar {
  char: string;
  /** ANSI escape prefix applied before this character */
  style: string;
}

interface SgrState {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  inverse: boolean;
  fg: string | undefined;
  bg: string | undefined;
}

function createDefaultSgrState(): SgrState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
    fg: undefined,
    bg: undefined,
  };
}

function parseSgrParams(sequence: string): number[] {
  const body = sequence.slice(2, -1);
  if (body.length === 0) return [0];

  const params = body
    .split(/[;:]/)
    .filter((segment) => segment.length > 0)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((value) => Number.isFinite(value));

  return params.length > 0 ? params : [0];
}

function applySgrParams(state: SgrState, params: number[]): void {
  for (let index = 0; index < params.length; index += 1) {
    const code = params[index];
    if (code == null) continue;

    if (code === 0) {
      const reset = createDefaultSgrState();
      state.bold = reset.bold;
      state.dim = reset.dim;
      state.italic = reset.italic;
      state.underline = reset.underline;
      state.strikethrough = reset.strikethrough;
      state.inverse = reset.inverse;
      state.fg = reset.fg;
      state.bg = reset.bg;
      continue;
    }

    if (code === 1) {
      state.bold = true;
      continue;
    }
    if (code === 2) {
      state.dim = true;
      continue;
    }
    if (code === 3) {
      state.italic = true;
      continue;
    }
    if (code === 4) {
      state.underline = true;
      continue;
    }
    if (code === 7) {
      state.inverse = true;
      continue;
    }
    if (code === 9) {
      state.strikethrough = true;
      continue;
    }
    if (code === 22) {
      state.bold = false;
      state.dim = false;
      continue;
    }
    if (code === 23) {
      state.italic = false;
      continue;
    }
    if (code === 24) {
      state.underline = false;
      continue;
    }
    if (code === 27) {
      state.inverse = false;
      continue;
    }
    if (code === 29) {
      state.strikethrough = false;
      continue;
    }
    if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      state.fg = String(code);
      continue;
    }
    if (code === 39) {
      state.fg = undefined;
      continue;
    }
    if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      state.bg = String(code);
      continue;
    }
    if (code === 49) {
      state.bg = undefined;
      continue;
    }
    if (code === 38 || code === 48) {
      const isForeground = code === 38;
      const target = isForeground ? "fg" : "bg";
      const mode = params[index + 1];
      if (mode === 5) {
        const color = params[index + 2];
        if (color != null) {
          state[target] = `${code};5;${color}`;
          index += 2;
        }
      } else if (mode === 2) {
        const r = params[index + 2];
        const g = params[index + 3];
        const b = params[index + 4];
        if (r != null && g != null && b != null) {
          state[target] = `${code};2;${r};${g};${b}`;
          index += 4;
        }
      }
    }
  }
}

function serializeSgrState(state: SgrState): string {
  const codes: string[] = [];
  if (state.bold) codes.push("1");
  if (state.dim) codes.push("2");
  if (state.italic) codes.push("3");
  if (state.underline) codes.push("4");
  if (state.inverse) codes.push("7");
  if (state.strikethrough) codes.push("9");
  if (state.fg) codes.push(state.fg);
  if (state.bg) codes.push(state.bg);
  return codes.length > 0 ? `\u001b[${codes.join(";")}m` : "";
}

/**
 * Convert a plain string (potentially with ANSI escapes) into StyledChar[].
 * Each printable character gets associated with the most recent ANSI style prefix.
 */
export function toStyledCharacters(text: string): StyledChar[] {
  const result: StyledChar[] = [];
  const ansiRegex = /\u001b\[[0-9:;]*m/g;
  const currentState = createDefaultSgrState();
  let currentStyle = "";
  let lastIndex = 0;

  for (const match of text.matchAll(ansiRegex)) {
    const matchIndex = match.index;
    if (matchIndex == null) continue;
    // Characters between last match and this match get current style
    const segment = text.slice(lastIndex, matchIndex);
    for (const char of segment) {
      result.push({ char, style: currentStyle });
    }

    applySgrParams(currentState, parseSgrParams(match[0]));
    currentStyle = serializeSgrState(currentState);
    lastIndex = matchIndex + match[0].length;
  }

  // Remaining characters after last ANSI escape
  const remaining = text.slice(lastIndex);
  for (const char of remaining) {
    result.push({ char, style: currentStyle });
  }

  return result;
}

/**
 * Convert StyledChar[] back to a string (with ANSI escapes preserved).
 */
export function styledCharsToString(chars: StyledChar[]): string {
  let result = "";
  let prevStyle = "";

  for (const sc of chars) {
    if (sc.style !== prevStyle) {
      if (prevStyle) {
        result += "\u001b[0m";
      }
      if (sc.style) {
        result += sc.style;
      }
      prevStyle = sc.style;
    }
    result += sc.char;
  }

  // Reset at end if we applied any styles
  if (prevStyle) {
    result += "\u001b[0m";
  }

  return result;
}

/**
 * Calculate the visual display width of StyledChar[] (in terminal columns).
 * Ignores ANSI escapes; counts visible characters.
 * Wide characters (CJK) count as 2 columns.
 */
export function styledCharsWidth(chars: StyledChar[]): number {
  const text = chars.map((sc) => sc.char).join("");
  return Math.max(0, measureTextCells(text));
}

/**
 * Break StyledChar[] into word segments (split on whitespace).
 * Returns an array of "words" — each word is a StyledChar[].
 */
export function wordBreakStyledChars(chars: StyledChar[]): StyledChar[][] {
  const words: StyledChar[][] = [];
  let current: StyledChar[] = [];

  for (const sc of chars) {
    if (sc.char === " " || sc.char === "\t") {
      if (current.length > 0) {
        words.push(current);
        current = [];
      }
    } else {
      current.push(sc);
    }
  }

  if (current.length > 0) {
    words.push(current);
  }

  return words;
}

/**
 * Wrap StyledChar[] to fit within `maxWidth` columns.
 * Returns an array of lines, each line being a StyledChar[].
 */
export function wrapStyledChars(chars: StyledChar[], maxWidth: number): StyledChar[][] {
  if (maxWidth <= 0) return [chars];

  const words = wordBreakStyledChars(chars);
  const lines: StyledChar[][] = [];
  let currentLine: StyledChar[] = [];
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = styledCharsWidth(word);

    if (currentLine.length === 0) {
      // First word on line — always add it even if it overflows
      currentLine = [...word];
      currentWidth = wordWidth;
    } else if (currentWidth + 1 + wordWidth <= maxWidth) {
      // Fits with a space separator
      currentLine.push({ char: " ", style: "" });
      currentLine.push(...word);
      currentWidth += 1 + wordWidth;
    } else {
      // Doesn't fit — wrap to new line
      lines.push(currentLine);
      currentLine = [...word];
      currentWidth = wordWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    lines.push([]);
  }

  return lines;
}

/**
 * Find the widest line width from an array of lines (StyledChar[][]).
 */
export function widestLineFromStyledChars(lines: StyledChar[][]): number {
  let max = 0;
  for (const line of lines) {
    const w = styledCharsWidth(line);
    if (w > max) max = w;
  }
  return max;
}

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

/**
 * Convert a plain string (potentially with ANSI escapes) into StyledChar[].
 * Each printable character gets associated with the most recent ANSI style prefix.
 */
export function toStyledCharacters(text: string): StyledChar[] {
  const result: StyledChar[] = [];
  // biome-ignore lint: ANSI escape regex is complex by necessity
  const ansiRegex = /\u001b\[[0-9;]*m/g;
  let currentStyle = "";
  let lastIndex = 0;

  for (const match of text.matchAll(ansiRegex)) {
    // Characters between last match and this match get current style
    const segment = text.slice(lastIndex, match.index);
    for (const char of segment) {
      result.push({ char, style: currentStyle });
    }
    currentStyle += match[0];
    lastIndex = match.index! + match[0].length;
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
      result += sc.style;
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
  let width = 0;
  for (const sc of chars) {
    // Simple heuristic: CJK characters are 2 columns wide
    const code = sc.char.codePointAt(0) ?? 0;
    if (
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compat Ideographs
      (code >= 0xfe10 && code <= 0xfe6f) || // CJK forms
      (code >= 0xff01 && code <= 0xff60) || // Fullwidth
      (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
      (code >= 0x20000 && code <= 0x2fffd) || // CJK Extension B+
      (code >= 0x30000 && code <= 0x3fffd) // CJK Extension G+
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
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

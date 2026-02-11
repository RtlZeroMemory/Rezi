import { clearTextMeasureCache, measureTextCells } from "@rezi-ui/core";

const WIDTH_CACHE_MAX = 4096;

export type StringWidth = (text: string) => number;

export type AnsiCode = Readonly<{
  type: "ansi";
  code: string;
  endCode: string;
}>;

export type StyledChar = Readonly<{
  type: "char";
  value: string;
  fullWidth: boolean;
  styles: readonly AnsiCode[];
}>;

let customStringWidth: StringWidth | null = null;
const widthCache = new Map<string, number>();

function clearLocalWidthCache(): void {
  widthCache.clear();
}

function evictOldestWidthCacheEntry(): void {
  const oldest = widthCache.keys().next();
  if (oldest.done === true) return;
  widthCache.delete(oldest.value);
}

function computeWidth(text: string): number {
  if (text.length === 0) return 0;

  const cached = widthCache.get(text);
  if (cached !== undefined) return cached;

  const raw = customStringWidth ? customStringWidth(text) : measureTextCells(text);
  const width = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;

  if (!widthCache.has(text) && widthCache.size >= WIDTH_CACHE_MAX) {
    evictOldestWidthCacheEntry();
  }
  widthCache.set(text, width);
  return width;
}

export function setStringWidthFunction(fn: StringWidth): void {
  customStringWidth = fn;
  clearStringWidthCache();
}

export function clearStringWidthCache(): void {
  clearLocalWidthCache();
  clearTextMeasureCache();
}

export function toStyledCharacters(text: string): StyledChar[] {
  if (text.length === 0) return [];

  const out: StyledChar[] = [];
  let i = 0;
  let activeStyles: AnsiCode[] = [];

  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined) break;

    // Parse CSI SGR sequences: \x1b[...m
    if (ch === "\u001b" && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length) {
        const c = text[j];
        if (c === undefined) break;
        if ((c >= "0" && c <= "9") || c === ";" || c === "?") {
          j++;
          continue;
        }
        break;
      }

      if (text[j] === "m") {
        const code = text.slice(i, j + 1);
        if (code === "\u001b[0m") activeStyles = [];
        else activeStyles = [...activeStyles, { type: "ansi", code, endCode: "\u001b[0m" }];
        i = j + 1;
        continue;
      }
    }

    // Iterate by codepoint; grapheme-level behavior is handled by width function.
    const cp = text.codePointAt(i);
    if (cp === undefined) break;
    const value = String.fromCodePoint(cp);
    const fullWidth = computeWidth(value) > 1;
    out.push({
      type: "char",
      value,
      fullWidth,
      styles: activeStyles,
    });
    i += value.length;
  }

  return out;
}

export function styledCharsToString(styledChars: StyledChar[]): string {
  if (styledChars.length === 0) return "";

  let out = "";
  let prevKey = "";
  for (const ch of styledChars) {
    const codes = ch.styles.map((s) => s.code).join("");
    if (codes !== prevKey) {
      if (prevKey.length > 0) out += "\u001b[0m";
      if (codes.length > 0) out += codes;
      prevKey = codes;
    }
    out += ch.value;
  }
  if (prevKey.length > 0) out += "\u001b[0m";
  return out;
}

export function inkCharacterWidth(text: string): number {
  return computeWidth(text);
}

export function styledCharsWidth(styledChars: StyledChar[]): number {
  let width = 0;
  for (const ch of styledChars) {
    width += computeWidth(ch.value);
  }
  return width;
}

function splitCharOnNewline(ch: StyledChar): StyledChar[][] {
  if (!ch.value.includes("\n")) return [[ch]];
  const parts = ch.value.split("\n");
  const out: StyledChar[][] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    out.push(
      part.length === 0
        ? []
        : [
            {
              ...ch,
              value: part,
            },
          ],
    );
  }
  return out;
}

function splitStyledCharsByNewline(styledChars: StyledChar[]): StyledChar[][] {
  const lines: StyledChar[][] = [[]];

  for (const ch of styledChars) {
    const parts = splitCharOnNewline(ch);
    if (parts.length === 1) {
      const line = lines[lines.length - 1];
      if (!line) continue;
      line.push(ch);
      continue;
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? [];
      const line = lines[lines.length - 1];
      if (!line) continue;
      line.push(...part);
      if (i < parts.length - 1) lines.push([]);
    }
  }

  return lines;
}

function isWhitespaceChar(ch: StyledChar): boolean {
  // StyledChar tokens are grapheme-like chunks; use Unicode whitespace matching.
  return /^\s$/u.test(ch.value);
}

export function wordBreakStyledChars(styledChars: StyledChar[]): StyledChar[][] {
  const words: StyledChar[][] = [];
  let current: StyledChar[] = [];
  let currentWhitespace: boolean | null = null;

  for (const ch of styledChars) {
    if (ch.value.includes("\n")) {
      const parts = splitCharOnNewline(ch);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] ?? [];
        for (const piece of part) {
          const ws = isWhitespaceChar(piece);
          if (currentWhitespace === null || currentWhitespace === ws) {
            current.push(piece);
            currentWhitespace = ws;
            continue;
          }
          if (current.length > 0) words.push(current);
          current = [piece];
          currentWhitespace = ws;
        }
        if (i < parts.length - 1) {
          if (current.length > 0) words.push(current);
          current = [];
          currentWhitespace = null;
        }
      }
      continue;
    }

    const ws = isWhitespaceChar(ch);
    if (currentWhitespace === null || currentWhitespace === ws) {
      current.push(ch);
      currentWhitespace = ws;
      continue;
    }

    if (current.length > 0) words.push(current);
    current = [ch];
    currentWhitespace = ws;
  }

  if (current.length > 0) words.push(current);
  return words;
}

export function widestLineFromStyledChars(lines: StyledChar[][]): number {
  let max = 0;
  for (const line of lines) {
    const width = styledCharsWidth(line);
    if (width > max) max = width;
  }
  return max;
}

function wrapSingleLine(styledChars: StyledChar[], columns: number): StyledChar[][] {
  if (styledChars.length === 0) return [[]];

  const out: StyledChar[][] = [];
  let line: StyledChar[] = [];
  let lineWidth = 0;

  const flush = () => {
    out.push(line);
    line = [];
    lineWidth = 0;
  };

  const words = wordBreakStyledChars(styledChars);
  for (const word of words) {
    const wordWidth = styledCharsWidth(word);

    if (wordWidth <= columns) {
      if (lineWidth > 0 && lineWidth + wordWidth > columns) flush();
      line.push(...word);
      lineWidth += wordWidth;
      continue;
    }

    if (line.length > 0) flush();
    for (const ch of word) {
      const chWidth = Math.max(0, computeWidth(ch.value));
      if (lineWidth > 0 && lineWidth + chWidth > columns) flush();
      line.push(ch);
      lineWidth += chWidth;
      if (lineWidth >= columns && columns > 0) flush();
    }
  }

  if (line.length > 0 || out.length === 0) out.push(line);
  return out;
}

export function wrapStyledChars(styledChars: StyledChar[], columns: number): StyledChar[][] {
  if (columns <= 0) return [styledChars.slice()];
  if (styledChars.length === 0) return [[]];

  const sourceLines = splitStyledCharsByNewline(styledChars);
  const wrapped: StyledChar[][] = [];

  for (const line of sourceLines) {
    const next = wrapSingleLine(line, columns);
    wrapped.push(...next);
  }

  return wrapped.length === 0 ? [[]] : wrapped;
}

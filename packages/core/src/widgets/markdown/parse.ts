/**
 * packages/core/src/widgets/markdown/parse.ts — GFM-subset markdown parser.
 *
 * Why: ui.markdown() needs a dependency-free, deterministic parser that is
 * safe on untrusted input (PR bodies, agent output). The grammar is a
 * pragmatic GitHub-Flavored-Markdown subset:
 *
 *   blocks:  ATX headings, paragraphs, fenced code, indented code,
 *            blockquotes, ordered/unordered lists (nested), task items,
 *            thematic breaks, pipe tables
 *   inlines: **strong**, *em*, ~~del~~, `code`, [text](url), <autolinks>,
 *            bare http(s) URLs, hard breaks, backslash escapes, and basic
 *            HTML entities
 *
 * Intentional divergences from full GFM, kept simple on purpose:
 *   - no setext headings, reference links, images, footnotes, or raw HTML
 *     (HTML tags render as literal text)
 *   - no lazy paragraph continuation inside blockquotes or list items
 *   - the CommonMark emphasis algorithm is approximated with flanking checks
 *   - table delimiter rows must contain at least one `|`
 *
 * The parser never throws. Malformed constructs degrade to literal text,
 * nesting depth is bounded, and inline scanning runs on a work budget so
 * adversarial input (for example long runs of `*` or `[`) cannot trigger
 * quadratic blowups.
 */

import type {
  MarkdownBlock,
  MarkdownDocument,
  MarkdownInline,
  MarkdownListItem,
  MarkdownTableAlign,
} from "./ast.js";

const MAX_INLINE_DEPTH = 16;
const MAX_BLOCK_DEPTH = 16;
/** Multiplier for the per-call inline scanning budget (see module docs). */
const INLINE_BUDGET_PER_CHAR = 64;

const ASCII_PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const HR_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/;
const BLOCKQUOTE_RE = /^ {0,3}> ?(.*)$/;
const LIST_RE = /^( {0,3})(?:([-*+])|(\d{1,9})([.)]))( +)(.*)$/;
const TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
const TASK_ITEM_RE = /^\[( |x|X)\][ \t]+(.*)$/;

const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
});

type InlineCtx = {
  budget: number;
  /** Memo of "no emphasis closer at or after index" per marker+need key. */
  noCloserFrom: Map<string, number>;
};

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n";
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#[xX]?[0-9a-fA-F]{1,6}|[a-zA-Z]{2,6});/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const digits = hex ? body.slice(2) : body.slice(1);
      if (digits.length === 0) return match;
      if (!hex && !/^[0-9]+$/.test(digits)) return match;
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "�";
      if (code >= 0xd800 && code <= 0xdfff) return "�";
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function pushText(out: MarkdownInline[], text: string): void {
  if (text.length === 0) return;
  const last = out[out.length - 1];
  if (last !== undefined && last.kind === "text") {
    out[out.length - 1] = { kind: "text", text: last.text + text };
    return;
  }
  out.push({ kind: "text", text });
}

function scanRun(input: string, start: number, ch: string): number {
  let i = start;
  while (i < input.length && input[i] === ch) i++;
  return i - start;
}

function findBacktickClose(input: string, from: number, runLen: number, ctx: InlineCtx): number {
  let i = from;
  while (i < input.length) {
    if (ctx.budget-- <= 0) return -1;
    if (input[i] === "`") {
      const len = scanRun(input, i, "`");
      if (len === runLen) return i;
      i += len;
      continue;
    }
    i++;
  }
  return -1;
}

/**
 * Finds a valid emphasis closing run at or after `from`. Closer validity is
 * position-local (it does not depend on the opener), so a failed search is
 * memoized per marker+need to keep adversarial inputs linear.
 */
function findEmphasisClose(
  input: string,
  from: number,
  marker: string,
  need: number,
  ctx: InlineCtx,
): number {
  const memoKey = `${marker}${need}`;
  const knownEmptyFrom = ctx.noCloserFrom.get(memoKey);
  if (knownEmptyFrom !== undefined && from >= knownEmptyFrom) return -1;
  let i = from;
  while (i < input.length) {
    if (ctx.budget-- <= 0) return -1;
    const ch = input[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      const run = scanRun(input, i, "`");
      const close = findBacktickClose(input, i + run, run, ctx);
      i = close >= 0 ? close + run : i + run;
      continue;
    }
    if (ch === marker) {
      const run = scanRun(input, i, marker);
      const prev = input[i - 1];
      const next = input[i + run];
      const prevOk = prev !== undefined && !isWhitespace(prev);
      const nextOk = marker !== "_" || !isWordChar(next);
      // Consume the LAST `need` markers of a longer closing run so leading
      // extras stay inside the content (closes `**bold *nested***` cleanly).
      if (run >= need && prevOk && nextOk && i > from) return i + (run - need);
      i += run;
      continue;
    }
    i++;
  }
  ctx.noCloserFrom.set(memoKey, from);
  return -1;
}

function tryParseEmphasis(
  input: string,
  start: number,
  marker: "*" | "_",
  depth: number,
  ctx: InlineCtx,
): Readonly<{ node: MarkdownInline; end: number; prefix: string }> | null {
  const run = scanRun(input, start, marker);
  const after = input[start + run];
  if (after === undefined || isWhitespace(after)) return null;
  if (marker === "_" && isWordChar(input[start - 1])) return null;

  // Opening markers beyond the consumed delimiter re-emit as literal text
  // (full CommonMark would nest them; this subset keeps them visible).
  if (run >= 3) {
    const close = findEmphasisClose(input, start + run, marker, 3, ctx);
    if (close > start + run) {
      const inner = parseInlines(input.slice(start + run, close), depth + 1, ctx);
      const strong: MarkdownInline = { kind: "strong", children: inner };
      return {
        node: { kind: "em", children: [strong] },
        end: close + 3,
        prefix: marker.repeat(run - 3),
      };
    }
  }
  if (run >= 2) {
    const close = findEmphasisClose(input, start + run, marker, 2, ctx);
    if (close > start + run) {
      const inner = parseInlines(input.slice(start + run, close), depth + 1, ctx);
      return {
        node: { kind: "strong", children: inner },
        end: close + 2,
        prefix: marker.repeat(run - 2),
      };
    }
  }
  const close = findEmphasisClose(input, start + run, marker, 1, ctx);
  if (close > start + run) {
    const inner = parseInlines(input.slice(start + run, close), depth + 1, ctx);
    return {
      node: { kind: "em", children: inner },
      end: close + 1,
      prefix: marker.repeat(run - 1),
    };
  }
  return null;
}

function tryParseDel(
  input: string,
  start: number,
  depth: number,
  ctx: InlineCtx,
): Readonly<{ node: MarkdownInline; end: number }> | null {
  const contentStart = start + 2;
  const after = input[contentStart];
  if (after === undefined || isWhitespace(after)) return null;
  let i = contentStart;
  while (i < input.length) {
    if (ctx.budget-- <= 0) return null;
    const ch = input[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      const run = scanRun(input, i, "`");
      const close = findBacktickClose(input, i + run, run, ctx);
      i = close >= 0 ? close + run : i + run;
      continue;
    }
    if (ch === "~" && input[i + 1] === "~") {
      const prev = input[i - 1];
      if (prev !== undefined && !isWhitespace(prev) && i > contentStart) {
        const inner = parseInlines(input.slice(contentStart, i), depth + 1, ctx);
        return { node: { kind: "del", children: inner }, end: i + 2 };
      }
      i += 2;
      continue;
    }
    i++;
  }
  return null;
}

function tryParseLink(
  input: string,
  start: number,
  depth: number,
  ctx: InlineCtx,
): Readonly<{ node: MarkdownInline; end: number }> | null {
  let i = start + 1;
  let bracketDepth = 1;
  while (i < input.length) {
    if (ctx.budget-- <= 0) return null;
    const ch = input[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[") bracketDepth++;
    else if (ch === "]") {
      bracketDepth--;
      if (bracketDepth === 0) break;
    }
    i++;
  }
  if (i >= input.length || bracketDepth !== 0) return null;
  const labelEnd = i;
  if (input[labelEnd + 1] !== "(") return null;

  let j = labelEnd + 2;
  let parenDepth = 1;
  while (j < input.length) {
    if (ctx.budget-- <= 0) return null;
    const ch = input[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") {
      parenDepth--;
      if (parenDepth === 0) break;
    }
    j++;
  }
  if (j >= input.length || parenDepth !== 0) return null;

  let target = input.slice(labelEnd + 2, j).trim();
  const titled = /^(\S+)[ \t]+["'][^"']*["']$/.exec(target);
  const titledTarget = titled?.[1];
  if (titledTarget !== undefined) target = titledTarget;
  if (target.startsWith("<") && target.endsWith(">") && target.length >= 2) {
    target = target.slice(1, -1);
  }

  const label = input.slice(start + 1, labelEnd);
  const children =
    label.length === 0
      ? [{ kind: "text", text: target } as const]
      : parseInlines(label, depth + 1, ctx);
  return { node: { kind: "link", href: target, children }, end: j + 1 };
}

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n++;
  return n;
}

/** Strips trailing punctuation that is conventionally not part of a bare URL. */
function trimUrlTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out[out.length - 1];
    if (last === undefined) break;
    if (/[.,;:!?'"]/.test(last)) {
      out = out.slice(0, -1);
      continue;
    }
    if (last === ")" && countChar(out, ")") > countChar(out, "(")) {
      out = out.slice(0, -1);
      continue;
    }
    break;
  }
  return out;
}

function tryParseBareUrl(
  input: string,
  start: number,
): Readonly<{ node: MarkdownInline; end: number }> | null {
  if (!input.startsWith("http://", start) && !input.startsWith("https://", start)) return null;
  if (isWordChar(input[start - 1])) return null;
  let end = start;
  while (end < input.length) {
    const ch = input[end];
    if (ch === undefined || isWhitespace(ch) || ch === "<" || ch === ">") break;
    end++;
  }
  const url = trimUrlTrailing(input.slice(start, end));
  if (!/^https?:\/\/\S+$/.test(url) || url.endsWith("//")) return null;
  return {
    node: { kind: "link", href: url, children: [{ kind: "text", text: url }] },
    end: start + url.length,
  };
}

function parseInlines(input: string, depth: number, ctx: InlineCtx): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  if (depth > MAX_INLINE_DEPTH) {
    pushText(out, decodeEntities(input));
    return out;
  }
  let plain = "";
  let i = 0;
  const flush = (): void => {
    if (plain.length > 0) {
      pushText(out, decodeEntities(plain));
      plain = "";
    }
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;
    if (ctx.budget-- <= 0) {
      plain += input.slice(i);
      break;
    }
    if (ch === "\\" && i + 1 < input.length) {
      const next = input[i + 1];
      if (next !== undefined && ASCII_PUNCT.has(next)) {
        plain += next;
        i += 2;
        continue;
      }
    }
    if (ch === "`") {
      const run = scanRun(input, i, "`");
      const close = findBacktickClose(input, i + run, run, ctx);
      if (close >= 0) {
        flush();
        let content = input.slice(i + run, close).replace(/\n/g, " ");
        if (
          content.length >= 2 &&
          content.startsWith(" ") &&
          content.endsWith(" ") &&
          content.trim().length > 0
        ) {
          content = content.slice(1, -1);
        }
        out.push({ kind: "code", text: content });
        i = close + run;
        continue;
      }
      plain += input.slice(i, i + run);
      i += run;
      continue;
    }
    if (ch === "<") {
      const m = /^<(https?:\/\/[^\s<>]+)>/.exec(input.slice(i));
      const href = m?.[1];
      if (m !== null && href !== undefined) {
        flush();
        out.push({ kind: "link", href, children: [{ kind: "text", text: href }] });
        i += m[0].length;
        continue;
      }
    }
    if (ch === "[") {
      const link = tryParseLink(input, i, depth, ctx);
      if (link !== null) {
        flush();
        out.push(link.node);
        i = link.end;
        continue;
      }
    }
    if (ch === "*" || ch === "_") {
      const em = tryParseEmphasis(input, i, ch, depth, ctx);
      if (em !== null) {
        plain += em.prefix;
        flush();
        out.push(em.node);
        i = em.end;
        continue;
      }
      const run = scanRun(input, i, ch);
      plain += input.slice(i, i + run);
      i += run;
      continue;
    }
    if (ch === "~" && input[i + 1] === "~") {
      const del = tryParseDel(input, i, depth, ctx);
      if (del !== null) {
        flush();
        out.push(del.node);
        i = del.end;
        continue;
      }
      plain += "~~";
      i += 2;
      continue;
    }
    if (ch === "h") {
      const bare = tryParseBareUrl(input, i);
      if (bare !== null) {
        flush();
        out.push(bare.node);
        i = bare.end;
        continue;
      }
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

function newInlineCtx(input: string): InlineCtx {
  return { budget: input.length * INLINE_BUDGET_PER_CHAR + 1024, noCloserFrom: new Map() };
}

/** Parses one inline run with a fresh work budget. */
function parseInlineRun(input: string, depth: number): MarkdownInline[] {
  return parseInlines(input, depth, newInlineCtx(input));
}

function parseParagraphInlines(rawLines: readonly string[], depth: number): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx] ?? "";
    const isLast = idx === rawLines.length - 1;
    let content = raw.trim();
    let hardBreak = false;
    if (!isLast) {
      if (/ {2,}$/.test(raw)) hardBreak = true;
      else if (content.endsWith("\\") && !content.endsWith("\\\\")) {
        hardBreak = true;
        content = content.slice(0, -1).trimEnd();
      }
    }
    for (const node of parseInlineRun(content, depth)) {
      if (node.kind === "text") pushText(out, node.text);
      else out.push(node);
    }
    if (!isLast) {
      if (hardBreak) out.push({ kind: "break" });
      else pushText(out, " ");
    }
  }
  return out;
}

function dedentUpTo(line: string, columns: number): string {
  let removed = 0;
  while (removed < columns && line[removed] === " ") removed++;
  return line.slice(removed);
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = "";
  let i = trimmed[0] === "|" ? 1 : 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i += 2;
      continue;
    }
    if (ch === "\\" && i + 1 < trimmed.length) {
      current += ch;
      current += trimmed[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      i++;
      continue;
    }
    current += ch ?? "";
    i++;
  }
  if (current.trim().length > 0 || !trimmed.endsWith("|") || trimmed.length === 0) {
    cells.push(current.trim());
  }
  return cells;
}

function parseTable(
  lines: readonly string[],
  start: number,
  depth: number,
): Readonly<{ block: MarkdownBlock; next: number }> | null {
  const header = lines[start] ?? "";
  const delim = lines[start + 1] ?? "";
  if (!header.includes("|")) return null;
  if (!delim.includes("|")) return null;
  if (!TABLE_DELIM_RE.test(delim)) return null;

  const headCells = splitTableCells(header);
  const align: MarkdownTableAlign[] = splitTableCells(delim).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
  if (headCells.length !== align.length || headCells.length === 0) return null;

  const rows: MarkdownInline[][][] = [];
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0 || !line.includes("|")) break;
    const cells = splitTableCells(line).slice(0, headCells.length);
    while (cells.length < headCells.length) cells.push("");
    rows.push(cells.map((cell) => parseInlineRun(cell, depth + 1)));
    i++;
  }
  return {
    block: {
      kind: "table",
      align,
      head: headCells.map((cell) => parseInlineRun(cell, depth + 1)),
      rows,
    },
    next: i,
  };
}

function parseList(
  lines: readonly string[],
  start: number,
  depth: number,
): Readonly<{ block: MarkdownBlock; next: number }> | null {
  const first = LIST_RE.exec(lines[start] ?? "");
  if (first === null) return null;
  const ordered = first[3] !== undefined;
  const firstNumber = Number.parseInt(first[3] ?? "1", 10);
  const startNumber = ordered && Number.isFinite(firstNumber) ? firstNumber : 1;

  const items: MarkdownListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i] ?? "");
    if (m === null) break;
    if ((m[3] !== undefined) !== ordered) break;
    const indent = (m[1] ?? "").length;
    const markerLength = ordered ? (m[3] ?? "1").length + 1 : 1;
    const gap = Math.min((m[5] ?? " ").length, 4);
    const contentIndent = indent + markerLength + gap;
    const itemLines: string[] = [m[6] ?? ""];
    i++;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      if (line.trim().length === 0) {
        let j = i + 1;
        while (j < lines.length && (lines[j] ?? "").trim().length === 0) j++;
        const upcoming = lines[j];
        if (upcoming !== undefined && leadingSpaces(upcoming) >= contentIndent) {
          itemLines.push("");
          i++;
          continue;
        }
        break;
      }
      if (leadingSpaces(line) >= contentIndent) {
        itemLines.push(line.slice(contentIndent));
        i++;
        continue;
      }
      break;
    }

    let checked: boolean | null = null;
    const task = TASK_ITEM_RE.exec(itemLines[0] ?? "");
    if (task !== null) {
      checked = task[1] !== " ";
      itemLines[0] = task[2] ?? "";
    }
    items.push({ checked, blocks: parseBlocks(itemLines, depth + 1) });

    while (i < lines.length && (lines[i] ?? "").trim().length === 0) i++;
  }
  if (items.length === 0) return null;
  return {
    block: { kind: "list", ordered, start: startNumber, items },
    next: i,
  };
}

function isParagraphInterrupter(line: string): boolean {
  if (line.trim().length === 0) return true;
  if (ATX_RE.test(line)) return true;
  if (FENCE_OPEN_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (BLOCKQUOTE_RE.test(line)) return true;
  if (LIST_RE.test(line)) return true;
  return false;
}

function parseBlocks(lines: readonly string[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  if (depth > MAX_BLOCK_DEPTH) {
    const text = lines.join(" ").trim();
    if (text.length > 0) {
      blocks.push({ kind: "paragraph", children: [{ kind: "text", text }] });
    }
    return blocks;
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    const fence = FENCE_OPEN_RE.exec(line);
    if (fence !== null) {
      const fenceIndent = (fence[1] ?? "").length;
      const fenceRun = fence[2] ?? "```";
      const fenceChar = fenceRun.startsWith("~") ? "~" : "`";
      const info = (fence[3] ?? "").trim();
      if (fenceChar === "~" || !info.includes("`")) {
        const language = (info.split(/\s+/)[0] ?? "").toLowerCase();
        const closeRe = new RegExp(`^ {0,3}${fenceChar}{${fenceRun.length},}[ \\t]*$`);
        const content: string[] = [];
        i++;
        while (i < lines.length && !closeRe.test(lines[i] ?? "")) {
          content.push(dedentUpTo(lines[i] ?? "", fenceIndent));
          i++;
        }
        if (i < lines.length) i++;
        blocks.push({ kind: "codeBlock", language, text: content.join("\n") });
        continue;
      }
    }

    const atx = ATX_RE.exec(line);
    if (atx !== null) {
      const level = Math.min(Math.max((atx[1] ?? "#").length, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const content = (atx[2] ?? "").replace(/[ \t]+#+$/, "").trim();
      blocks.push({ kind: "heading", level, children: parseInlineRun(content, depth) });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const m = BLOCKQUOTE_RE.exec(lines[i] ?? "");
        if (m === null) break;
        inner.push(m[1] ?? "");
        i++;
      }
      blocks.push({ kind: "blockquote", children: parseBlocks(inner, depth + 1) });
      continue;
    }

    const list = parseList(lines, i, depth);
    if (list !== null) {
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    const table = parseTable(lines, i, depth);
    if (table !== null) {
      blocks.push(table.block);
      i = table.next;
      continue;
    }

    if (INDENTED_CODE_RE.test(line)) {
      const content: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (INDENTED_CODE_RE.test(current)) {
          content.push(current.replace(INDENTED_CODE_RE, ""));
          i++;
          continue;
        }
        if (current.trim().length === 0) {
          let j = i + 1;
          while (j < lines.length && (lines[j] ?? "").trim().length === 0) j++;
          const upcoming = lines[j];
          if (upcoming !== undefined && INDENTED_CODE_RE.test(upcoming)) {
            for (let k = i; k < j; k++) content.push("");
            i = j;
            continue;
          }
        }
        break;
      }
      blocks.push({ kind: "codeBlock", language: "", text: content.join("\n") });
      continue;
    }

    const paragraph: string[] = [line];
    i++;
    while (i < lines.length && !isParagraphInterrupter(lines[i] ?? "")) {
      paragraph.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "paragraph", children: parseParagraphInlines(paragraph, depth) });
  }
  return blocks;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Parses a GFM-subset markdown document. Never throws: malformed constructs
 * degrade to literal text and the result is deeply frozen.
 */
export function parseMarkdown(source: string): MarkdownDocument {
  const text = typeof source === "string" ? source : "";
  const normalized = text.replace(/\r\n?/g, "\n").split("\u0000").join("\uFFFD");
  const blocks = parseBlocks(normalized.split("\n"), 0);
  return deepFreeze({ blocks });
}

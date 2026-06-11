/**
 * packages/core/src/widgets/markdown/render.ts — Markdown AST → widget tree.
 *
 * Why: ui.markdown() renders parsed markdown by composing existing widgets
 * (text, richText, box, row, column, divider) instead of introducing a new
 * VNode kind, so it inherits proven layout, theming, and renderer behavior.
 *
 * Styling is attribute-only (bold/italic/dim/underline/inverse): the output
 * adapts to every theme because no colors are hard-coded. Fenced code blocks
 * reuse the CodeEditor line tokenizer for monochrome syntax emphasis.
 */

import { measureTextCells } from "../../layout/textMeasure.js";
import { tokenizeCodeEditorLine } from "../codeEditorSyntax.js";
import { box, column, divider, row, text } from "../factories/basic.js";
import { richText } from "../factories/feedback.js";
import type { TextStyle } from "../style.js";
import type { CodeEditorSyntaxLanguage, CodeEditorSyntaxTokenKind } from "../types.js";
import type { RichTextSpan, VNode } from "../types.js";
import type { MarkdownBlock, MarkdownDocument, MarkdownInline, MarkdownListItem } from "./ast.js";

/** Options for rendering a pre-parsed markdown document. */
export type MarkdownRenderOptions = Readonly<{
  key?: string;
  /** Vertical spacing rows between top-level blocks. Defaults to 1. */
  blockGap?: number;
}>;

type RenderCtx = Readonly<{ blockGap: number }>;

type Piece = Readonly<{ text: string; style: TextStyle | undefined }>;

const STRONG_STYLE: TextStyle = { bold: true };
const EM_STYLE: TextStyle = { italic: true };
const DEL_STYLE: TextStyle = { strikethrough: true };
const INLINE_CODE_STYLE: TextStyle = { inverse: true };
const LINK_STYLE: TextStyle = { underline: true };
const TABLE_FRAME_STYLE: TextStyle = { dim: true };

const HEADING_STYLES: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, TextStyle>> = {
  1: { bold: true, underline: true },
  2: { bold: true },
  3: { bold: true, italic: true },
  4: { bold: true, dim: true },
  5: { bold: true, dim: true },
  6: { bold: true, dim: true, italic: true },
};

const CODE_TOKEN_STYLES: Readonly<Partial<Record<CodeEditorSyntaxTokenKind, TextStyle>>> = {
  keyword: { bold: true },
  type: { bold: true },
  comment: { dim: true, italic: true },
  string: { italic: true },
  operator: { dim: true },
  punctuation: { dim: true },
};

const CODE_LANGUAGE_ALIASES: Readonly<Record<string, CodeEditorSyntaxLanguage>> = {
  bash: "bash",
  c: "c",
  "c#": "csharp",
  "c++": "cpp",
  cc: "cpp",
  cjs: "javascript",
  console: "bash",
  cpp: "cpp",
  cs: "csharp",
  csharp: "csharp",
  go: "go",
  golang: "go",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  mjs: "javascript",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  zsh: "bash",
};

function mergeStyle(base: TextStyle | undefined, add: TextStyle): TextStyle {
  return base === undefined ? add : { ...base, ...add };
}

function pushPiece(segments: Piece[][], piece: Piece): void {
  if (piece.text.length === 0) return;
  const segment = segments[segments.length - 1];
  if (segment === undefined) return;
  segment.push(piece);
}

/** Flattens inline nodes into styled pieces, splitting segments on hard breaks. */
function flattenInlines(
  inlines: readonly MarkdownInline[],
  style: TextStyle | undefined,
  segments: Piece[][],
): void {
  for (const node of inlines) {
    switch (node.kind) {
      case "text":
        pushPiece(segments, { text: node.text, style });
        break;
      case "code":
        pushPiece(segments, { text: node.text, style: mergeStyle(style, INLINE_CODE_STYLE) });
        break;
      case "strong":
        flattenInlines(node.children, mergeStyle(style, STRONG_STYLE), segments);
        break;
      case "em":
        flattenInlines(node.children, mergeStyle(style, EM_STYLE), segments);
        break;
      case "del":
        flattenInlines(node.children, mergeStyle(style, DEL_STYLE), segments);
        break;
      case "link":
        flattenInlines(node.children, mergeStyle(style, LINK_STYLE), segments);
        break;
      case "break":
        segments.push([]);
        break;
    }
  }
}

function textNode(content: string, style: TextStyle | undefined): VNode {
  return style === undefined ? text(content) : text(content, { style });
}

/**
 * Renders one hard-break-free segment as wrappable content. Whitespace
 * becomes wrap points (`row` gap), and runs of differently styled fragments
 * with no whitespace between them stay glued as one unbreakable unit.
 */
function renderSegment(pieces: readonly Piece[]): VNode {
  if (pieces.length === 0) return text("");
  if (pieces.every((piece) => piece.style === undefined)) {
    const joined = pieces.map((piece) => piece.text).join("");
    return text(joined, { wrap: true });
  }

  type Fragment = Readonly<{ text: string; style: TextStyle | undefined }>;
  const words: Fragment[][] = [];
  let current: Fragment[] = [];
  const endWord = (): void => {
    if (current.length > 0) {
      words.push(current);
      current = [];
    }
  };
  for (const piece of pieces) {
    for (const chunk of piece.text.split(/(\s+)/)) {
      if (chunk.length === 0) continue;
      if (/^\s+$/.test(chunk)) {
        endWord();
        continue;
      }
      current.push({ text: chunk, style: piece.style });
    }
  }
  endWord();

  const wordNodes = words.map((fragments) => {
    const first = fragments[0];
    if (fragments.length === 1 && first !== undefined) return textNode(first.text, first.style);
    return row(
      { gap: 0 },
      fragments.map((fragment) => textNode(fragment.text, fragment.style)),
    );
  });
  return row({ gap: 1, wrap: true, items: "start" }, wordNodes);
}

/** Renders inline content with optional base style, honoring hard breaks. */
function renderInlineFlow(
  inlines: readonly MarkdownInline[],
  baseStyle: TextStyle | undefined,
): VNode {
  const segments: Piece[][] = [[]];
  flattenInlines(inlines, baseStyle, segments);
  const rendered = segments.map(renderSegment);
  const first = rendered[0];
  if (rendered.length === 1 && first !== undefined) return first;
  return column({ gap: 0 }, rendered);
}

/** Flattens inline content to single-line spans (hard breaks become spaces). */
function inlineToSpans(
  inlines: readonly MarkdownInline[],
  baseStyle: TextStyle | undefined,
): RichTextSpan[] {
  const segments: Piece[][] = [[]];
  flattenInlines(inlines, baseStyle, segments);
  const spans: RichTextSpan[] = [];
  segments.forEach((segment, index) => {
    if (index > 0) spans.push({ text: " " });
    for (const piece of segment) {
      const style = piece.style;
      spans.push(style === undefined ? { text: piece.text } : { text: piece.text, style });
    }
  });
  return spans;
}

function spansPlainText(spans: readonly RichTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

function renderCodeBlock(language: string, body: string): VNode {
  const preset = CODE_LANGUAGE_ALIASES[language] ?? "plain";
  const lines = body.replace(/\t/g, "  ").split("\n");
  const lineNodes = lines.map((line) => {
    if (line.length === 0) return text(" ");
    const tokens = tokenizeCodeEditorLine(line, { language: preset });
    if (tokens.length === 0) return text(line);
    const spans: RichTextSpan[] = tokens.map((token) => {
      const style = CODE_TOKEN_STYLES[token.kind];
      return style === undefined ? { text: token.text } : { text: token.text, style };
    });
    return richText(spans);
  });
  return box({ border: "single", px: 1, gap: 0, overflow: "hidden" }, lineNodes);
}

function renderList(
  ordered: boolean,
  start: number,
  items: readonly MarkdownListItem[],
  ctx: RenderCtx,
): VNode {
  const markers = items.map((item, index) => {
    if (item.checked !== null) return item.checked ? "[x]" : "[ ]";
    return ordered ? `${start + index}.` : "•";
  });
  const markerWidth = markers.reduce((max, marker) => Math.max(max, marker.length), 1);
  const rows = items.map((item, index) => {
    const marker = (markers[index] ?? "•").padEnd(markerWidth);
    const markerNode =
      item.checked === true ? text(marker, { style: { dim: true } }) : text(marker);
    const blocks = item.blocks.map((block) => renderBlock(block, ctx));
    const content =
      blocks.length === 1 && blocks[0] !== undefined
        ? blocks[0]
        : // List items render tight: nested blocks stack without blank rows.
          column({ gap: 0 }, blocks);
    return row({ gap: 1, items: "start" }, [markerNode, column({ flex: 1, gap: 0 }, [content])]);
  });
  return column({ gap: 0 }, rows);
}

function renderTable(
  align: readonly ("left" | "center" | "right")[],
  head: readonly (readonly MarkdownInline[])[],
  rows: readonly (readonly (readonly MarkdownInline[])[])[],
): VNode {
  const columnCount = align.length;
  const headSpans = head.map((cell) => inlineToSpans(cell, STRONG_STYLE));
  const rowSpans = rows.map((cells) => cells.map((cell) => inlineToSpans(cell, undefined)));

  const widths: number[] = [];
  for (let c = 0; c < columnCount; c++) {
    let width = measureTextCells(spansPlainText(headSpans[c] ?? []));
    for (const cells of rowSpans) {
      width = Math.max(width, measureTextCells(spansPlainText(cells[c] ?? [])));
    }
    widths.push(Math.max(width, 1));
  }

  const renderRow = (cells: readonly (readonly RichTextSpan[])[]): VNode => {
    const spans: RichTextSpan[] = [];
    for (let c = 0; c < columnCount; c++) {
      if (c > 0) spans.push({ text: " │ ", style: TABLE_FRAME_STYLE });
      const cell = cells[c] ?? [];
      const pad = Math.max((widths[c] ?? 1) - measureTextCells(spansPlainText(cell)), 0);
      const mode = align[c] ?? "left";
      const leftPad = mode === "right" ? pad : mode === "center" ? Math.floor(pad / 2) : 0;
      const rightPad = pad - leftPad;
      if (leftPad > 0) spans.push({ text: " ".repeat(leftPad) });
      spans.push(...cell);
      if (rightPad > 0) spans.push({ text: " ".repeat(rightPad) });
    }
    return richText(spans);
  };

  const ruleSpans: RichTextSpan[] = [];
  for (let c = 0; c < columnCount; c++) {
    if (c > 0) ruleSpans.push({ text: "─┼─", style: TABLE_FRAME_STYLE });
    ruleSpans.push({ text: "─".repeat(widths[c] ?? 1), style: TABLE_FRAME_STYLE });
  }

  return column({ gap: 0 }, [
    renderRow(headSpans),
    richText(ruleSpans),
    ...rowSpans.map(renderRow),
  ]);
}

function renderBlock(block: MarkdownBlock, ctx: RenderCtx): VNode {
  switch (block.kind) {
    case "heading":
      return renderInlineFlow(block.children, HEADING_STYLES[block.level]);
    case "paragraph":
      return renderInlineFlow(block.children, undefined);
    case "codeBlock":
      return renderCodeBlock(block.language, block.text);
    case "blockquote":
      // GitHub-style left bar: a box with only its left border enabled.
      return box(
        {
          border: "single",
          borderTop: false,
          borderRight: false,
          borderBottom: false,
          borderLeft: true,
          pl: 1,
          gap: ctx.blockGap,
          borderStyle: { dim: true },
          inheritStyle: { dim: true },
        },
        block.children.map((child) => renderBlock(child, ctx)),
      );
    case "list":
      return renderList(block.ordered, block.start, block.items, ctx);
    case "hr":
      return divider();
    case "table":
      return renderTable(block.align, block.head, block.rows);
  }
}

/** Resolves the effective block gap for render options. Internal surface. */
export function resolveMarkdownBlockGap(rawGap: number | undefined): number {
  return rawGap !== undefined && Number.isFinite(rawGap) && rawGap >= 0 ? Math.floor(rawGap) : 1;
}

/**
 * Renders one parsed top-level markdown block onto existing widgets. Used by
 * createMarkdownStream() to cache rendered blocks across appends.
 */
export function renderMarkdownBlock(
  block: MarkdownBlock,
  options: MarkdownRenderOptions = {},
): VNode {
  return renderBlock(block, { blockGap: resolveMarkdownBlockGap(options.blockGap) });
}

/**
 * Renders a pre-parsed markdown document onto existing widgets. Use together
 * with parseMarkdown() to cache parsed documents, or createMarkdownStream()
 * for append-only sources; ui.markdown() is the one-call convenience wrapper.
 */
export function renderMarkdown(doc: MarkdownDocument, options: MarkdownRenderOptions = {}): VNode {
  const blockGap = resolveMarkdownBlockGap(options.blockGap);
  const ctx: RenderCtx = { blockGap };
  const children = doc.blocks.map((block) => renderBlock(block, ctx));
  return column(
    options.key === undefined ? { gap: blockGap } : { gap: blockGap, key: options.key },
    children,
  );
}

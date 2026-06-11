/**
 * packages/core/src/widgets/markdown/stream.ts — incremental markdown stream.
 *
 * Why: agent transcripts and live logs append markdown continuously. Under
 * append-only input every top-level block except the last is immutable
 * (appends can only extend or follow the final block), so the stream
 * re-parses from the start of the last block only and caches both the parsed
 * blocks and their rendered VNodes. Appends stay O(tail) instead of
 * O(document), and stable blocks keep referential identity so reconciliation
 * and layout stability signatures skip untouched subtrees.
 *
 * Invariant: at every point, document() deep-equals
 * parseMarkdown(source()) — chunk boundaries (including split CRLF pairs)
 * never change the result.
 */

import { column } from "../factories/basic.js";
import type { VNode } from "../types.js";
import type { MarkdownBlock, MarkdownDocument } from "./ast.js";
import { parseMarkdownLines } from "./parse.js";
import {
  type MarkdownRenderOptions,
  renderMarkdownBlock,
  resolveMarkdownBlockGap,
} from "./render.js";

/** Options for createMarkdownStream(); applied by vnode(). */
export type MarkdownStreamOptions = MarkdownRenderOptions;

/** Incremental markdown stream for append-only sources. */
export type MarkdownStream = Readonly<{
  /** Appends a source chunk. Chunks may split lines, CRLF pairs, or words. */
  append: (chunk: string) => void;
  /** Clears the buffer; optionally replaces it with new source. */
  reset: (source?: string) => void;
  /** Full (normalized) source buffered so far. */
  source: () => string;
  /** Parsed document; stable blocks keep referential identity across appends. */
  document: () => MarkdownDocument;
  /** Rendered document; stable blocks reuse cached VNodes across appends. */
  vnode: () => VNode;
}>;

const NUL = String.fromCharCode(0);

/**
 * Creates an incremental markdown stream. See the module docs for the
 * caching model; ui.markdown() remains the one-call wrapper for static
 * sources.
 *
 * @example
 * const stream = createMarkdownStream();
 * stream.append("# Title\n\nstreamed ");
 * stream.append("tokens...");
 * app.view(() => stream.vnode());
 */
export function createMarkdownStream(options: MarkdownStreamOptions = {}): MarkdownStream {
  /** Buffered lines; the final entry is the open (unterminated) tail line. */
  let lines: string[] = [""];
  /** True when the last appended chunk ended in a bare CR (possible CRLF split). */
  let pendingCR = false;
  /** Immutable blocks before the volatile window. */
  let stableBlocks: MarkdownBlock[] = [];
  /** Number of buffered lines covered by stableBlocks. */
  let stableLineCount = 0;
  /** Re-parsed blocks of the volatile window (at most the last block + tail). */
  let tailBlocks: readonly MarkdownBlock[] = [];
  let dirty = false;
  const vnodeCache = new WeakMap<MarkdownBlock, VNode>();

  function append(chunk: string): void {
    const raw = typeof chunk === "string" ? chunk : "";
    if (raw.length === 0) return;
    let text = (pendingCR ? "\r" : "") + raw;
    pendingCR = text.endsWith("\r");
    if (pendingCR) text = text.slice(0, -1);
    if (text.length === 0) return;
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(NUL).join("�");
    const parts = normalized.split("\n");
    lines[lines.length - 1] += parts[0] ?? "";
    for (let p = 1; p < parts.length; p++) lines.push(parts[p] ?? "");
    dirty = true;
  }

  function reset(source = ""): void {
    lines = [""];
    pendingCR = false;
    stableBlocks = [];
    stableLineCount = 0;
    tailBlocks = [];
    dirty = true;
    append(source);
    dirty = true;
  }

  function reparse(): void {
    if (!dirty) return;
    const window = lines.slice(stableLineCount);
    const starts: number[] = [];
    const blocks = parseMarkdownLines(window, starts);
    // The window's first block is the previous tail re-parsed. When an append
    // only added content after it, restore the old object so completed blocks
    // keep referential identity (and their cached VNodes) across appends.
    const previousTail = tailBlocks[0];
    const reparsedTail = blocks[0];
    if (
      previousTail !== undefined &&
      reparsedTail !== undefined &&
      JSON.stringify(reparsedTail) === JSON.stringify(previousTail)
    ) {
      blocks[0] = previousTail;
    }
    if (blocks.length > 1) {
      // Everything before the window's last block is now immutable.
      const lastStart = starts[starts.length - 1] ?? 0;
      stableBlocks = stableBlocks.concat(blocks.slice(0, -1));
      stableLineCount += lastStart;
      tailBlocks = blocks.slice(-1);
    } else {
      tailBlocks = blocks;
    }
    dirty = false;
  }

  function source(): string {
    return lines.join("\n") + (pendingCR ? "\r" : "");
  }

  function document(): MarkdownDocument {
    reparse();
    return Object.freeze({ blocks: Object.freeze([...stableBlocks, ...tailBlocks]) });
  }

  function vnode(): VNode {
    reparse();
    const children: VNode[] = [];
    for (const block of [...stableBlocks, ...tailBlocks]) {
      const cached = vnodeCache.get(block);
      if (cached !== undefined) {
        children.push(cached);
        continue;
      }
      const rendered = renderMarkdownBlock(block, options);
      vnodeCache.set(block, rendered);
      children.push(rendered);
    }
    const blockGap = resolveMarkdownBlockGap(options.blockGap);
    return column(
      options.key === undefined ? { gap: blockGap } : { gap: blockGap, key: options.key },
      children,
    );
  }

  return Object.freeze({ append, reset, source, document, vnode });
}

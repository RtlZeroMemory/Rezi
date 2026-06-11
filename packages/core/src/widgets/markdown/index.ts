/**
 * packages/core/src/widgets/markdown/index.ts — Markdown module surface.
 */

import type { MarkdownProps, VNode } from "../types.js";
import { parseMarkdown } from "./parse.js";
import { type MarkdownRenderOptions, renderMarkdown } from "./render.js";

export type {
  MarkdownBlock,
  MarkdownDocument,
  MarkdownInline,
  MarkdownListItem,
  MarkdownTableAlign,
} from "./ast.js";
export { parseMarkdown } from "./parse.js";
export { type MarkdownRenderOptions, renderMarkdown } from "./render.js";

/**
 * Renders a GitHub-Flavored-Markdown subset onto existing widgets.
 *
 * Supported blocks: headings, paragraphs, fenced/indented code, blockquotes,
 * nested ordered/unordered lists, task items, thematic breaks, and pipe
 * tables. Inline: bold, italic, strikethrough, code, links, autolinks, hard
 * breaks, escapes, and basic entities. Raw HTML renders as literal text.
 * Parsing never throws; malformed input degrades to plain text.
 *
 * For streamed or frequently re-rendered documents, pre-parse with
 * parseMarkdown() and render cached blocks with renderMarkdown().
 *
 * @example
 * ui.markdown("# Release\n\nShips `ui.markdown` with **GFM subset** support.")
 */
export function markdown(source: string, props: Omit<MarkdownProps, "source"> = {}): VNode {
  const { blockGap, key } = props;
  const options: MarkdownRenderOptions = {
    ...(blockGap === undefined ? {} : { blockGap }),
    ...(key === undefined ? {} : { key }),
  };
  return renderMarkdown(parseMarkdown(source), options);
}

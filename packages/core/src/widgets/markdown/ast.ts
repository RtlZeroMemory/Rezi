/**
 * packages/core/src/widgets/markdown/ast.ts — Markdown AST node types.
 *
 * Why: ui.markdown() parses a GitHub-Flavored-Markdown subset into this small
 * block/inline tree before rendering it onto existing widgets. The AST is
 * public so applications can pre-parse, cache, or transform documents
 * (for example block-cached streaming transcripts).
 */

/** Inline markdown content node. */
export type MarkdownInline =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "code"; text: string }>
  | Readonly<{ kind: "strong"; children: readonly MarkdownInline[] }>
  | Readonly<{ kind: "em"; children: readonly MarkdownInline[] }>
  | Readonly<{ kind: "del"; children: readonly MarkdownInline[] }>
  | Readonly<{ kind: "link"; href: string; children: readonly MarkdownInline[] }>
  | Readonly<{ kind: "break" }>;

/** Column alignment parsed from a table delimiter row. */
export type MarkdownTableAlign = "left" | "center" | "right";

/** One list item; `checked` is null for plain items and boolean for task items. */
export type MarkdownListItem = Readonly<{
  checked: boolean | null;
  blocks: readonly MarkdownBlock[];
}>;

/** Block-level markdown node. */
export type MarkdownBlock =
  | Readonly<{
      kind: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      children: readonly MarkdownInline[];
    }>
  | Readonly<{ kind: "paragraph"; children: readonly MarkdownInline[] }>
  | Readonly<{ kind: "codeBlock"; language: string; text: string }>
  | Readonly<{ kind: "blockquote"; children: readonly MarkdownBlock[] }>
  | Readonly<{
      kind: "list";
      ordered: boolean;
      start: number;
      items: readonly MarkdownListItem[];
    }>
  | Readonly<{ kind: "hr" }>
  | Readonly<{
      kind: "table";
      align: readonly MarkdownTableAlign[];
      head: readonly (readonly MarkdownInline[])[];
      rows: readonly (readonly (readonly MarkdownInline[])[])[];
    }>;

/** Parsed markdown document. */
export type MarkdownDocument = Readonly<{ blocks: readonly MarkdownBlock[] }>;

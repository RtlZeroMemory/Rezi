# `Markdown`

Renders a GitHub-Flavored-Markdown subset by composing existing widgets
(`text`, `richText`, `box`, `row`, `column`, `divider`). Non-interactive,
`experimental` tier.

## Usage

```ts
ui.markdown(prBody)

ui.markdown("# Title\n\nShips `ui.markdown` with **GFM subset** support.", {
  blockGap: 1,
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `string` | **required** (first argument) | Markdown source text |
| `blockGap` | `number` | `1` | Vertical spacing rows between top-level blocks |
| `key` | `string` | - | Reconciliation key |

## Supported syntax

| Construct | Notes |
|-----------|-------|
| ATX headings `#`–`######` | Level styles are attribute-only (bold/underline/dim) |
| Paragraphs | Soft breaks join with spaces; `  ` or `\` at line end hard-breaks |
| `**strong**`, `*em*`, `~~del~~` | `_underscore_` emphasis respects word boundaries |
| `` `code` `` | Rendered inverse; double-backtick spans contain backticks |
| `[label](url)` / `<https://…>` / bare URLs | Rendered underlined; trailing punctuation trimmed from bare URLs |
| Fenced + indented code blocks | Fence info maps to CodeEditor tokenizer presets for monochrome syntax emphasis |
| Lists | Ordered (`1.` / `1)`, start number kept), unordered, nested, tight |
| Task items `- [x]` | Checked markers render dim |
| Blockquotes | Dim rounded box (nesting supported) |
| Pipe tables | `:-`, `:-:`, `-:` alignment; `\|` escapes; ragged rows normalized |
| `---` / `* * *` / `___` | Thematic break renders as a divider |
| Entities | `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`, numeric forms |

Intentional divergences from full GFM: no setext headings, reference links,
images, footnotes, or raw HTML (HTML tags render as literal text), no lazy
paragraph continuation, and the CommonMark emphasis algorithm is approximated
with flanking checks.

## Notes

- Parsing never throws. Malformed constructs degrade to literal text, nesting
  depth is bounded, and inline scanning runs on a work budget so adversarial
  input (PR bodies, agent output) cannot trigger quadratic blowups.
- Styling is attribute-only, so output adapts to every theme; no colors are
  hard-coded.
- Styled paragraphs wrap at word boundaries; unstyled paragraphs use
  grapheme-safe `text` wrapping.
- For streamed or frequently re-rendered documents, pre-parse with
  `parseMarkdown(source)` and render cached documents with
  `renderMarkdown(doc, options)`; completed blocks of an append-only stream
  can be cached by the caller. A built-in streaming mode is planned.
- The parsed `MarkdownDocument` AST (`MarkdownBlock` / `MarkdownInline`) is
  exported and deeply frozen.

## Related

- [RichText](rich-text.md)
- [Code Editor](code-editor.md)
- [Logs Console](logs-console.md)

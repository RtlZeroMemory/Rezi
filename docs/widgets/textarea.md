# Textarea

A controlled multi-line text input widget for notes, descriptions, and free-form text.

## Usage

```typescript
ui.textarea({
  id: "notes",
  value: state.notes,
  rows: 5,
  onInput: (value) => app.update((s) => ({ ...s, notes: value })),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for focus and routing |
| `value` | `string` | **required** | Current controlled textarea value |
| `rows` | `number` | `3` | Visible line count |
| `wordWrap` | `boolean` | `true` | Wrap long lines |
| `accessibleLabel` | `string` | - | Optional semantic label for focus announcements/debugging |
| `disabled` | `boolean` | `false` | Disable editing and dim appearance |
| `readOnly` | `boolean` | `false` | Keep the textarea focusable while preventing edits |
| `focusable` | `boolean` | `true` | Opt out of Tab order while keeping id-based routing available |
| `placeholder` | `string` | - | Placeholder text shown when the value is empty |
| `style` | `TextStyle` | - | Custom styling (merged with focus/disabled state) |
| `onInput` | `(value: string, cursor: number) => void` | - | Callback when value changes |
| `onBlur` | `() => void` | - | Callback when textarea loses focus |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused textarea decoration |
| `key` | `string` | - | Reconciliation key for dynamic lists |

## Behavior

When focused:

- Typing inserts text at the cursor
- **Enter** inserts a newline
- **Left/Right** move by grapheme cluster
- **Up/Down** move between logical lines
- **Home/End** move to start/end of the current line
- **Shift + movement** extends selection
- **Ctrl+A** selects all
- **Ctrl+C** copies active selection to system clipboard (OSC 52)
- **Ctrl+X** cuts active selection to system clipboard (OSC 52)
- **Ctrl+Z** undoes the last edit
- **Ctrl+Shift+Z** or **Ctrl+Y** redoes the last undone edit
- Paste preserves line breaks (CRLF normalized to `\n`)

Textarea is controlled: `value` is always the source of truth.

When `wordWrap: false`, long lines stay unwrapped and the focused viewport shifts horizontally to keep the active cursor column visible instead of clamping the cursor to the left-most window.

Runtime note: `ui.textarea(...)` is represented as VNode kind `"input"` with `multiline: true`.
Use this mapping when writing low-level kind assertions.

## Related

- [Input](input.md) - Single-line controlled input
- [Field](field.md) - Label/error wrapper for form controls

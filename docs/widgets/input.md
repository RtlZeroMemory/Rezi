# Input

A single-line, controlled text input widget with cursor navigation and editing support.

## Usage

```typescript
ui.input({
  id: "name",
  value: state.name,
  onInput: (value) => app.update((s) => ({ ...s, name: value })),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for focus and event routing |
| `value` | `string` | **required** | Current input value (controlled) |
| `accessibleLabel` | `string` | - | Optional semantic label for focus announcements and debugging |
| `disabled` | `boolean` | `false` | Disable editing and dim appearance |
| `style` | `TextStyle` | - | Custom styling (merged with focus/disabled state) |
| `onInput` | `(value: string, cursor: number) => void` | - | Callback when value changes |
| `onBlur` | `() => void` | - | Callback when input loses focus |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused input decoration |
| `key` | `string` | - | Reconciliation key for dynamic lists |

## Behavior

Inputs are focusable when enabled. **Clicking** the input focuses it. When focused:

- Text entry inserts at cursor position
- **Left/Right** move by grapheme cluster
- **Ctrl+Left/Ctrl+Right** move by word boundaries
- **Home/End** move to start/end of input
- **Shift+Left/Shift+Right** extends selection by grapheme
- **Shift+Home/Shift+End** extends selection to start/end
- **Shift+Ctrl+Left/Shift+Ctrl+Right** extends selection by word
- **Ctrl+A** selects all text
- **Ctrl+C** copies active selection to system clipboard (OSC 52)
- **Ctrl+X** cuts active selection to system clipboard (OSC 52)
- **Ctrl+Z** undoes the last edit
- **Ctrl+Shift+Z** or **Ctrl+Y** redoes the last undone edit
- **Backspace/Delete** remove one grapheme cluster when no selection is active
- **Backspace/Delete** delete the selected range when selection is active
- Typing with an active selection replaces the selected range
- Paste strips `\r`/`\n` (single-line input) and keeps tabs
- **Tab** moves focus to next widget

Inputs are always controlled - the `value` prop determines what is displayed.
For multi-line text, use [`ui.textarea`](textarea.md).

## Input Editor State

Input editing is grapheme-aware and internally tracks:

- `cursor`: current caret offset at a grapheme boundary
- `selectionStart`: anchor offset, or `null` when no selection is active
- `selectionEnd`: active/caret offset, or `null` when no selection is active

Renderer integrations receive these through the runtime input editor result to support selection highlighting.

## Examples

### Controlled input

```typescript
type State = { email: string };

app.view((state) =>
  ui.input({
    id: "email",
    value: state.email,
    onInput: (value) => app.update((s) => ({ ...s, email: value })),
  })
);
```

### With `useForm` binding

```typescript
ui.input(form.bind("email"));
```

### Validation on blur

Use `onBlur` to trigger validation when the user leaves the field:

```typescript
ui.input({
  id: "email",
  value: state.email,
  onInput: (value) => app.update((s) => ({ ...s, email: value })),
  onBlur: () => validateEmail(state.email),
})
```

### With a `field` wrapper

Combine with `field` for labels and error display:

```typescript
ui.field({
  label: "Email",
  required: true,
  error: state.errors.email,
  children: ui.input({
    id: "email",
    value: state.email,
    onInput: (v) => app.update((s) => ({ ...s, email: v })),
  }),
})
```

## Unicode Handling

Text editing is based on grapheme clusters using a pinned Unicode version. This ensures:

- Emoji and combined characters are handled as single units
- Cursor movement is consistent across platforms
- Deterministic behavior for any input string

## Related

- [Field](field.md) - Form field wrapper
- [Textarea](textarea.md) - Multi-line controlled input
- [Button](button.md) - Clickable button
- [Checkbox](checkbox.md) - Toggle checkbox

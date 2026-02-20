# Link

Text link widget with optional focus/press behavior and terminal hyperlink support.

## Usage

```typescript
ui.link("https://rezi.dev/docs", "Docs")
ui.link({
  id: "docs-link",
  url: "https://rezi.dev/docs",
  label: "Documentation",
  onPress: () => openDocs(),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | `string` | **required** | Target URL for hyperlink-capable terminals |
| `label` | `string` | `url` | Display text |
| `id` | `string` | - | Enables focus and action routing when provided |
| `disabled` | `boolean` | `false` | Renders text but disables focus/press |
| `style` | `TextStyle` | - | Optional style override |
| `onPress` | `() => void` | - | Local press handler |
| `key` | `string` | - | Reconciliation key |

## Behavior

- Link text defaults to `url` when `label` is omitted.
- With `id` and `disabled !== true`, Enter/Space/click trigger a `press` action.
- On drawlist v3, Rezi emits hyperlink metadata; on older builders it degrades to styled text.

## Related

- [Button](button.md)
- [Focus Zone](focus-zone.md)

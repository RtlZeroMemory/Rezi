# `Callout`

Highlighted message box for important information.

## Usage

```ts
ui.callout("Connection restored", {
  variant: "success",
  title: "Online",
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string` | **required** | Callout text |
| `variant` | `"info" \| "success" \| "warning" \| "error"` | `"info"` | Visual variant |
| `title` | `string` | - | Optional title line |
| `icon` | `string` | - | Optional icon override |
| `style` | `TextStyle` | - | Optional style override |

## Design System Styling

Callouts are design-system styled by default when the active theme provides semantic color tokens. The `variant` maps to the callout recipe tone.

Manual `style` overrides are merged on top of the recipe result (they do not disable recipes).

If the active theme does not provide semantic color tokens, callouts fall back to non-recipe rendering.

## Related

- [Error display](error-display.md)
- [Badge](badge.md)

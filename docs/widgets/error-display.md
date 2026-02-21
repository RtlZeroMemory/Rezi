# `ErrorDisplay`

Displays an error message with optional stack trace and retry action.

## Usage

```ts
ui.errorDisplay("Build failed", {
  title: "Build error",
  stack: state.stack,
  showStack: state.showStack,
  onRetry: () => retryBuild(),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string` | **required** | Error message text |
| `title` | `string` | `"Error"` | Title text |
| `stack` | `string` | - | Optional stack trace |
| `showStack` | `boolean` | `false` | Whether to render the stack trace |
| `onRetry` | `() => void` | - | Optional retry action |
| `style` | `TextStyle` | - | Optional style override |

## Notes

- If `showStack` is `true` but `stack` is empty, only the title and message render.

## Related

- [Error boundary](error-boundary.md)
- [Callout](callout.md)
- [Empty state](empty.md)

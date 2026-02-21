# `ErrorBoundary`

Protects a risky widget subtree so runtime exceptions do not fault the whole app.

## Usage

```ts
ui.errorBoundary({
  children: RiskyWidget(),
  fallback: (error) =>
    ui.errorDisplay(error.message, {
      title: "Widget failed",
      onRetry: error.retry,
    }),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `VNode` | **required** | Protected subtree |
| `fallback` | `(error: ErrorBoundaryError) => VNode` | **required** | Fallback renderer when subtree throws |
| `key` | `string` | - | Reconciliation key |

## Fallback Error Payload

| Field | Type | Description |
|------|------|-------------|
| `code` | `"ZRUI_USER_CODE_THROW"` | Runtime error code for trapped subtree throw |
| `message` | `string` | Display-friendly message |
| `detail` | `string` | Full runtime detail string |
| `stack` | `string \| undefined` | Optional stack trace |
| `retry` | `() => void` | Retries only this boundary subtree on the next commit |

## Behavior

- The boundary stays in fallback mode across normal app updates until `error.retry()` is called.
- Retry marks only the boundary subtree dirty and re-attempts rendering it.
- If fallback code itself throws or returns an invalid value, the runtime treats it as a normal user-code failure.

## Related

- [Error display](error-display.md)
- [Callout](callout.md)
- [Lifecycle & Updates](../guide/lifecycle-and-updates.md)

# Error Handling

Rezi uses a layered error model so apps can recover from user-code failures while still surfacing fatal runtime errors clearly.

## Error classes

- **Synchronous misuse errors**: thrown immediately (`ZrUiError`) for invalid API usage/state.
- **Recoverable render errors**: widget/view throw paths that can be isolated by boundaries.
- **Fatal runtime errors**: emitted as `onEvent` fatal events and treated as terminal for that app instance.

## Subtree isolation with `ui.errorBoundary(...)`

Use `ui.errorBoundary(...)` around risky subtrees:

- catches subtree throws
- renders a fallback widget
- supports targeted retry via `error.retry()`

See:

- [Error Boundary Widget](../widgets/error-boundary.md)
- [Error Display Widget](../widgets/error-display.md)

## App-level fatal handling

Register `onEvent` and handle `kind: "fatal"` as terminal:

- log/persist diagnostic details
- show user-facing fallback UX
- stop/restart app instance when appropriate

Fatal event semantics are documented in:

- [Lifecycle & Updates](lifecycle-and-updates.md#error-handling)

## Common practices

- Keep view functions pure and deterministic.
- Avoid throwing from event handlers; return error state instead.
- Wrap integration points (network/filesystem/process) and convert errors into explicit UI state.
- For form submits, use `useForm` `onSubmitError` / `submitError` to surface failures.

## Runtime error codes

Rezi throws deterministic `ZrUiError` codes such as:

- `ZRUI_INVALID_STATE`
- `ZRUI_INVALID_PROPS`
- `ZRUI_DUPLICATE_ID`
- `ZRUI_USER_CODE_THROW`
- `ZRUI_BACKEND_ERROR`

See:

- [Lifecycle & Updates](lifecycle-and-updates.md#runtime-error-codes)

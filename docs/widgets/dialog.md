# Dialog

Declarative dialog sugar over `ui.modal(...)` for message + action flows.

## Usage

```ts
ui.dialog({
  id: "confirm",
  title: "Delete Item",
  message: "This cannot be undone.",
  actions: [
    { label: "Cancel", onPress: close },
    { label: "Delete", intent: "danger", onPress: handleDelete },
  ],
})
```

## Props

`ui.dialog(...)` accepts modal-like props plus `message` + declarative `actions`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Dialog identifier |
| `title` | `string` | - | Optional dialog title |
| `message` | `string \| VNode` | **required** | Dialog body content |
| `actions` | `DialogAction[]` | **required** | Declarative action list |
| `onClose` | `() => void` | - | Close callback |
| `initialFocus` | `string` | - | Focus target on open |
| `returnFocusTo` | `string` | - | Focus target on close |
| `closeOnBackdrop` | `boolean` | `true` | Close on backdrop click |
| `closeOnEscape` | `boolean` | `true` | Close on `Esc` |

`DialogAction` shape:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Optional action button id (auto-generated when omitted) |
| `label` | `string` | Button label |
| `intent` | `"primary" \| "danger"` | Button intent hint |
| `onPress` | `() => void` | Action callback |
| `disabled` | `boolean` | Optional disabled state |
| `focusable` | `boolean` | Optional focus opt-out |

## Intent behavior

`action.intent` is respected when rendering dialog actions. This means
declarative dialog actions map through to button intents in the generated modal
action row.

## Related

- [Modal](modal.md)
- [Button](button.md)

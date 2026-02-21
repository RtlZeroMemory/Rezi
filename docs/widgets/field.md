# `Field`

A labeled form field wrapper for composing inputs and validation UI.

## Usage

```ts
ui.field({
  label: "Name",
  required: true,
  error: state.nameError,
  hint: "Your display name",
  children: ui.input({
    id: "name",
    value: state.name,
    onInput: (value) => app.update((s) => ({ ...s, name: value })),
  }),
})
```

With `useForm`, you can generate the same structure in one call:

```ts
form.field("name", { label: "Name", required: true, hint: "Your display name" })
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | **required** | Field label |
| `children` | `VNode` | **required** | Wrapped input widget |
| `required` | `boolean` | `false` | Show required indicator |
| `error` | `string` | - | Error message |
| `hint` | `string` | - | Helper text |

## Notes

- The wrapped child remains the focusable element.
- Use `Field` to keep label, hint, and error layout consistent across forms.

## Related

- [Input](input.md)
- [Select](select.md)

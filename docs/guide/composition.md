# Composition

Rezi supports reusable, stateful widgets via `defineWidget`. Composite widgets integrate with the runtime's reconciliation and update pipeline while keeping your `view` pure.

## Defining a widget

```typescript
import { defineWidget, ui } from "@rezi-ui/core";

type CounterProps = { label: string };

export const Counter = defineWidget<CounterProps>((props, ctx) => {
  const [count, setCount] = ctx.useState(0);

  return ui.row({ gap: 1 }, [
    ui.text(`${props.label}: ${count}`),
    ui.button({
      id: ctx.id("inc"),
      label: "+1",
      onPress: () => setCount((c) => c + 1),
    }),
  ]);
});
```

## WidgetContext hooks

Composite widgets receive a `WidgetContext` with:

- `useState` and `useRef` for local state
- `useEffect` for post-commit effects with cleanup
- `useMemo` and `useCallback` for memoization with React-compatible dependency semantics
- `useAppState` to select a slice of app state
- `id()` to create scoped IDs for focusable widgets
- `invalidate()` to request a re-render

Behavior details:

- `useEffect` cleanup runs before an effect re-fires, and unmount cleanups run in reverse declaration order.
- `useMemo` and `useCallback` compare dependencies with `Object.is` (including `NaN` equality and `+0/-0` distinction).
- `useAppState` uses selector snapshots and `Object.is` equality; widgets only re-render when selected values change.
- Hook rules follow React constraints: keep both hook order and hook count consistent on every render.

## Example: memoized table data

```typescript
const filteredRows = ctx.useMemo(
  () => rows.filter((row) => row.name.includes(query)),
  [rows, query],
);

const onSubmit = ctx.useCallback(() => save(filteredRows), [save, filteredRows]);
```

## Related

- [Concepts](concepts.md)
- [Lifecycle & updates](lifecycle-and-updates.md)
- [Widget catalog](../widgets/index.md)
- [API reference](../api/reference/index.html)

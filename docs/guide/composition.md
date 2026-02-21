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
- `useAppState` to select a slice of app state
- `id()` to create scoped IDs for focusable widgets
- `invalidate()` to request a re-render

Behavior details:

- `useEffect` cleanup runs before an effect re-fires, and unmount cleanups run in reverse declaration order.
- `useAppState` uses selector snapshots and `Object.is` equality; widgets only re-render when selected values change.
- Hook rules follow React constraints: keep both hook order and hook count consistent on every render.

## Utility hooks

Rezi ships a small utility-hook layer for common composition patterns:

- `useDebounce(ctx, value, delayMs)` returns a debounced value.
- `useAsync(ctx, task, deps)` runs async tasks with loading/error state and stale-result protection.
- `usePrevious(ctx, value)` returns the previous render value.

```typescript
import { defineWidget, ui, useAsync, useDebounce, usePrevious } from "@rezi-ui/core";

type SearchProps = { query: string };

const SearchResults = defineWidget<SearchProps>((props, ctx) => {
  const debouncedQuery = useDebounce(ctx, props.query, 250);
  const prevQuery = usePrevious(ctx, debouncedQuery);

  const { data, loading, error } = useAsync(
    ctx,
    () => fetchResults(debouncedQuery),
    [debouncedQuery],
  );

  if (loading) return ui.text("Loading...");
  if (error) return ui.text("Request failed");

  return ui.column([
    ui.text(`Previous query: ${prevQuery ?? "(none)"}`),
    ui.text(`Results: ${String(data?.length ?? 0)}`),
  ]);
});

async function fetchResults(query: string): Promise<string[]> {
  return query.length > 0 ? [query] : [];
}
```

## Related

- [Concepts](concepts.md)
- [Lifecycle & updates](lifecycle-and-updates.md)
- [Widget catalog](../widgets/index.md)
- [API reference](../api/reference/index.html)

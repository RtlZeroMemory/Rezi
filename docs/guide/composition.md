# Composition

Rezi supports reusable, stateful widgets via `defineWidget`. Composite widgets integrate with the runtime's reconciliation and update pipeline while keeping your `view` pure.

## Defining a widget

```typescript
import { defineWidget, ui } from "@rezi-ui/core";

type CounterProps = { label: string };

export const Counter = defineWidget<CounterProps>((props, ctx) => {
  const [count, setCount] = ctx.useState(0);

  return ui.card(`${props.label}`, [
    ui.row({ gap: 1, items: "center" }, [
      ui.text(`Count: ${count}`, { variant: "heading" }),
      ui.spacer({ flex: 1 }),
      ui.button({
        id: ctx.id("inc"),
        label: "+1",
        intent: "primary",
        onPress: () => setCount((c) => c + 1),
      }),
    ]),
  ]);
});
```

## WidgetContext hooks

Composite widgets receive a `WidgetContext` with:

- `useState` and `useRef` for local state
- `useEffect` for post-commit effects with cleanup
- `useMemo` and `useCallback` for memoization with React-compatible dependency semantics
- `useAppState` to select a slice of app state
- `useTheme` to read semantic design tokens (`ColorTokens | null`)
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

## Example: theme-aware custom widget

```typescript
import { defineWidget, recipe, ui } from "@rezi-ui/core";

const ThemedSummary = defineWidget<{ title: string; value: string; key?: string }>((props, ctx) => {
  const tokens = ctx.useTheme();
  const titleStyle = tokens ? recipe.text(tokens, { role: "caption" }) : { dim: true };
  const valueStyle = tokens ? recipe.text(tokens, { role: "title" }) : { bold: true };

  return ui.box({ border: "rounded", p: 1 }, [
    ui.text(props.title, { style: titleStyle }),
    ui.text(props.value, { style: valueStyle }),
  ]);
});
```

## Utility hooks

Rezi ships a small utility-hook layer for common composition patterns:

- Animation hooks for numeric motion and sequencing:
  - `useTransition(ctx, value, config?)` interpolates toward a numeric target over duration/easing.
  - `useSpring(ctx, target, config?)` animates toward a target with spring physics.
  - `useSequence(ctx, keyframes, config?)` runs keyframe timelines (optional loop).
  - `useStagger(ctx, items, config?)` returns per-item eased progress for staggered entrances.
- `useDebounce(ctx, value, delayMs)` returns a debounced value.
- `useAsync(ctx, task, deps)` runs async tasks with loading/error state and stale-result protection.
- `usePrevious(ctx, value)` returns the previous render value.
- `useStream(ctx, asyncIterable, deps?)` subscribes to async iterables and re-renders on each value.
- `useEventSource(ctx, url, options?)` consumes SSE feeds with automatic reconnect.
- `useWebSocket(ctx, url, protocol?, options?)` consumes websocket feeds with message parsing.
- `useInterval(ctx, fn, ms)` runs cleanup-safe intervals with latest-callback semantics.
- `useTail(ctx, filePath, options?)` tails file sources with bounded in-memory backpressure.

```typescript
import {
  defineWidget,
  ui,
  useAsync,
  useDebounce,
  useSequence,
  useSpring,
  useStagger,
  useTransition,
  usePrevious,
  useStream,
} from "@rezi-ui/core";

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

const AnimatedValue = defineWidget<{ value: number; key?: string }>((props, ctx) => {
  const eased = useTransition(ctx, props.value, { duration: 160, easing: "easeOutCubic" });
  const spring = useSpring(ctx, props.value, { stiffness: 180, damping: 22 });
  const pulse = useSequence(ctx, [0.2, 1, 0.4, 1], { duration: 120, loop: true });
  const stagger = useStagger(ctx, [0, 1, 2], { delay: 30, duration: 140 });

  return ui.text(
    `eased=${eased.toFixed(1)} spring=${spring.toFixed(1)} pulse=${pulse.toFixed(2)} stagger0=${(stagger[0] ?? 0).toFixed(2)}`,
  );
});

async function fetchResults(query: string): Promise<string[]> {
  return query.length > 0 ? [query] : [];
}

async function* fetchMetrics(): AsyncGenerator<number> {
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    yield Math.round(Math.random() * 100);
  }
}

const LiveMetric = defineWidget<{ key?: string }>((props, ctx) => {
  const metricsStream = ctx.useMemo(() => fetchMetrics(), []);
  const metric = useStream(ctx, metricsStream, [metricsStream]);
  return ui.text(`Live metric: ${String(metric.value ?? 0)}`);
});
```

## Related

- [Concepts](concepts.md)
- [Animation](animation.md)
- [Lifecycle & updates](lifecycle-and-updates.md)
- [Widget catalog](../widgets/index.md)
- [API reference](../api/reference/index.html)

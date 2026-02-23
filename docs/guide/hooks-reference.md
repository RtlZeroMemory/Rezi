# Hooks Reference

Hooks are functions available on the `WidgetContext` (`ctx`) inside `defineWidget` render functions. They let composite widgets manage local state, run side effects, and access app-level data without breaking the declarative VNode model.

```typescript
import { defineWidget, ui } from "@rezi-ui/core";

const MyWidget = defineWidget<{ key?: string }>((props, ctx) => {
  const [count, setCount] = ctx.useState(0);
  // ... use hooks here ...
  return ui.text(`Count: ${count}`);
});
```

## Core Hooks

### `ctx.useState`

Create local state that persists across renders. Returns a `[value, setter]` tuple.

**Signature:**

```typescript
ctx.useState<T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void]
```

**Description:**

- The `initial` argument is used only on the first render. Pass a function for lazy initialization (useful when the initial value is expensive to compute).
- The setter accepts either a new value or an updater function that receives the previous value.
- Calling the setter schedules a re-render of the widget.

**Example:**

```typescript
const MyWidget = defineWidget<{ key?: string }>((props, ctx) => {
  const [count, setCount] = ctx.useState(0);
  const [items, setItems] = ctx.useState<string[]>(() => []);

  return ui.column({ gap: 1 }, [
    ui.text(`Count: ${count}`),
    ui.button({
      id: ctx.id("inc"),
      label: "Increment",
      onPress: () => setCount((prev) => prev + 1),
    }),
    ui.button({
      id: ctx.id("add"),
      label: "Add Item",
      onPress: () => setItems((prev) => [...prev, `Item ${prev.length + 1}`]),
    }),
  ]);
});
```

**Rules:**

- Must be called in the same order every render (no conditional calls).
- The setter is stable across renders -- you do not need to memoize it.

---

### `ctx.useRef`

Create a mutable ref that persists across renders without triggering re-renders.

**Signature:**

```typescript
ctx.useRef<T>(initial: T): { current: T }
```

**Description:**

- Returns an object with a mutable `current` property.
- Changing `current` does **not** cause a re-render.
- Useful for storing values that need to survive across renders but should not trigger UI updates (timers, DOM references, mutable counters).

**Example:**

```typescript
const Timer = defineWidget<{ key?: string }>((props, ctx) => {
  const [elapsed, setElapsed] = ctx.useState(0);
  const intervalRef = ctx.useRef<ReturnType<typeof setInterval> | null>(null);

  ctx.useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return ui.text(`Elapsed: ${elapsed}s`);
});
```

---

### `ctx.useEffect`

Register a side effect to run after the commit phase. Similar to React's `useEffect`.

**Signature:**

```typescript
ctx.useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
```

**Description:**

- The `effect` function runs after the widget's VNode tree is committed.
- If `effect` returns a cleanup function, that cleanup runs before the next effect execution and when the widget unmounts.
- The `deps` array controls when the effect re-runs:
  - Omitted: runs after every render.
  - Empty array `[]`: runs once on mount, cleanup on unmount.
  - With values: re-runs when any dependency changes (compared with `Object.is`).

**Example:**

```typescript
const SearchBox = defineWidget<{ query: string; key?: string }>((props, ctx) => {
  const [results, setResults] = ctx.useState<string[]>([]);

  ctx.useEffect(() => {
    if (props.query.length === 0) {
      setResults([]);
      return;
    }

    let cancelled = false;
    fetchResults(props.query).then((data) => {
      if (!cancelled) setResults(data);
    });

    return () => { cancelled = true; };
  }, [props.query]);

  return ui.column({ gap: 1 }, [
    ui.text(`Results for "${props.query}":`),
    ...results.map((r, i) => ui.text(r, { key: String(i) })),
  ]);
});
```

---

### `ctx.useMemo`

Memoize a computed value until dependencies change.

**Signature:**

```typescript
ctx.useMemo<T>(factory: () => T, deps?: readonly unknown[]): T
```

**Description:**

- Calls `factory` on the first render and caches the result.
- On subsequent renders, returns the cached result unless one of the `deps` has changed (compared with `Object.is`).
- Use for expensive computations that depend on specific inputs.

**Example:**

```typescript
const FilteredList = defineWidget<{ items: Item[]; filter: string; key?: string }>(
  (props, ctx) => {
    const filtered = ctx.useMemo(
      () => props.items.filter((item) =>
        item.name.toLowerCase().includes(props.filter.toLowerCase())
      ),
      [props.items, props.filter],
    );

    return ui.column({ gap: 0 },
      filtered.map((item) => ui.text(item.name, { key: item.id })),
    );
  },
);
```

---

### `ctx.useCallback`

Memoize a callback reference until dependencies change.

**Signature:**

```typescript
ctx.useCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps?: readonly unknown[],
): T
```

**Description:**

- Returns a stable function reference that only changes when a dependency changes.
- Useful when passing callbacks to child widgets or hooks that compare by reference.

**Example:**

```typescript
const Editor = defineWidget<{ key?: string }>((props, ctx) => {
  const [text, setText] = ctx.useState("");

  const handleInput = ctx.useCallback(
    (value: string) => setText(value),
    [],
  );

  return ui.input({
    id: ctx.id("editor"),
    value: text,
    onInput: handleInput,
  });
});
```

---

## App Hooks

### `ctx.useAppState`

Select a slice of the application-level state. Available when the widget has access to app state (the `State` type parameter of `WidgetContext<State>`).

**Signature:**

```typescript
ctx.useAppState<T>(selector: (state: State) => T): T
```

**Description:**

- Runs `selector` against the current app state and returns the result.
- The widget re-renders when the selected slice changes.

**Example:**

```typescript
const UserBadge = defineWidget<{ key?: string }, AppState>((props, ctx) => {
  const userName = ctx.useAppState((s) => s.user.name);
  const isOnline = ctx.useAppState((s) => s.user.online);

  return ui.row({ gap: 1 }, [
    ui.status(isOnline ? "online" : "offline"),
    ui.text(userName),
  ]);
});
```

### `ctx.useTheme`

Access the current theme's semantic design tokens.

**Signature:**

```typescript
ctx.useTheme(): ColorTokens | null
```

**Description:**

- Returns `ColorTokens` when semantic tokens are available for the active theme.
- Returns `null` for legacy themes that do not expose semantic token slots.
- Intended for recipe-driven custom widgets built with `defineWidget(...)`.

**Example:**

```typescript
import { defineWidget, recipe, ui } from "@rezi-ui/core";

const ThemedCard = defineWidget<{ title: string; key?: string }>((props, ctx) => {
  const tokens = ctx.useTheme();
  if (tokens) {
    const surface = recipe.surface(tokens, { elevation: 1 });
    return ui.box({ border: surface.border, style: surface.bg }, [ui.text(props.title)]);
  }
  return ui.panel(props.title, [ui.text("legacy theme fallback")]);
});
```

### `ctx.useViewport`

Read the widget's current viewport snapshot.

**Signature:**

```typescript
ctx.useViewport(): ResponsiveViewportSnapshot
```

**Description:**

- Returns the current renderer viewport snapshot for responsive/layout-aware rendering.
- The runtime triggers viewport usage tracking when available and falls back to the default viewport snapshot.

---

## Utility Hooks

These are standalone functions (not on `ctx`) that accept a context argument. They compose core hooks internally.

### Animation Hooks

These hooks animate numeric values declaratively inside `defineWidget(...)`.

### `useTransition`

Animate from the current numeric value to a new target over a duration/easing curve.

**Signature:**

```typescript
import { useTransition, type UseTransitionConfig } from "@rezi-ui/core";

useTransition(
  ctx: WidgetContext,
  value: number,
  config?: UseTransitionConfig,
): number
```

**Description:**

- Returns the current interpolated value.
- Retargeting while in motion starts from the current interpolated value (no jump back).
- Default duration is `160ms`.
- Non-positive durations snap on the next effect pass.
- Non-finite targets are handled safely by snapping.

**Example:**

```typescript
import { defineWidget, ui, useTransition } from "@rezi-ui/core";

const Meter = defineWidget<{ target: number; key?: string }>((props, ctx) => {
  const value = useTransition(ctx, props.target, { duration: 180, easing: "easeOutCubic" });
  return ui.text(`Value: ${value.toFixed(1)}`);
});
```

---

### `useSpring`

Animate a numeric target with spring physics.

**Signature:**

```typescript
import { useSpring, type UseSpringConfig } from "@rezi-ui/core";

useSpring(
  ctx: WidgetContext,
  target: number,
  config?: UseSpringConfig,
): number
```

**Description:**

- Returns the spring-simulated value for the current render.
- Handles retargeting mid-flight without resetting.
- Defaults: `stiffness=170`, `damping=26`, `mass=1`, `restDelta=0.001`, `restSpeed=0.001`, `maxDeltaMs=32`.
- Non-finite values snap safely.

**Example:**

```typescript
import { defineWidget, ui, useSpring } from "@rezi-ui/core";

const SpringGauge = defineWidget<{ target: number; key?: string }>((props, ctx) => {
  const animated = useSpring(ctx, props.target, { stiffness: 190, damping: 22 });
  return ui.text(`Spring: ${animated.toFixed(2)}`);
});
```

---

### `useSequence`

Run a numeric keyframe timeline and return the current interpolated value.

**Signature:**

```typescript
import {
  useSequence,
  type UseSequenceConfig,
} from "@rezi-ui/core";

type SequenceFrame =
  | number
  | Readonly<{
      value: number;
      duration?: number;
      easing?: UseSequenceConfig["easing"];
    }>;

useSequence(
  ctx: WidgetContext,
  keyframes: readonly SequenceFrame[],
  config?: UseSequenceConfig,
): number
```

**Description:**

- Accepts numeric keyframes or `{ value, duration?, easing? }` keyframes.
- `config.duration`/`config.easing` act as defaults for segments.
- `config.loop` repeats the timeline.
- Empty keyframes return `0`.
- Default segment duration is `160ms` when not overridden.

**Example:**

```typescript
import { defineWidget, ui, useSequence } from "@rezi-ui/core";

const Pulse = defineWidget<{ key?: string }>((props, ctx) => {
  const alpha = useSequence(ctx, [0.2, 1, 0.35, 0.9], { duration: 120, loop: true });
  return ui.box({ border: "rounded", opacity: alpha, p: 1 }, [ui.text("Pulse")]);
});
```

---

### `useStagger`

Animate a list with staggered starts and return per-item eased progress in `[0..1]`.

**Signature:**

```typescript
import { useStagger, type UseStaggerConfig } from "@rezi-ui/core";

useStagger<T>(
  ctx: WidgetContext,
  items: readonly T[],
  config?: UseStaggerConfig,
): readonly number[]
```

**Description:**

- Returns one progress value per item.
- Useful for staggered opacity/position/scale-style numeric effects.
- Defaults: `delay=40ms`, `duration=180ms`.
- Empty item lists return an empty frozen array.

**Example:**

```typescript
import { defineWidget, ui, useStagger } from "@rezi-ui/core";

const Rail = defineWidget<{ labels: readonly string[]; key?: string }>((props, ctx) => {
  const progress = useStagger(ctx, props.labels, { delay: 36, duration: 160 });

  return ui.row(
    { gap: 1 },
    props.labels.map((label, i) =>
      ui.box(
        { key: label, border: "single", p: 1, opacity: 0.25 + 0.75 * (progress[i] ?? 0) },
        [ui.text(label)],
      ),
    ),
  );
});
```

### Animation semantics

- Retargeting mid-flight always starts a fresh run from the current interpolated value.
- Looping sequences (`loop: true`) run continuously.
- Animation hook configs currently do not include an `onComplete` callback field.

---

### `useDebounce`

Return a debounced copy of a value that updates only after a delay.

**Signature:**

```typescript
import { useDebounce } from "@rezi-ui/core";

useDebounce<T>(ctx: WidgetContext, value: T, delayMs: number): T
```

**Description:**

- The returned value updates only after `delayMs` milliseconds have elapsed without a new input value.
- Non-positive or non-finite delays apply the value on the next effect pass (effectively no delay).
- Internally uses `ctx.useState` and `ctx.useEffect`.

**Example:**

```typescript
import { defineWidget, useDebounce, ui } from "@rezi-ui/core";

const SearchInput = defineWidget<{ key?: string }>((props, ctx) => {
  const [query, setQuery] = ctx.useState("");
  const debouncedQuery = useDebounce(ctx, query, 300);

  ctx.useEffect(() => {
    if (debouncedQuery.length > 0) {
      performSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  return ui.input({
    id: ctx.id("search"),
    value: query,
    onInput: (v) => setQuery(v),
  });
});
```

---

### `usePrevious`

Track the previous render's value.

**Signature:**

```typescript
import { usePrevious } from "@rezi-ui/core";

usePrevious<T>(ctx: WidgetContext, value: T): T | undefined
```

**Description:**

- Returns `undefined` on the first render.
- On subsequent renders, returns the value from the previous render cycle.
- Internally uses `ctx.useRef` and `ctx.useEffect`.

**Example:**

```typescript
import { defineWidget, usePrevious, ui } from "@rezi-ui/core";

const CounterWithDelta = defineWidget<{ count: number; key?: string }>(
  (props, ctx) => {
    const prevCount = usePrevious(ctx, props.count);
    const delta = prevCount !== undefined ? props.count - prevCount : 0;

    return ui.row({ gap: 1 }, [
      ui.text(`Count: ${props.count}`),
      delta !== 0 && ui.text(`(${delta > 0 ? "+" : ""}${delta})`, { dim: true }),
    ]);
  },
);
```

---

### `useAsync`

Run an async operation when dependencies change. Manages loading/data/error state automatically.

**Signature:**

```typescript
import { useAsync, type UseAsyncState } from "@rezi-ui/core";

useAsync<T>(
  ctx: WidgetContext,
  task: () => Promise<T>,
  deps: readonly unknown[],
): UseAsyncState<T>

type UseAsyncState<T> = Readonly<{
  data: T | undefined;
  loading: boolean;
  error: unknown;
}>;
```

**Description:**

- Sets `loading` to `true` while the operation is in-flight.
- Stores the resolved value in `data`.
- Stores any thrown/rejected value in `error`.
- Ignores stale completions from older dependency runs (race condition safe).
- Internally uses `ctx.useState`, `ctx.useRef`, and `ctx.useEffect`.

**Example:**

```typescript
import { defineWidget, useAsync, ui } from "@rezi-ui/core";

const UserProfile = defineWidget<{ userId: string; key?: string }>(
  (props, ctx) => {
    const { data: user, loading, error } = useAsync(
      ctx,
      () => fetchUser(props.userId),
      [props.userId],
    );

    if (loading) return ui.spinner({ label: "Loading profile..." });
    if (error) return ui.errorDisplay("Failed to load profile");
    if (!user) return ui.empty("No user found");

    return ui.column({ gap: 1 }, [
      ui.text(user.name, { style: { bold: true } }),
      ui.text(user.email, { dim: true }),
    ]);
  },
);
```

---

### `useStream`

Subscribe to an async iterable and re-render on each value.

**Signature:**

```typescript
import { useStream, type UseStreamState } from "@rezi-ui/core";

useStream<T>(
  ctx: WidgetContext,
  stream: AsyncIterable<T> | undefined,
  deps?: readonly unknown[],
): UseStreamState<T>

type UseStreamState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  error: unknown;
  done: boolean;
}>;
```

**Description:**

- Subscribes to an async iterable and stores the latest value in `value`.
- Sets `loading` while waiting for the first value.
- Marks `done` once the iterable completes.
- Ignores stale values from older subscriptions after dependency changes.

**Example:**

```typescript
import { defineWidget, useStream, ui } from "@rezi-ui/core";

async function* telemetryStream(): AsyncGenerator<number> {
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    yield Math.round(Math.random() * 100);
  }
}

const Metrics = defineWidget<{ key?: string }>((props, ctx) => {
  const stream = ctx.useMemo(() => telemetryStream(), []);
  const metric = useStream(ctx, stream, [stream]);
  return ui.text(`CPU: ${String(metric.value ?? 0)}%`);
});
```

---

### `useEventSource`

Subscribe to an SSE endpoint with automatic reconnect.

**Signature:**

```typescript
import { useEventSource, type UseEventSourceOptions } from "@rezi-ui/core";

useEventSource<T = string>(
  ctx: WidgetContext,
  url: string,
  options?: UseEventSourceOptions<T>,
): Readonly<{
  value: T | undefined;
  loading: boolean;
  connected: boolean;
  reconnectAttempts: number;
  error: unknown;
}>
```

**Description:**

- Opens an `EventSource` stream (or a custom `factory` from options).
- Reconnects automatically after connection failures.
- Supports custom parsing with `options.parse(message)`.
- Exposes connection status and retry count.

**Example:**

```typescript
import { defineWidget, useEventSource, ui } from "@rezi-ui/core";

const Alerts = defineWidget<{ key?: string }>((props, ctx) => {
  const alerts = useEventSource<{ severity: string; message: string }>(
    ctx,
    "https://ops.example.com/alerts",
    {
      parse: (message) => JSON.parse(message.data) as { severity: string; message: string },
      reconnectMs: 1500,
    },
  );

  if (!alerts.connected && alerts.loading) return ui.text("Connecting alerts feed...");
  if (alerts.error) return ui.errorDisplay("Alerts feed disconnected");
  return ui.text(alerts.value?.message ?? "No alerts");
});
```

---

### `useWebSocket`

Subscribe to a websocket endpoint with parsed messages and reconnect support.

**Signature:**

```typescript
import { useWebSocket, type UseWebSocketOptions } from "@rezi-ui/core";

useWebSocket<T = string>(
  ctx: WidgetContext,
  url: string,
  protocol?: string | readonly string[],
  options?: UseWebSocketOptions<T>,
): Readonly<{
  value: T | undefined;
  loading: boolean;
  connected: boolean;
  reconnectAttempts: number;
  error: unknown;
  send: (payload: string | ArrayBuffer | ArrayBufferView) => boolean;
  close: (code?: number, reason?: string) => void;
}>
```

**Description:**

- Connects to `url` with optional protocol(s).
- Parses incoming `message` payloads via `options.parse`.
- Auto-reconnects after unexpected connection closure.
- Provides `send(...)` and `close(...)` helpers.

**Example:**

```typescript
import { defineWidget, useWebSocket, ui } from "@rezi-ui/core";

const LiveQueue = defineWidget<{ key?: string }>((props, ctx) => {
  const socket = useWebSocket<{ queued: number }>(ctx, "wss://ops.example.com/queue", "json", {
    parse: (payload) => JSON.parse(String(payload)) as { queued: number },
  });

  return ui.text(`Queued jobs: ${String(socket.value?.queued ?? 0)}`);
});
```

---

### `useInterval`

Run an interval callback with automatic cleanup and latest-callback semantics.

**Signature:**

```typescript
import { useInterval } from "@rezi-ui/core";

useInterval(ctx: WidgetContext, fn: () => void, ms: number): void
```

**Description:**

- Registers a repeating callback every `ms`.
- Automatically clears the interval on dependency change/unmount.
- Always invokes the latest callback without forcing interval recreation.

**Example:**

```typescript
import { defineWidget, useInterval, ui } from "@rezi-ui/core";

const Clock = defineWidget<{ key?: string }>((props, ctx) => {
  const [now, setNow] = ctx.useState(() => Date.now());
  useInterval(ctx, () => setNow(Date.now()), 1000);
  return ui.text(new Date(now).toISOString());
});
```

---

### `useTail`

Tail a file stream and keep a bounded line buffer with drop accounting.

**Signature:**

```typescript
import { useTail, type UseTailOptions } from "@rezi-ui/core";

useTail<T = string>(
  ctx: WidgetContext,
  filePath: string,
  options?: UseTailOptions<T>,
): Readonly<{
  latest: T | undefined;
  lines: readonly T[];
  dropped: number;
  loading: boolean;
  error: unknown;
}>
```

```typescript
type UseTailOptions<T> = Readonly<{
  enabled?: boolean;
  maxBuffer?: number;
  fromEnd?: boolean;
  pollMs?: number;
  parse?: (chunk: string) => T;
  sourceFactory?: TailSourceFactory<string>;
}>
```

**Description:**

- Streams new file lines from a runtime-specific tail source.
- Keeps only the most recent `maxBuffer` lines in memory.
- Increments `dropped` when old lines are evicted under heavy throughput.
- In Node apps, importing `@rezi-ui/node` configures a default tail source.
- For custom runtimes, register a global tail adapter with `setDefaultTailSourceFactory(...)` or pass `options.sourceFactory` per hook call.

**Example:**

```typescript
import { defineWidget, useTail, ui } from "@rezi-ui/core";

const Logs = defineWidget<{ key?: string }>((props, ctx) => {
  const tail = useTail(ctx, "/var/log/app.log", { maxBuffer: 200 });

  if (tail.error) return ui.errorDisplay("Tail stream unavailable");
  return ui.column(
    tail.lines.map((line, i) => ui.text(line, { key: `${String(i)}-${line}` })),
  );
});
```

**Custom runtime registration:**

```typescript
import { setDefaultTailSourceFactory } from "@rezi-ui/core";

setDefaultTailSourceFactory((filePath, options) => {
  // Return an AsyncIterable<string> for your runtime.
  return myRuntimeTailSource(filePath, options);
});
```

---

## Widget Hooks

Higher-level hooks that manage complex widget state patterns. These are standalone functions that accept a `WidgetContext` as their first argument.

### `useTable`

Convenience hook that wires up sorting, selection, and row-key management for `ui.table`. Returns a `props` object that can be spread directly into `ui.table(...)`.

**Signature:**

```typescript
import { useTable, type UseTableOptions, type UseTableResult } from "@rezi-ui/core";

useTable<T, State = void>(
  ctx: WidgetContext<State>,
  options: UseTableOptions<T>,
): UseTableResult<T>
```

**Key options:**

```typescript
type UseTableOptions<T> = {
  id?: string;                                   // Table widget ID (auto-generated if omitted)
  rows: readonly T[];                            // Data rows
  columns: readonly TableColumn<T>[];            // Column definitions
  getRowKey?: (row: T, index: number) => string; // Row identity (defaults to row.id or index)
  selectable?: TableSelectionMode;               // "none" | "single" | "multi" (default: "none")
  sortable?: boolean;                            // Enable sorting on all columns (default: false)
  defaultSelection?: readonly string[];          // Initial selection
  defaultSortColumn?: string;                    // Initial sort column key
  defaultSortDirection?: SortDirection;           // "asc" | "desc" (default: "asc")
  onSelectionChange?: (keys: readonly string[]) => void;
  onSortChange?: (column: string, direction: SortDirection) => void;
  // ... plus any other TableProps (passed through)
};
```

**Return value:**

```typescript
type UseTableResult<T> = {
  props: TableProps<T>;                          // Spread into ui.table(...)
  rows: readonly T[];                            // Sorted rows (for external use)
  selection: readonly string[];                  // Current selection keys
  sortColumn: string | undefined;
  sortDirection: SortDirection | undefined;
  clearSelection: () => void;
  setSort: (column: string, direction: SortDirection) => void;
};
```

**Example:**

```typescript
import { defineWidget, useTable, ui } from "@rezi-ui/core";

type FileRow = { id: string; name: string; size: number };

const FileTable = defineWidget<{ files: FileRow[]; key?: string }>(
  (props, ctx) => {
    const table = useTable(ctx, {
      rows: props.files,
      columns: [
        { key: "name", header: "Name", flex: 1 },
        { key: "size", header: "Size", width: 10, align: "right" },
      ],
      selectable: "multi",
      sortable: true,
    });

    return ui.column({ gap: 1 }, [
      ui.text(`${table.selection.length} selected`),
      ui.table(table.props),
    ]);
  },
);
```

---

### `useModalStack`

Manage a LIFO stack of modals with automatic focus restoration between layers.

**Signature:**

```typescript
import { useModalStack, type UseModalStack } from "@rezi-ui/core";

useModalStack<State = void>(ctx: WidgetContext<State>): UseModalStack
```

**Return value:**

```typescript
type UseModalStack = {
  push: (id: string, props: Omit<ModalProps, "id">) => void;   // Push a new modal
  pop: () => void;                                               // Remove top modal
  clear: () => void;                                             // Remove all modals
  current: () => string | null;                                  // ID of top modal
  size: number;                                                  // Number of stacked modals
  render: () => readonly VNode[];                                // Render all modals
};
```

**Description:**

- Modals are stacked in LIFO order; only the top modal captures focus.
- When a modal is popped, focus returns to the first action button of the modal beneath it (or the element specified by `returnFocusTo`).
- Each modal's `onClose` is automatically wired to `pop()` (or remove-by-id for non-top modals).
- Keys are auto-versioned so `initialFocus` re-applies when a covered modal is revealed.

**Example:**

```typescript
import { defineWidget, useModalStack, ui } from "@rezi-ui/core";

const App = defineWidget<{ key?: string }>((props, ctx) => {
  const modals = useModalStack(ctx);

  const openConfirm = () => {
    modals.push("confirm", {
      title: "Confirm Action",
      content: ui.text("Are you sure?"),
      actions: [
        ui.button({ id: "yes", label: "Yes", onPress: () => {
          modals.pop();
          performAction();
        }}),
        ui.button({ id: "no", label: "No", onPress: () => modals.pop() }),
      ],
    });
  };

  return ui.layers([
    ui.column({ gap: 1 }, [
      ui.button({ id: "open", label: "Open Dialog", onPress: openConfirm }),
    ]),
    ...modals.render(),
  ]);
});
```

---

### `useForm`

Full-featured form management hook with validation, touched/dirty tracking, submission, array fields, disabled/read-only state, and multi-step wizard support.

**Signature:**

```typescript
import { useForm, type UseFormOptions, type UseFormReturn } from "@rezi-ui/core";

useForm<T extends Record<string, unknown>, State = void>(
  ctx: WidgetContext<State>,
  options: UseFormOptions<T>,
): UseFormReturn<T>
```

**Key options:**

```typescript
type UseFormOptions<T> = {
  initialValues: T;                                         // Initial field values
  validate?: (values: T) => Partial<Record<keyof T, string>>; // Sync validation
  validateAsync?: (values: T) => Promise<ValidationResult<T>>; // Async validation
  validateAsyncDebounce?: number;                           // Async debounce (default: 300ms)
  validateOnChange?: boolean;                               // Validate on every change (default: false)
  validateOnBlur?: boolean;                                 // Validate on blur (default: true)
  onSubmit: (values: T) => void | Promise<void>;           // Submit handler
  resetOnSubmit?: boolean;                                  // Reset after submit (default: false)
  disabled?: boolean;                                       // Form-level disabled
  readOnly?: boolean;                                       // Form-level read-only
  fieldDisabled?: Partial<Record<keyof T, boolean>>;        // Per-field disabled overrides
  fieldReadOnly?: Partial<Record<keyof T, boolean>>;        // Per-field read-only overrides
  wizard?: { steps: FormWizardStep<T>[]; initialStep?: number }; // Multi-step wizard
};
```

**Key return properties:**

| Property | Type | Description |
|----------|------|-------------|
| `values` | `T` | Current form field values |
| `errors` | `Partial<Record<keyof T, FieldErrorValue>>` | Validation errors by field |
| `touched` | `Partial<Record<keyof T, FieldBooleanValue>>` | Which fields have been blurred |
| `dirty` | `Partial<Record<keyof T, FieldBooleanValue>>` | Which fields differ from initial |
| `isValid` | `boolean` | True if no validation errors |
| `isDirty` | `boolean` | True if any field modified |
| `isSubmitting` | `boolean` | True during async submission |
| `bind(field)` | `UseFormInputBinding` | Spread-ready props for `ui.input(...)` |
| `field(field, opts?)` | `VNode` | Fully wired `ui.field(...)` with child `ui.input(...)` |
| `handleChange(field)` | `(value) => void` | Change handler factory |
| `handleBlur(field)` | `() => void` | Blur handler factory |
| `handleSubmit` | `() => void` | Submit (validates then calls `onSubmit`) |
| `reset` | `() => void` | Reset to initial values |
| `setFieldValue` | `(field, value) => void` | Programmatic field update |
| `setFieldError` | `(field, error) => void` | Programmatic error |
| `validateField` | `(field) => error` | Validate single field |
| `validateForm` | `() => errors` | Validate all fields |
| `useFieldArray(field)` | `UseFieldArrayReturn` | Dynamic array field helpers |
| `nextStep` | `() => boolean` | Wizard: advance (validates current step) |
| `previousStep` | `() => void` | Wizard: go back (no validation) |
| `goToStep(stepIndex)` | `(stepIndex: number) => boolean` | Wizard: jump to step (validates forward) |

**Example:**

```typescript
import { defineWidget, useForm, ui } from "@rezi-ui/core";

type LoginForm = { username: string; password: string };

const LoginWidget = defineWidget<{ key?: string }>((props, ctx) => {
  const form = useForm<LoginForm>(ctx, {
    initialValues: { username: "", password: "" },
    validate: (values) => {
      const errors: Partial<Record<keyof LoginForm, string>> = {};
      if (values.username.length === 0) errors.username = "Required";
      if (values.password.length < 8) errors.password = "Min 8 characters";
      return errors;
    },
    onSubmit: async (values) => {
      await login(values.username, values.password);
    },
  });

  return ui.form([
    // form.field() auto-wires label, error display, and input binding
    form.field("username", { label: "Username", required: true }),
    form.field("password", { label: "Password", required: true }),

    ui.actions([
      ui.button({
        id: ctx.id("submit"),
        label: form.isSubmitting ? "Submitting..." : "Log In",
        onPress: form.handleSubmit,
        disabled: form.isSubmitting,
      }),
    ]),
  ]);
});
```

**Array fields example:**

```typescript
const TagEditor = defineWidget<{ key?: string }>((props, ctx) => {
  const form = useForm<{ tags: string[] }>(ctx, {
    initialValues: { tags: ["default"] },
    onSubmit: (values) => saveTags(values.tags),
  });

  const tags = form.useFieldArray("tags");

  return ui.column({ gap: 1 }, [
    ...tags.values.map((tag, i) =>
      ui.row({ key: tags.keys[i], gap: 1 }, [
        ui.text(tag),
        ui.button({
          id: ctx.id(`remove-${String(i)}`),
          label: "X",
          onPress: () => tags.remove(i),
        }),
      ]),
    ),
    ui.button({
      id: ctx.id("add"),
      label: "Add Tag",
      onPress: () => tags.append("new-tag"),
    }),
  ]);
});
```

---

## Rules of Hooks

Hooks have ordering requirements that must be followed for correct behavior:

### 1. Call hooks in the same order every render

Hooks are tracked by **call order**, not by name. You must never conditionally call a hook -- the sequence of hook calls must be identical on every render of a given widget instance.

```typescript
// WRONG -- conditional hook call
const Widget = defineWidget<{ showExtra: boolean; key?: string }>((props, ctx) => {
  const [count, setCount] = ctx.useState(0);
  if (props.showExtra) {
    const [extra, setExtra] = ctx.useState("");  // Hook order changes!
  }
  return ui.text(`${count}`);
});

// CORRECT -- always call, conditionally use
const Widget = defineWidget<{ showExtra: boolean; key?: string }>((props, ctx) => {
  const [count, setCount] = ctx.useState(0);
  const [extra, setExtra] = ctx.useState("");    // Always called
  return ui.column({}, [
    ui.text(`${count}`),
    props.showExtra && ui.text(extra),            // Conditionally render
  ]);
});
```

### 2. Only call hooks inside `defineWidget` render functions

Hooks rely on the `WidgetContext` (`ctx`) which is only available inside the render function passed to `defineWidget`. Do not call hooks outside of this context.

```typescript
// WRONG -- hooks outside defineWidget
function badHelper() {
  const [x, setX] = ctx.useState(0);  // ctx is not available here
}

// CORRECT -- pass ctx explicitly for utility hooks
function goodHelper(ctx: WidgetContext) {
  return useDebounce(ctx, someValue, 300);
}
```

### 3. Never call hooks in loops with variable iteration counts

If the loop count can change between renders, the hook call count changes too.

```typescript
// WRONG -- variable loop count
items.forEach((item) => {
  const [selected, setSelected] = ctx.useState(false);
});

// CORRECT -- use a single state for the collection
const [selected, setSelected] = ctx.useState<Set<string>>(new Set());
```

### 4. Utility hooks consume multiple hook slots

Functions like `useTransition`, `useSpring`, `useSequence`, `useStagger`, `useDebounce`, `usePrevious`, `useAsync`, `useStream`, `useEventSource`, `useWebSocket`, `useInterval`, `useTail`, `useTable`, `useModalStack`, and `useForm` internally call multiple core hooks. Their position in the call sequence matters just like any other hook.

### 5. Effect cleanup runs before re-execution

When an effect's dependencies change, the cleanup function from the previous execution runs **before** the new effect runs. On unmount, all effect cleanups run. Always return cleanup functions for resources like timers, subscriptions, or abort controllers.

```typescript
ctx.useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(handleResponse);
  return () => controller.abort();  // Cleanup on deps change or unmount
}, [url]);
```

### 6. `ctx.id()` for scoped widget IDs

Always use `ctx.id(suffix)` to generate interactive widget IDs inside `defineWidget`. This ensures each widget instance gets unique IDs that do not collide with other instances of the same widget.

```typescript
// Generates IDs like "Counter_0_inc", "Counter_1_inc" for different instances
ui.button({ id: ctx.id("inc"), label: "+" })
```

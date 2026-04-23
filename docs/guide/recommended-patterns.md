# Recommended Patterns

This guide documents the best practices for building Rezi applications. These patterns are demonstrated in the `create-rezi` templates and have proven effective in production TUI apps.

## App Structure

Follow the template project layout to keep your app organized, testable, and maintainable:

```
my-tui-app/
  src/
    main.ts               # App bootstrap, lifecycle, and wiring
    types.ts              # State type, action union, domain types
    theme.ts              # Theme configuration and switching
    helpers/
      state.ts            # Initial state, reducer, selectors
      keybindings.ts      # Centralized key mappings
    screens/
      main-screen.ts      # Single-screen renderer
      index.ts            # Optional route factory for multi-screen apps
      settings.ts         # Routed screen view function when needed
    __tests__/
      reducer.test.ts     # Reducer examples
      render.test.ts      # Screen rendering examples
      keybindings.test.ts # Command/keybinding examples
  tsconfig.json
  package.json
```

Add `src/widgets/` only when you start extracting reusable composites; the shipped templates do not create it by default.

The entry point (`main.ts`) should be thin -- it creates the app, wires up keybindings, sets the view or routes, and calls `app.start()` or `app.run()`. All reducer and screen logic lives in the other modules.

```typescript
// src/main.ts
import { createNodeApp } from "@rezi-ui/node";
import { createInitialState, reduceMinimalState } from "./helpers/state.js";
import { renderMainScreen } from "./screens/main-screen.js";
import { themeSpec } from "./theme.js";
import type { MinimalAction, MinimalState } from "./types.js";

const initialState = createInitialState();
const app = createNodeApp<MinimalState>({
  initialState,
  theme: themeSpec(initialState.themeName).theme,
});

function dispatch(action: MinimalAction): void {
  app.update((previous) => reduceMinimalState(previous, action));
}

app.view((state) =>
  renderMainScreen(state, {
    onIncrement: () => dispatch({ type: "increment" }),
    onDecrement: () => dispatch({ type: "decrement" }),
    onCycleTheme: () => dispatch({ type: "cycle-theme" }),
    onToggleHelp: () => dispatch({ type: "toggle-help" }),
    onClearError: () => dispatch({ type: "set-error", message: null }),
  }),
);

app.keys({
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
  h: () => dispatch({ type: "toggle-help" }),
  "shift+/": () => dispatch({ type: "toggle-help" }),
});

await app.run();
```

## HSR-Safe Identity Rules

If you use hot state-preserving reload (`app.replaceView(...)`, `app.replaceRoutes(...)`, or
`createHotStateReload(...)`),
preservation quality depends on stable widget identity:

- keep interactive widget `id` values stable across edits
- keep `defineWidget` instance keys stable in dynamic lists
- avoid deriving ids from unstable values (timestamps/random)

These rules let Rezi reconcile old/new trees while preserving focus, local hook state,
and widget-local editor metadata.

## State Management

Use a **reducer pattern** with typed actions. This is the single most impactful pattern for keeping Rezi apps maintainable.

### Define Types

```typescript
// src/types.ts
export type Todo = { id: string; text: string; done: boolean };

export type State = {
  todos: Todo[];
  selectedIndex: number;
  filter: "all" | "active" | "done";
  input: string;
};

export type Action =
  | { type: "addTodo"; text: string }
  | { type: "toggleTodo"; index: number }
  | { type: "removeTodo"; index: number }
  | { type: "setFilter"; filter: State["filter"] }
  | { type: "setInput"; value: string }
  | { type: "moveSelection"; direction: "up" | "down" };
```

### Implement the Reducer

```typescript
// src/helpers/state.ts
import type { State, Action } from "../types.js";

export const initialState: State = {
  todos: [],
  selectedIndex: 0,
  filter: "all",
  input: "",
};

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "addTodo":
      if (!action.text.trim()) return state;
      return {
        ...state,
        todos: [...state.todos, { id: Date.now().toString(), text: action.text.trim(), done: false }],
        input: "",
      };

    case "toggleTodo":
      return {
        ...state,
        todos: state.todos.map((t, i) =>
          i === action.index ? { ...t, done: !t.done } : t
        ),
      };

    case "removeTodo":
      return {
        ...state,
        todos: state.todos.filter((_, i) => i !== action.index),
        selectedIndex: Math.min(state.selectedIndex, state.todos.length - 2),
      };

    case "setFilter":
      return { ...state, filter: action.filter, selectedIndex: 0 };

    case "setInput":
      return { ...state, input: action.value };

    case "moveSelection": {
      const maxIndex = state.todos.length - 1;
      const delta = action.direction === "up" ? -1 : 1;
      return {
        ...state,
        selectedIndex: Math.max(0, Math.min(state.selectedIndex + delta, maxIndex)),
      };
    }
  }
}

export function createDispatch(app: { update: (fn: (s: State) => State) => void }) {
  return function dispatch(action: Action) {
    app.update(s => reduce(s, action));
  };
}
```

Benefits of this approach:

- **Testable** -- `reduce()` is a pure function; test it with plain assertions, no UI needed
- **Predictable** -- Every state transition is an explicit action
- **Debuggable** -- Log dispatched actions to trace what happened
- **Composable** -- Multiple UI elements (buttons, keys, modes) dispatch the same actions

## Screen Architecture

Each screen is a **pure view function** that takes state and handlers and returns a VNode tree. Screens should not call `app.update()` directly; wire callbacks in `src/main.ts` or `src/screens/index.ts`.

```typescript
// src/screens/main-screen.ts
import type { VNode } from "@rezi-ui/core";
import { ui, rgb } from "@rezi-ui/core";
import type { Action, State } from "../types.js";

type ScreenHandlers = Readonly<{
  dispatch: (action: Action) => void;
}>;

export function renderMainScreen(state: State, handlers: ScreenHandlers): VNode {
  const { todos, selectedIndex, filter, input } = state;
  const filtered = todos.filter((todo) =>
    filter === "all" ? true : filter === "active" ? !todo.done : todo.done,
  );

  return ui.page({
    p: 1,
    gap: 1,
    header: ui.header({ title: "Todo List" }),
    body: ui.column({ gap: 1 }, [
      ui.text("Tasks", { style: { fg: rgb(120, 200, 255), bold: true } }),
      ui.row({ gap: 2 }, [
        ui.button({
          id: "filter-all",
          label: filter === "all" ? "[All]" : "All",
          onPress: () => handlers.dispatch({ type: "setFilter", filter: "all" }),
        }),
        ui.button({
          id: "filter-active",
          label: filter === "active" ? "[Active]" : "Active",
          onPress: () => handlers.dispatch({ type: "setFilter", filter: "active" }),
        }),
        ui.button({
          id: "filter-done",
          label: filter === "done" ? "[Done]" : "Done",
          onPress: () => handlers.dispatch({ type: "setFilter", filter: "done" }),
        }),
      ]),
      ui.box({ title: `Items (${filtered.length})`, p: 1 }, [
        filtered.length === 0
          ? ui.text("No items", { style: { dim: true } })
          : ui.column(
              { gap: 0 },
              filtered.map((todo, index) =>
                ui.text(
                  `${index === selectedIndex ? "> " : "  "}${todo.done ? "[x]" : "[ ]"} ${todo.text}`,
                  { key: todo.id, style: { dim: todo.done } },
                ),
              ),
            ),
      ]),
      ui.row({ gap: 1 }, [
        ui.input({
          id: "new-todo",
          value: input,
          onInput: (value) => handlers.dispatch({ type: "setInput", value }),
        }),
        ui.button({
          id: "add",
          label: "Add",
          onPress: () => handlers.dispatch({ type: "addTodo", text: input }),
        }),
      ]),
    ]),
  });
}
```

Wire the handler object in `src/main.ts` for single-screen apps or in `src/screens/index.ts` when you are building routes. The screen module stays pure: state + handlers in, VNode out.

## Widget Composition

Use `ui.*` for built-in widgets and `defineWidget()` for reusable custom components with local state.

### Simple Composition (No Local State)

For stateless reusable pieces, plain functions returning VNodes are sufficient:

```typescript
// src/widgets/header.ts
import { ui, rgb } from "@rezi-ui/core";

export function header(title: string, subtitle?: string) {
  return ui.column({ gap: 0 }, [
    ui.text(title, { style: { fg: rgb(120, 200, 255), bold: true } }),
    ...(subtitle ? [ui.text(subtitle, { style: { dim: true } })] : []),
    ui.divider(),
  ]);
}
```

### Stateful Widgets with `defineWidget()`

When a component needs its own local state, use `defineWidget()`:

```typescript
// src/widgets/toggleSection.ts
import { defineWidget, ui } from "@rezi-ui/core";

type ToggleSectionProps = {
  title: string;
  children: VNode[];
  key?: string;
};

export const ToggleSection = defineWidget<ToggleSectionProps>(
  (props, ctx) => {
    const [expanded, setExpanded] = ctx.useState(true);

    return ui.column({ gap: 0 }, [
      ui.button({
        id: ctx.id("toggle"),
        label: `${expanded ? "v" : ">"} ${props.title}`,
        onPress: () => setExpanded(prev => !prev),
      }),
      ...(expanded ? props.children : []),
    ]);
  },
  { name: "ToggleSection" }
);

// Usage:
ui.column([
  ToggleSection({
    title: "Details",
    children: [
      ui.text("Line 1"),
      ui.text("Line 2"),
    ],
  }),
]);
```

Key rules for `defineWidget()`:

- Use `ctx.id("suffix")` for all interactive widget IDs to prevent collisions between instances
- Hooks must be called in the same order every render (no conditional hooks)
- Use `ctx.useAppState()` to read app-level state from within a widget

## Error Handling

### Error Boundaries

Wrap risky subtrees with `ui.errorBoundary()` to prevent one broken widget from crashing your entire app:

```typescript
ui.errorBoundary({
  children: RiskyWidget({ data }),
  fallback: error =>
    ui.column({}, [
      ui.errorDisplay(error.message, { title: error.code }),
      ui.button({ id: "retry", label: "Retry", onPress: error.retry }),
    ]),
})
```

### Application-Level Error Handling

Use `app.onEvent()` to handle errors and other events at the app level:

```typescript
app.onEvent(event => {
  if (event.type === "error") {
    app.update(s => ({
      ...s,
      lastError: event.message,
      showErrorToast: true,
    }));
  }
});
```

### Defensive State Updates

Guard your reducer against invalid states:

```typescript
case "removeTodo": {
  const newTodos = state.todos.filter((_, i) => i !== action.index);
  return {
    ...state,
    todos: newTodos,
    selectedIndex: Math.max(0, Math.min(state.selectedIndex, newTodos.length - 1)),
  };
}
```

## Keybindings

### Centralize Keybindings

Keep all key mappings in a single file for discoverability and testability:

```typescript
// src/helpers/keybindings.ts
import type { App } from "@rezi-ui/core";
import type { State, Action } from "../types.js";
import { reduce } from "./state.js";

export function registerKeybindings(app: App<State>) {
  const dispatch = (action: Action) => app.update(s => reduce(s, action));

  app.keys({
    // Navigation
    j: () => dispatch({ type: "moveSelection", direction: "down" }),
    k: () => dispatch({ type: "moveSelection", direction: "up" }),

    // Actions
    space: () =>
      app.update(s => reduce(s, { type: "toggleTodo", index: s.selectedIndex })),
    d: () =>
      app.update(s => reduce(s, { type: "removeTodo", index: s.selectedIndex })),

    // Filters
    "1": () => dispatch({ type: "setFilter", filter: "all" }),
    "2": () => dispatch({ type: "setFilter", filter: "active" }),
    "3": () => dispatch({ type: "setFilter", filter: "done" }),

    // App
    q: () => app.stop(),
    "ctrl+c": () => app.stop(),
  });
}
```

### Use `app.modes()` for Vim-Style Input

When your app has distinct input modes (e.g., normal vs. insert):

```typescript
app.modes({
  normal: {
    i: () => app.setMode("insert"),
    "/": () => app.setMode("search"),
    j: () => dispatch({ type: "moveSelection", direction: "down" }),
    k: () => dispatch({ type: "moveSelection", direction: "up" }),
  },
  insert: {
    escape: () => app.setMode("normal"),
  },
  search: {
    escape: () => app.setMode("normal"),
    enter: () => dispatch({ type: "executeSearch" }),
  },
});
```

### Show Keybinding Help

Display available keybindings in the UI so users can discover them:

```typescript
ui.text("j/k: navigate | space: toggle | d: delete | q: quit", {
  style: { fg: rgb(100, 100, 100) },
})
```

## Testing

The reducer + pure screen architecture makes testing straightforward. Test each layer independently.

### Test the Reducer

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reduce, initialState } from "./helpers/state.js";

describe("reduce", () => {
  it("adds a todo", () => {
    const next = reduce(initialState, { type: "addTodo", text: "Buy milk" });
    assert.equal(next.todos.length, 1);
    assert.equal(next.todos[0].text, "Buy milk");
    assert.equal(next.todos[0].done, false);
  });

  it("ignores empty text", () => {
    const next = reduce(initialState, { type: "addTodo", text: "   " });
    assert.equal(next.todos.length, 0);
  });

  it("toggles a todo", () => {
    const withTodo = reduce(initialState, { type: "addTodo", text: "Test" });
    const toggled = reduce(withTodo, { type: "toggleTodo", index: 0 });
    assert.equal(toggled.todos[0].done, true);
  });

  it("clamps selection after removal", () => {
    let state = reduce(initialState, { type: "addTodo", text: "A" });
    state = reduce(state, { type: "addTodo", text: "B" });
    state = { ...state, selectedIndex: 1 };
    state = reduce(state, { type: "removeTodo", index: 1 });
    assert.equal(state.selectedIndex, 0);
  });
});
```

### Test Screen Functions

Screen view functions are pure -- pass in state, assert the returned VNode tree:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { State } from "./types.js";
import { renderMainScreen } from "./screens/main-screen.js";

describe("renderMainScreen", () => {
  it("shows empty message when no todos", () => {
    const state: State = {
      todos: [],
      selectedIndex: 0,
      filter: "all",
      input: "",
    };
    const tree = renderMainScreen(state, {
      dispatch: () => {},
    });

    // Assert tree structure -- inspect the VNode tree
    assert.equal(tree.kind, "page");
  });
});
```

### Test Keybindings

Verify that keybindings dispatch the expected actions:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("keybindings", () => {
  it("dispatches moveSelection on j/k", () => {
    const updates: Array<(s: State) => State> = [];
    const mockApp = {
      update: (fn: any) => updates.push(fn),
      keys: (bindings: any) => { /* store bindings for testing */ },
      stop: () => {},
    } as any;

    registerKeybindings(mockApp);
    // Verify the correct bindings were registered
  });
});
```

## Theming

### Use Built-in Themes

Pass a semantic `ThemeDefinition` to `createNodeApp()`:

```typescript
import { createNodeApp } from "@rezi-ui/node";
import { createThemeDefinition, rgb } from "@rezi-ui/core";

const appTheme = createThemeDefinition(
  "app",
  {
    bg: {
      base: rgb(20, 20, 30),
      elevated: rgb(28, 28, 40),
      overlay: rgb(36, 36, 52),
      subtle: rgb(24, 24, 36),
    },
    fg: {
      primary: rgb(220, 220, 220),
      secondary: rgb(170, 170, 190),
      muted: rgb(120, 120, 140),
      inverse: rgb(20, 20, 30),
    },
    accent: {
      primary: rgb(100, 180, 255),
      secondary: rgb(180, 100, 255),
      tertiary: rgb(120, 220, 180),
    },
    success: rgb(100, 220, 100),
    warning: rgb(255, 200, 50),
    error: rgb(255, 100, 100),
    info: rgb(100, 200, 255),
    focus: { ring: rgb(100, 180, 255), bg: rgb(32, 36, 48) },
    selected: { bg: rgb(40, 52, 72), fg: rgb(220, 220, 220) },
    disabled: { fg: rgb(120, 120, 140), bg: rgb(28, 28, 40) },
    diagnostic: {
      error: rgb(255, 100, 100),
      warning: rgb(255, 200, 50),
      info: rgb(100, 200, 255),
      hint: rgb(120, 220, 180),
    },
    border: {
      subtle: rgb(36, 36, 52),
      default: rgb(80, 80, 96),
      strong: rgb(120, 120, 140),
    },
  },
);

const app = createNodeApp<State>({
  initialState,
  theme: appTheme,
});
```

### Theme Switching

Store the active theme name in state and switch among stable prebuilt theme
objects:

```typescript
// src/theme.ts
import { createThemeDefinition } from "@rezi-ui/core";

export const themes = {
  dark: createThemeDefinition("dark", { /* colors */ }),
  light: createThemeDefinition("light", { /* colors */ }),
  solarized: createThemeDefinition("solarized", { /* colors */ }),
} as const;

export type ThemeName = keyof typeof themes;
```

### Theme-aware composite widgets with `ctx.useTheme()`

Use `ctx.useTheme()` with `recipe.*` when building custom widgets via `defineWidget(...)`:

```typescript
import { defineWidget, recipe, ui } from "@rezi-ui/core";

const MetricTile = defineWidget<{ label: string; value: string; key?: string }>((props, ctx) => {
  const tokens = ctx.useTheme();
  const surface = recipe.surface(tokens, { elevation: 1 });

  return ui.box({ border: surface.border, style: surface.bg, p: 1 }, [
    ui.text(props.label, { variant: "caption" }),
    ui.text(props.value, { variant: "heading" }),
  ]);
});
```

### Scoped theme sections with `ui.themed(...)`

Use `ui.themed(...)` for local palette changes (for example, a lighter sidebar in a dark app):

```typescript
const appTheme = darkTheme;

ui.row({ gap: 1 }, [
  ui.themed(
    {
      colors: {
        bg: {
          base: appTheme.colors.bg.elevated,
          elevated: appTheme.colors.bg.subtle,
        },
        fg: { primary: appTheme.colors.fg.primary },
      },
    },
    [ui.box({ p: 1 }, [ui.text("Light Sidebar")])],
  ),
  ui.box({ flex: 1, p: 1 }, [ui.text("Main content keeps the app theme")]),
]);
```

### Spacing scale in recipes

When calling recipes directly, pass the spacing scale from the same
`ThemeDefinition` you install on the app so component padding stays aligned:

```typescript
const tokens = ctx.useTheme();
const button = recipe.button(tokens, {
  size: "lg",
  spacing: appTheme.spacing,
});
```

### NO_COLOR Support

`createNodeApp()` automatically detects the `NO_COLOR` environment variable and strips colors from the theme. You do not need to handle this manually.

## Performance

### Use `useMemo` for Expensive Computations

Inside `defineWidget()`, wrap expensive filtering or sorting with `ctx.useMemo()`:

```typescript
const filtered = ctx.useMemo(
  () => items.filter(item => matchesQuery(item, query)).sort(compareFn),
  [items, query]
);
```

### Provide `key` for Dynamic Lists

Always use `key` when rendering lists derived from data. This allows Rezi's reconciler to match items efficiently and preserve widget state:

```typescript
// Good: keyed list
ui.column(
  items.map(item => ui.text(item.name, { key: item.id }))
)

// Bad: unkeyed list (reconciler falls back to index matching)
ui.column(
  items.map(item => ui.text(item.name))
)
```

### Use `ui.virtualList()` for Large Data Sets

For lists with hundreds or thousands of items, use `ui.virtualList()` to only render the visible portion:

```typescript
ui.virtualList<LogEntry>({
  id: "log-view",
  items: logEntries,           // Can be thousands of items
  itemHeight: 1,               // Each item is 1 row tall
  height: 20,                  // Visible viewport is 20 rows
  renderItem: (entry, index) =>
    ui.text(`[${entry.timestamp}] ${entry.message}`, {
      key: entry.id,
      style: { fg: levelColor(entry.level) },
    }),
})
```

When row height depends on rendered content, switch to estimate mode:

```typescript
ui.virtualList<LogEntry>({
  id: "log-view",
  items: logEntries,
  estimateItemHeight: (entry) => (entry.expanded ? 4 : 1),
  renderItem: (entry) =>
    entry.expanded
      ? ui.column({}, [ui.text(entry.message), ui.text(entry.details)])
      : ui.text(entry.message),
})
```

### Minimize State Size

Keep your state flat and minimal. Deeply nested state leads to more spread operations and harder-to-maintain reducers. Extract computed values in the view function rather than storing them in state.

### Batch Related Updates

Multiple `app.update()` calls in the same tick are batched into a single re-render. You do not need to combine them manually:

```typescript
// These produce a single re-render
dispatch({ type: "setFilter", filter: "active" });
dispatch({ type: "moveSelection", direction: "up" });
```

## Styling Pane Chrome

When building multi-pane layouts (IDEs, dashboards, panels), a common pattern is wrapping content in bordered boxes with active/inactive visual states. Use `borderStyle` to decouple border appearance from child content:

```typescript
function withPaneChrome(
  id: string,
  title: string,
  isActive: boolean,
  child: VNode,
) {
  return ui.box(
    {
      id: `${id}-box`,
      title: ` ${title} `,
      titleAlign: "left",
      border: isActive ? "heavy" : "rounded",
      // borderStyle applies ONLY to the border and title
      borderStyle: isActive
        ? { fg: accentColor, bold: true }
        : { fg: mutedColor },
      p: 0,
    },
    [child],
  );
}
```

**Why `borderStyle` instead of `style`?** The `style` prop on `ui.box()` propagates to all descendants as `parentStyle`. If you set `fg` or `bold` on `style`, it will override syntax highlighting in code editors, status colors in file trees, and any other child widget that relies on its own styling. `borderStyle` keeps border chrome visuals isolated.

For widgets embedded in pane chrome that already indicates focus visually, suppress the widget's own focus highlight with `focusConfig`:

```typescript
// The pane border already shows active state -- no need for editor focus overlay
ui.codeEditor({
  id: "editor",
  language: "typescript",
  value: code,
  focusConfig: { indicator: "none" },
});
```

See [Box](../widgets/box.md#style-propagation) and [Focus Styles](../styling/focus-styles.md#per-widget-focus-control-with-focusconfig) for details.

## Summary

| Pattern | Why |
|---------|-----|
| Template project structure | Separation of concerns, testability |
| Reducer with typed actions | Pure, testable, debuggable state logic |
| Pure screen view functions | Predictable rendering, easy to test |
| `ui.*` + `defineWidget()` | Type-safe composition with local state |
| `ui.errorBoundary()` | Graceful failure isolation |
| Centralized keybindings | Discoverable, testable, no duplication |
| Separate reducer/screen/keybinding tests | Fast, focused, no UI harness needed |
| Theme definitions | Consistent styling, NO_COLOR support |
| `useMemo`, keys, `virtualList` | Efficient rendering at scale |
| `borderStyle` for pane chrome | Prevents style leaking into child widgets |
| `focusConfig` for embedded widgets | Avoids redundant focus visuals in custom chrome |

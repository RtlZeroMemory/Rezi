# Quickstart

Build your first Rezi terminal application in minutes.

## Create a New Project

### Option 1: Scaffold with create-rezi (Recommended)

```bash
npm create rezi my-tui-app
cd my-tui-app
npm start
```

With Bun:

```bash
bun create rezi my-tui-app
cd my-tui-app
bun start
```

Select a template when prompted (`dashboard`, `stress-test`, `cli-tool`, `animation-lab`, `minimal`, or `starship`), or pass `--template` to choose directly:

```bash
npm create rezi my-tui-app -- --template dashboard
npm create rezi my-tui-app -- --template animation-lab
npm create rezi my-tui-app -- --template minimal
npm create rezi my-tui-app -- --template starship
```

The templates demonstrate the recommended project structure and patterns. Start with `minimal` to learn the basics, `dashboard` for operations workflows, `animation-lab` for declarative motion patterns, or `starship` for an end-to-end command console showcase.

### Option 2: Manual setup

```bash
mkdir my-tui-app && cd my-tui-app
npm init -y
npm install @rezi-ui/core @rezi-ui/node typescript tsx
```

With Bun:

```bash
mkdir my-tui-app && cd my-tui-app
bun init -y
bun add @rezi-ui/core @rezi-ui/node
bun add -d typescript tsx
```

## Minimal Example

The simplest working Rezi app in 10 lines. Create `index.ts`:

```typescript
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = { count: number };
const app = createNodeApp<State>({ initialState: { count: 0 } });

app.view(state =>
  ui.page({
    p: 1,
    gap: 1,
    header: ui.header({ title: "Counter" }),
    body: ui.panel("Count", [
      ui.row({ gap: 1, items: "center" }, [
        ui.text(String(state.count), { variant: "heading" }),
        ui.spacer({ flex: 1 }),
        ui.button({
          id: "inc",
          label: "+1",
          intent: "primary",
          onPress: () => app.update(s => ({ count: s.count + 1 })),
        }),
      ]),
    ]),
  })
);

app.keys({ q: () => app.stop() });
await app.run();
```

Run with:

```bash
npx tsx index.ts
```

Or with Bun:

```bash
bun run index.ts
```

You should see a counter UI. Use Tab to navigate to the button, Enter to activate it, and `q` to quit. Mouse clicks also work if your terminal supports mouse tracking.

## Understanding the Code

### Creating the Application

```typescript
const app = createNodeApp<State>({ initialState: { count: 0 } });
```

- `createNodeApp<State>` creates a typed application instance with a compatible Node/Bun backend
- `initialState` provides the starting application state
- An optional `config` object controls runtime knobs (`fpsCap`, `maxEventBytes`, `maxDrawlistBytes`)

### Defining the View

```typescript
app.view(state =>
  ui.page({
    p: 1,
    gap: 1,
    header: ui.header({ title: "My App" }),
    body: ui.panel("Main", [
      // Widgets go here
    ]),
  })
);
```

- `app.view()` registers a function that returns the UI tree
- The function receives the current state and returns a `VNode`
- The view re-renders automatically whenever state changes
- View functions should be **pure** -- same state in, same UI out

### Using the `ui.*` API

Always use the `ui.*` widget factories to build your UI. They create properly typed VNodes without manual object construction:

```typescript
ui.page({
  p: 1,
  gap: 1,
  header: ui.header({ title: "Title" }),
  body: ui.panel("Actions", [
    ui.actions([ui.button({ id: "btn", label: "Click", intent: "primary" })]),
  ]),
})
```

- `ui.page()` provides a full-screen scaffold (optional header/body/footer)
- `ui.panel()` groups related content with a titled container
- `p: 1` adds 1 cell of padding
- `gap: 1` adds 1 cell between children

See the [Widget Catalog](../widgets/index.md) for the full list of available widgets.

### State Updates

```typescript
app.update(s => ({ count: s.count + 1 }));
```

- `app.update()` takes a function that receives the previous state and returns the new state
- Updates are batched and coalesced -- multiple `update()` calls in the same tick produce a single re-render
- Prefer the functional update form to avoid stale closures

### Keybindings

```typescript
app.keys({
  q: () => app.stop(),
});
```

- `app.keys()` registers global keybindings
- Keys can include modifiers: `ctrl+s`, `alt+x`, `shift+tab`
- Chord sequences are supported: `"g g"` (press g twice)
- `app.run()` automatically handles `Ctrl+C`/`SIGTERM`/`SIGHUP` for graceful shutdown

## Recommended App Structure

For anything beyond a quick prototype, follow the template project structure:

```
my-tui-app/
  src/
    types.ts          # State type, action types
    theme.ts          # Theme configuration
    helpers/
      keybindings.ts  # Centralized key mappings
      actions.ts      # Reducer / action handlers
    screens/
      main.ts         # Screen view functions
    index.ts          # App entry point
```

This separation keeps your app testable and maintainable. See [Recommended Patterns](../guide/recommended-patterns.md) for details.

## A More Complete Example

Here is a counter app using the **reducer pattern** for state management -- the recommended approach for non-trivial apps:

```typescript
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

// --- Types ---
type State = { count: number };
type Action = { type: "increment" } | { type: "decrement" } | { type: "reset" };

// --- Reducer ---
function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "increment": return { count: state.count + 1 };
    case "decrement": return { count: state.count - 1 };
    case "reset":     return { count: 0 };
  }
}

function dispatch(action: Action) {
  app.update(s => reduce(s, action));
}

// --- App ---
const app = createNodeApp<State>({ initialState: { count: 0 } });

app.view(state =>
  ui.page({
    p: 1,
    gap: 1,
    header: ui.header({ title: "Rezi Counter" }),
    body: ui.panel("Controls", [
      ui.row({ gap: 2 }, [
        ui.text(`Count: ${state.count}`, { variant: "heading" }),
        ui.spacer({ flex: 1 }),
        ui.button({ id: "inc", label: "+1", intent: "primary", onPress: () => dispatch({ type: "increment" }) }),
        ui.button({ id: "dec", label: "-1", onPress: () => dispatch({ type: "decrement" }) }),
        ui.button({ id: "reset", label: "Reset", intent: "link", onPress: () => dispatch({ type: "reset" }) }),
      ]),
    ]),
    footer: ui.statusBar({
      left: [ui.text("Ready")],
      right: [ui.text("j: inc · k: dec · r: reset · q: quit")],
    }),
  })
);

app.keys({
  j: () => dispatch({ type: "increment" }),
  k: () => dispatch({ type: "decrement" }),
  r: () => dispatch({ type: "reset" }),
  q: () => app.stop(),
});

await app.run();
```

Key takeaways:

- **Typed actions** make state transitions explicit and testable
- **`reduce()` is a pure function** -- easy to unit test without any UI
- **`dispatch()`** provides a clean interface between UI events and state logic
- **Keybindings** and **button presses** use the same `dispatch()` call

## Next Steps

- [Concepts](../guide/concepts.md) - Understand Rezi's architecture and core ideas
- [Recommended Patterns](../guide/recommended-patterns.md) - Best practices for production apps
- [Using JSX](jsx.md) - Prefer JSX syntax? Use `@rezi-ui/jsx` for a JSX-based widget API
- [Widget Catalog](../widgets/index.md) - Browse all available widgets
- [Layout Guide](../guide/layout.md) - Learn about spacing and alignment
- [Animation Guide](../guide/animation.md) - Declarative motion with hooks and box transitions
- [Styling Guide](../guide/styling.md) - Customize colors and themes
- [Examples](examples.md) - More example applications

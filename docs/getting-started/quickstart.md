# Quickstart

Build your first Rezi terminal application in minutes.

## Create a New Project

### Option 1: Scaffold with create-rezi

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

Select the dashboard template when prompted, or pass `--template` to choose directly:

```bash
npm create rezi my-tui-app -- --template dashboard
```

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

Create `index.ts`:

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = { count: number };

const app = createNodeApp<State>({
  initialState: { count: 0 },
  config: { fpsCap: 60, maxEventBytes: 1 << 20, useV2Cursor: false },
});

app.view((state) =>
  ui.column({ p: 1, gap: 1 }, [
    ui.text("Rezi Counter", { style: { fg: rgb(120, 200, 255), bold: true } }),
    ui.box({ title: "Controls", p: 1 }, [
      ui.row({ gap: 2 }, [
        ui.text(`Count: ${state.count}`),
        ui.button({
          id: "inc",
          label: "+1",
          onPress: () => app.update((s) => ({ count: s.count + 1 })),
        }),
        ui.button({
          id: "dec",
          label: "-1",
          onPress: () => app.update((s) => ({ count: s.count - 1 })),
        }),
      ]),
    ]),
  ])
);

// Press 'q' to quit
app.keys({
  "q": () => app.stop(),
  "ctrl+c": () => app.stop(),
});

await app.start();
```

Run with:

```bash
npx tsx index.ts
```

Or with Bun:

```bash
bun run index.ts
```

You should see a counter UI. Use Tab to navigate between buttons, Enter to activate them, and 'q' to quit. You can also click the buttons with the mouse if your terminal supports mouse tracking.

## Understanding the Code

### Creating the Application

```typescript
const app = createNodeApp<State>({
  initialState: { count: 0 },
  config: { fpsCap: 60, maxEventBytes: 1 << 20, useV2Cursor: false },
});
```

- `createNodeApp<State>` creates a typed application instance and compatible Node backend
- `config` controls app/backend runtime knobs in one place (`fpsCap`, `maxEventBytes`, `useV2Cursor`)
- `initialState` provides the initial application state

### Defining the View

```typescript
app.view((state) =>
  ui.column({ p: 1, gap: 1 }, [
    // Widgets go here
  ])
);
```

- `app.view()` registers a function that returns the UI tree
- The function receives the current state and returns a `VNode`
- The view is re-rendered whenever state changes

### Widgets and Layout

```typescript
ui.column({ p: 1, gap: 1 }, [
  ui.text("Title"),
  ui.row({ gap: 2 }, [
    ui.button({ id: "btn", label: "Click" }),
  ]),
])
```

- `ui.column()` arranges children vertically
- `ui.row()` arranges children horizontally
- `p: 1` adds 1 cell of padding
- `gap: 1` adds 1 cell between children

### State Updates

```typescript
app.update((s) => ({ count: s.count + 1 }));
```

- `app.update()` updates the state and triggers a re-render
- Pass a function that receives the previous state and returns the new state
- Updates are batched and coalesced for efficiency

### Keybindings

```typescript
app.keys({
  "q": () => app.stop(),
  "ctrl+c": () => app.stop(),
});
```

- `app.keys()` registers global keybindings
- Keys can include modifiers: `ctrl`, `alt`, `shift`, `meta`
- Chord sequences are supported: `"g g"` (press g twice)

## A More Complete Example

Here's a todo list application demonstrating more features:

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type Todo = { id: string; text: string; done: boolean };
type State = {
  todos: Todo[];
  selected: number;
  input: string;
};

const app = createNodeApp<State>({
    initialState: {
    todos: [
      { id: "1", text: "Learn Rezi", done: false },
      { id: "2", text: "Build an app", done: false },
    ],
    selected: 0,
    input: "",
  },
});

app.view((state) => {
  const { todos, selected, input } = state;

  return ui.column({ p: 1, gap: 1 }, [
    // Title
    ui.text("Todo List", { style: { fg: rgb(100, 200, 255), bold: true } }),

    // Todo items
    ui.box({ title: `Items (${todos.length})`, p: 1 }, [
      todos.length === 0
        ? ui.text("No todos yet", { style: { fg: rgb(128, 128, 128) } })
        : ui.column(
            { gap: 0 },
            todos.map((todo, i) => {
              const isSel = i === selected;
              const prefix = isSel ? "> " : "  ";
              const check = todo.done ? "[x]" : "[ ]";
              return ui.text(`${prefix}${check} ${todo.text}`, {
                key: todo.id,
                style: {
                  bold: isSel,
                  dim: todo.done,
                  fg: todo.done ? rgb(128, 128, 128) : undefined,
                },
              });
            })
          ),
    ]),

    // Add new todo
    ui.row({ gap: 1 }, [
      ui.input({
        id: "new-todo",
        value: input,
        onInput: (v) => app.update((s) => ({ ...s, input: v })),
      }),
      ui.button({
        id: "add",
        label: "Add",
        onPress: () => {
          if (input.trim()) {
            app.update((s) => ({
              ...s,
              todos: [...s.todos, { id: Date.now().toString(), text: input.trim(), done: false }],
              input: "",
            }));
          }
        },
      }),
    ]),

    // Help text
    ui.text("j/k: navigate | space: toggle | d: delete | q: quit", {
      style: { fg: rgb(100, 100, 100) },
    }),
  ]);
});

app.keys({
  j: (ctx) =>
    ctx.update((s) => ({
      ...s,
      selected: Math.min(s.selected + 1, s.todos.length - 1),
    })),
  k: (ctx) =>
    ctx.update((s) => ({
      ...s,
      selected: Math.max(s.selected - 1, 0),
    })),
  space: (ctx) =>
    ctx.update((s) => ({
      ...s,
      todos: s.todos.map((t, i) =>
        i === s.selected ? { ...t, done: !t.done } : t
      ),
    })),
  d: (ctx) =>
    ctx.update((s) => ({
      ...s,
      todos: s.todos.filter((_, i) => i !== s.selected),
      selected: Math.max(0, Math.min(s.selected, s.todos.length - 2)),
    })),
  q: () => app.stop(),
});

await app.start();
```

## Next Steps

- [Using JSX](jsx.md) - Prefer JSX syntax? Use `@rezi-ui/jsx` for a JSX-based widget API
- [Concepts](../guide/concepts.md) - Understand Rezi's architecture
- [Widget Catalog](../widgets/index.md) - Browse all available widgets
- [Layout Guide](../guide/layout.md) - Learn about spacing and alignment
- [Styling Guide](../guide/styling.md) - Customize colors and themes
- [Examples](examples.md) - More example applications

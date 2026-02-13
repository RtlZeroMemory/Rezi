# Examples

Rezi includes example applications that demonstrate various features and patterns.

## Running Examples

### From npm (Recommended)

Create a new directory and copy example code:

```bash
mkdir my-rezi-app && cd my-rezi-app
npm init -y
npm install @rezi-ui/core @rezi-ui/node typescript tsx
```

Then create your TypeScript file and run with `npx tsx <file>.ts`.

### From Source

Clone the repository and build:

```bash
git clone https://github.com/RtlZeroMemory/Rezi.git
cd Rezi
git submodule update --init --recursive
npm ci
npm run build
npm run build:native
```

Run examples:

```bash
node examples/hello-counter/dist/index.js
node examples/raw-draw-demo/dist/index.js
```

## Example: Counter

A minimal counter application demonstrating state updates and button interactions.

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = { count: number };

const app = createNodeApp<State>({
    initialState: { count: 0 },
});

app.view((state) =>
  ui.column({ p: 1, gap: 1 }, [
    ui.text("Counter Example", { style: { fg: rgb(120, 200, 255), bold: true } }),
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
        ui.button({
          id: "reset",
          label: "Reset",
          onPress: () => app.update({ count: 0 }),
        }),
      ]),
    ]),
  ])
);

app.keys({
  "q": () => app.stop(),
  "ctrl+c": () => app.stop(),
});

await app.start();
```

## Example: Todo List

A todo list with keyboard navigation, adding, and completing items.

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
      { id: "1", text: "Learn Rezi basics", done: false },
      { id: "2", text: "Build a real app", done: false },
    ],
    selected: 0,
    input: "",
  },
});

app.view((state) => {
  const { todos, selected, input } = state;

  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Todo List", { style: { fg: rgb(100, 200, 255), bold: true } }),

    ui.box({ title: `Tasks (${todos.filter(t => !t.done).length} pending)`, p: 1 }, [
      todos.length === 0
        ? ui.text("No tasks. Add one below.", { style: { dim: true } })
        : ui.column({ gap: 0 },
            todos.map((todo, i) => {
              const isSel = i === selected;
              const indicator = isSel ? ">" : " ";
              const checkbox = todo.done ? "[x]" : "[ ]";
              return ui.text(`${indicator} ${checkbox} ${todo.text}`, {
                key: todo.id,
                style: {
                  bold: isSel,
                  dim: todo.done,
                },
              });
            })
          ),
    ]),

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

    ui.text("j/k: move | space: toggle | d: delete | q: quit", {
      style: { fg: rgb(100, 100, 100) },
    }),
  ]);
});

app.keys({
  j: (ctx) => ctx.update((s) => ({
    ...s,
    selected: Math.min(s.selected + 1, s.todos.length - 1),
  })),
  k: (ctx) => ctx.update((s) => ({
    ...s,
    selected: Math.max(s.selected - 1, 0),
  })),
  space: (ctx) => ctx.update((s) => ({
    ...s,
    todos: s.todos.map((t, i) => i === s.selected ? { ...t, done: !t.done } : t),
  })),
  d: (ctx) => ctx.update((s) => ({
    ...s,
    todos: s.todos.filter((_, i) => i !== s.selected),
    selected: Math.max(0, Math.min(s.selected, s.todos.length - 2)),
  })),
  q: () => app.stop(),
});

await app.start();
```

## Example: Form with Validation

A login form demonstrating form fields, validation, and submission.

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = {
  email: string;
  password: string;
  errors: { email?: string; password?: string };
  submitted: boolean;
};

const app = createNodeApp<State>({
    initialState: {
    email: "",
    password: "",
    errors: {},
    submitted: false,
  },
});

function validate(state: State): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  if (!state.email) {
    errors.email = "Email is required";
  } else if (!state.email.includes("@")) {
    errors.email = "Invalid email format";
  }
  if (!state.password) {
    errors.password = "Password is required";
  } else if (state.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }
  return errors;
}

app.view((state) => {
  if (state.submitted) {
    return ui.column({ p: 2 }, [
      ui.text("Login Successful!", { style: { fg: rgb(100, 255, 100), bold: true } }),
      ui.button({
        id: "back",
        label: "Back to Form",
        onPress: () => app.update({ ...state, submitted: false }),
      }),
    ]);
  }

  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Login Form", { style: { fg: rgb(100, 200, 255), bold: true } }),

    ui.box({ p: 1 }, [
      ui.column({ gap: 1 }, [
        ui.field({
          label: "Email",
          required: true,
          error: state.errors.email,
          children: ui.input({
            id: "email",
            value: state.email,
            onInput: (v) => app.update((s) => ({ ...s, email: v })),
          }),
        }),

        ui.field({
          label: "Password",
          required: true,
          error: state.errors.password,
          children: ui.input({
            id: "password",
            value: state.password,
            onInput: (v) => app.update((s) => ({ ...s, password: v })),
          }),
        }),

        ui.row({ gap: 2 }, [
          ui.button({
            id: "submit",
            label: "Login",
            onPress: () => {
              const errors = validate(state);
              if (Object.keys(errors).length === 0) {
                app.update({ ...state, submitted: true, errors: {} });
              } else {
                app.update({ ...state, errors });
              }
            },
          }),
          ui.button({
            id: "clear",
            label: "Clear",
            onPress: () => app.update({ email: "", password: "", errors: {}, submitted: false }),
          }),
        ]),
      ]),
    ]),
  ]);
});

app.keys({
  "ctrl+c": () => app.stop(),
  "q": () => app.stop(),
});

await app.start();
```

## Example: Raw Drawing

For advanced use cases, Rezi provides an escape hatch for direct drawing.

```typescript
import { rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
    initialState: { tick: 0 },
});

// Use draw() instead of view() for raw rendering
app.draw((g) => {
  // Clear the screen
  g.clear();
  g.fillRect(0, 0, 40, 12, { bg: rgb(0, 0, 30) });

  // Draw a box
  g.fillRect(5, 2, 30, 5, { bg: rgb(40, 40, 60) });

  // Draw text
  g.drawText(7, 4, "Raw Drawing Demo", { fg: rgb(255, 200, 100), bold: true });

  // Draw more shapes
  g.fillRect(5, 8, 15, 3, { bg: rgb(100, 50, 50) });
  g.drawText(6, 9, "Red Box", { fg: rgb(255, 255, 255) });

  g.fillRect(22, 8, 15, 3, { bg: rgb(50, 100, 50) });
  g.drawText(23, 9, "Green Box", { fg: rgb(255, 255, 255) });
});

app.keys({
  q: () => app.stop(),
});

await app.start();
```

## More Examples

See the [examples/](https://github.com/RtlZeroMemory/Rezi/tree/main/examples) directory in the repository for additional examples.

## Next Steps

- [Widget Catalog](../widgets/index.md) - Browse all available widgets
- [Styling Guide](../guide/styling.md) - Customize colors and themes
- [Keybindings](../guide/input-and-focus.md) - Advanced keyboard handling

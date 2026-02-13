# Keyboard Shortcuts

Implementing global and contextual keyboard shortcuts.

## Problem

You want to add keyboard shortcuts for common actions like save, undo, or navigation.

## Solution

Use `app.keys()` for global shortcuts and `app.modes()` for modal (contextual) keymaps.

## Complete Example

```typescript
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = {
  content: string;
  saved: boolean;
  mode: "insert" | "normal";
};

const app = createNodeApp<State>({
    initialState: { content: "", saved: true, mode: "insert" },
});

app.view((state) =>
  ui.column({ flex: 1, gap: 1, p: 1 }, [
    ui.row({ gap: 1, justify: "between" }, [
      ui.text(state.saved ? "Saved" : "Modified"),
      ui.text(`Mode: ${state.mode}`, { style: { dim: true } }),
    ]),

    ui.input({
      id: "editor",
      value: state.content,
      onInput: (value) => app.update((s) => ({ ...s, content: value, saved: false })),
    }),

    ui.row({ gap: 2 }, [
      ui.row({ gap: 1 }, [ui.kbd(["Ctrl", "S"]), ui.text("Save")]),
      ui.row({ gap: 1 }, [ui.kbd("Esc"), ui.text("Normal mode")]),
      ui.row({ gap: 1 }, [ui.kbd("i"), ui.text("Insert mode")]),
      ui.row({ gap: 1 }, [ui.kbd("q"), ui.text("Quit")]),
    ]),
  ])
);

// Global shortcuts
app.keys({
  "ctrl+s": (ctx) => ctx.update((s) => ({ ...s, saved: true })),
  "ctrl+q": () => app.stop(),
  q: (ctx) => {
    if (ctx.state.mode === "normal") app.stop();
  },
});

// Modal (contextual) keymaps
app.modes({
  insert: {
    escape: (ctx) => ctx.update((s) => ({ ...s, mode: "normal" })),
  },
  normal: {
    i: (ctx) => ctx.update((s) => ({ ...s, mode: "insert" })),
  },
});

app.setMode("insert");

await app.start();
```

## Explanation

- `app.keys()` registers global bindings (available in all modes).
- `app.modes()` registers per-mode bindings (Vim-style “normal/insert”).
- Use `ui.kbd(...)` to display shortcuts directly in your UI.

## Related

- [Kbd](../widgets/kbd.md) - Displaying keyboard shortcuts

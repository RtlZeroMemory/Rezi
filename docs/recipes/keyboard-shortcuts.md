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
  helpOpen: boolean;
};

const app = createNodeApp<State>({
    initialState: { content: "", saved: true, mode: "insert", helpOpen: false },
});

app.view((state) =>
  ui.column({ flex: 1, gap: 1, p: 1 }, [
    ui.row({ gap: 1, justify: "between" }, [
      ui.text(state.saved ? "Saved" : "Modified"),
      ui.text(`Mode: ${state.mode}`, { style: { dim: true } }),
      ui.text(app.pendingChord ? `Waiting: ${app.pendingChord}` : "Ready", { style: { dim: true } }),
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
      ui.row({ gap: 1 }, [ui.kbd("?"), ui.text("Help")]),
      ui.row({ gap: 1 }, [ui.kbd("q"), ui.text("Quit")]),
    ]),
    state.helpOpen
      ? ui.modal({
          id: "help",
          title: "Shortcuts",
          content: ui.keybindingHelp(app.getBindings()),
          actions: [ui.button({ id: "help-close", label: "Close", onPress: () => app.update((s) => ({ ...s, helpOpen: false })) })],
          onClose: () => app.update((s) => ({ ...s, helpOpen: false })),
        })
      : null,
  ])
);

// Global shortcuts
app.keys({
  "ctrl+s": {
    handler: (ctx) => ctx.update((s) => ({ ...s, saved: true })),
    description: "Save",
  },
  "?": {
    handler: (ctx) => ctx.update((s) => ({ ...s, helpOpen: true })),
    description: "Show shortcuts",
  },
  "ctrl+q": {
    handler: () => app.stop(),
    description: "Force quit",
  },
  q: {
    handler: (ctx) => {
      if (ctx.state.mode === "normal") app.stop();
    },
    description: "Quit (normal mode)",
  },
});

// Modal (contextual) keymaps
app.modes({
  insert: {
    escape: {
      handler: (ctx) => ctx.update((s) => ({ ...s, mode: "normal" })),
      description: "Enter normal mode",
    },
  },
  normal: {
    i: {
      handler: (ctx) => ctx.update((s) => ({ ...s, mode: "insert" })),
      description: "Enter insert mode",
    },
  },
});

app.setMode("insert");

await app.start();
```

## Explanation

- `app.keys()` registers global bindings (available in all modes).
- `app.modes()` registers per-mode bindings (Vim-style “normal/insert”).
- `description` metadata enables auto-generated help views via `app.getBindings()`.
- `app.pendingChord` exposes in-progress chord prefixes for status feedback.
- Use `ui.kbd(...)` to display shortcuts directly in your UI.

## Related

- [Kbd](../widgets/kbd.md) - Displaying keyboard shortcuts

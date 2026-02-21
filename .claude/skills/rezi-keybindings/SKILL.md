---
name: rezi-keybindings
description: Set up keyboard shortcuts and chord bindings for a Rezi app. Use when adding hotkeys, key combos, or modal input modes.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[key-combo or mode-name]"
metadata:
  short-description: Set up keybindings
---

## When to use

Use this skill when:

- Adding keyboard shortcuts to a Rezi app
- Setting up chord bindings (multi-key sequences like `g g`)
- Creating modal input modes (e.g., vim-style normal/insert)
- Adding a keybinding help widget

## Source of truth

- `packages/core/src/input/` — keybinding system implementation
- `packages/core/src/widgets/ui.ts` — `ui.keybindingHelp()` widget

## Steps

1. **Define key bindings** using `app.keys()`:
   ```typescript
   app.keys({
     "q": () => shutdown(),
     "Ctrl+s": () => save(),
     "g g": () => scrollToTop(),  // chord binding
   });
   ```

2. **For modal modes**, pass a mode name as first argument:
   ```typescript
   app.keys("edit-mode", {
     "Escape": () => exitEditMode(),
     "Ctrl+s": () => saveAndExit(),
   });
   ```

3. **Add discoverability** with `ui.keybindingHelp()`:
   ```typescript
   ui.keybindingHelp({
     bindings: [
       { key: "q", label: "Quit" },
       { key: "Ctrl+s", label: "Save" },
     ],
   })
   ```

## Key format reference

| Format | Example |
|--------|---------|
| Single key | `"q"`, `"Enter"`, `"Escape"` |
| Modifier | `"Ctrl+s"`, `"Alt+x"`, `"Shift+Tab"` |
| Chord | `"g g"`, `"g t"` (space-separated) |

## Verification

- Keys trigger correct actions
- No conflicts in the same mode
- Chords complete correctly after all keys pressed

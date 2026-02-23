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

- `packages/core/src/keybindings/` — keybinding system implementation
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

2. **For modal modes**, register mode maps with `app.modes()`:
   ```typescript
   app.modes({
     "edit-mode": {
       "Escape": () => exitEditMode(),
       "Ctrl+s": () => saveAndExit(),
     },
   });
   ```

3. **Add discoverability** with `ui.keybindingHelp()`:
   ```typescript
   ui.keybindingHelp(app.getBindings())
   ```

## Overlay shortcut hints

Dropdown and CommandPalette `shortcut` fields are currently display/search hints.

- `routeDropdownKey(...)` handles navigation keys (`Up`, `Down`, `Enter`, `Space`, `Escape`).
- CommandPalette shows shortcut text and uses it in filtering, but does not auto-bind combos.
- Register real shortcut combos explicitly with `app.keys()` or `app.modes()`.

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

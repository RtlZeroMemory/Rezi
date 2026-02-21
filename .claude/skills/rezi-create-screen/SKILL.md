---
name: rezi-create-screen
description: Create a new screen/page for a Rezi TUI application. Use when adding views, pages, or screens to an app.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[screen-name]"
metadata:
  short-description: Create app screen
---

## When to use

Use this skill when:

- Adding a new screen or page to a Rezi application
- Setting up a view function for an app route
- Scaffolding a new section of a TUI

## Source of truth

- `packages/core/src/widgets/ui.ts` — all `ui.*` factory functions
- `packages/core/src/router/` — router and route definitions
- `packages/core/src/keybindings/` — keybinding system

## Steps

1. **Create screen file** at `src/screens/{screen-name}.ts`:
   ```typescript
   import { ui } from "@rezi-ui/core";
   import type { AppState } from "../state.js";

   export function MyScreen(state: AppState) {
     return ui.column({ gap: 1 }, [
       ui.text("Screen Title", { bold: true }),
       // screen content
     ]);
   }
   ```

2. **Use `ui.column()` or `ui.row()`** as the root container

3. **If using router**, add a route definition (see `rezi-routing` skill)

4. **Add keybindings** for screen-specific actions in the app's key handler

5. **Wire into main** via router or view switch:
   ```typescript
   view: (state) => {
     if (state.screen === "my-screen") return MyScreen(state);
     return HomeScreen(state);
   }
   ```

## Verification

- Screen renders without errors
- Navigation keybindings work
- State types include any new fields

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
- `packages/core/src/widgets/composition.ts` — `defineWidget()` and animation hooks
- `packages/core/src/router/` — router and route definitions
- `packages/core/src/keybindings/` — keybinding system
- `packages/create-rezi/templates/animation-lab/` — canonical animation screen pattern
- `docs/guide/widget-authoring.md` — design system integration patterns

## Steps

1. **Create screen file** at `src/screens/{screen-name}.ts`:
   ```typescript
   import { ui } from "@rezi-ui/core";
   import type { AppState } from "../state.js";

   export function MyScreen(state: AppState) {
     return ui.column({ gap: 1 }, [
       ui.text("Screen Title", { style: { bold: true } }),
       // screen content
     ]);
   }
   ```

   **Prefer design-system-styled widgets** — use `dsVariant`, `dsTone`, `dsSize` on interactive widgets:
   ```typescript
   ui.button({
     id: "action",
     label: "Go",
     dsVariant: "solid",
     dsTone: "primary",
     dsSize: "md",
     onPress: handleAction,
   })
   ```

2. **Use `ui.column()` or `ui.row()`** as the root container

3. **If the screen needs motion**, prefer declarative hooks inside `defineWidget`:
   ```typescript
   import { defineWidget, ui, useSpring, useTransition } from "@rezi-ui/core";

   const AnimatedScreen = defineWidget<{ target: number }>((props, ctx) => {
     const drift = useTransition(ctx, props.target, { duration: 180, easing: "easeOutCubic" });
     const spring = useSpring(ctx, props.target, { stiffness: 190, damping: 22 });

     return ui.box(
       {
         width: Math.round(20 + drift),
         opacity: Math.max(0.35, Math.min(1, spring / 100)),
         transition: { duration: 180, properties: ["size", "opacity"] },
       },
       [ui.text("Animated screen")],
     );
   });
   ```

4. **If using router**, add a route definition (see `rezi-routing` skill)

5. **Add keybindings** for screen-specific actions in the app's key handler

6. **Wire into main** via router or view switch:
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
- For animated screens: transitions retarget smoothly and no timer leaks occur on unmount

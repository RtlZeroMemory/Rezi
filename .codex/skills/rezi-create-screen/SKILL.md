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
- `packages/create-rezi/templates/starship/` — large-screen routing and animation patterns
- `docs/guide/widget-authoring.md` — design system integration patterns

## Steps

1. **Create screen file** at `src/screens/{screen-name}.ts`:
   ```typescript
   import { ui } from "@rezi-ui/core";
   import type { AppState } from "../state.js";

   export function MyScreen(state: AppState) {
     return ui.page({
       p: 1,
       gap: 1,
       header: ui.header({ title: "Screen Title" }),
       body: ui.column({ gap: 1 }, [
         // screen content
       ]),
     });
   }
   ```

   **Prefer intent-based button styling** (`intent: "primary"`, `"secondary"`, `"danger"`, `"success"`, `"warning"`, `"link"`):
   ```typescript
   ui.button({
     id: "action",
     label: "Go",
     intent: "primary",
     onPress: handleAction,
   })
   ```

2. **Use `ui.page()` or `ui.appShell()`** as the screen root

3. **If the screen needs motion**, prefer declarative hooks inside `defineWidget`:
   ```typescript
   import { defineWidget, ui, useAnimatedValue, useTransition } from "@rezi-ui/core";

   const AnimatedScreen = defineWidget<{ target: number }>((props, ctx) => {
     const drift = useTransition(ctx, props.target, {
       duration: 180,
       easing: "easeOutCubic",
     });
     const energy = useAnimatedValue(ctx, props.target, {
       mode: "spring",
       spring: {
         stiffness: 190,
         damping: 22,
       },
     });

     return ui.box(
       {
         width: Math.round(20 + drift),
         opacity: Math.max(0.35, Math.min(1, energy.value / 100)),
         transition: { duration: 180, easing: "easeInOutCubic", properties: ["size", "opacity"] },
         exitTransition: { duration: 200, easing: "easeInCubic", properties: ["opacity"] },
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

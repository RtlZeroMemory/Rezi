---
name: rezi-routing
description: Add routing with guards and nested outlets to a Rezi app. Use when building multi-page/screen TUI applications.
---

## When to use

Use this skill when:

- App needs multiple pages or screens
- Need route guards (auth, permissions)
- Need nested routes with outlets

## Source of truth

- `packages/core/src/router/` — router implementation, guards, outlets
- `packages/core/src/widgets/ui.ts` — `ui.routerBreadcrumb()`, `ui.routerTabs()`

## Steps

1. **Define routes** with optional guards and nested children:
   ```typescript
   const routes = {
     home: { view: (state) => HomeScreen(state) },
     settings: {
       view: (state) => SettingsScreen(state),
       guard: (from, to, meta) => {
         if (!meta.isAuthenticated) return { redirect: "home" };
         return { allow: true };
       },
     },
     dashboard: {
       view: (state, context) => ui.column([
         Header(state),
         context.outlet,
       ]),
       children: {
         overview: { view: (state) => OverviewPanel(state) },
         stats: { view: (state) => StatsPanel(state) },
       },
     },
   };
   ```

2. **Pass to app**:
   ```typescript
   const app = createApp({ routes, initialRoute: "home" });
   ```

3. **Navigate programmatically**:
   ```typescript
   app.router.navigate("settings");
   app.router.navigate("dashboard.overview");
   ```

4. **Nested routes** render via `context.outlet` in the parent view

5. **Add navigation widgets** (optional):
   ```typescript
   ui.routerBreadcrumb(router, routes)
   ui.routerTabs(router, routes)
   ```

## Verification

- Correct screens render for each route
- Guards block unauthorized access and redirect
- Nested outlet renders child routes
- Back navigation works

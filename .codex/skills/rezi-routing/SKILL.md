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
   const routes = [
     {
       id: "home",
       screen: (_params, context) => HomeScreen(context.state),
     },
     {
       id: "settings",
       screen: (_params, context) => SettingsScreen(context.state),
       guard: (_params, state) => {
         if (!state.meta.isAuthenticated) return { redirect: "home" };
         return true;
       },
     },
     {
       id: "dashboard",
       screen: (_params, context) => ui.column([
         Header(context.state),
         context.outlet,
       ]),
       children: [
         { id: "dashboard.overview", screen: (_params, context) => OverviewPanel(context.state) },
         { id: "dashboard.stats", screen: (_params, context) => StatsPanel(context.state) },
       ],
     },
   ] as const;
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
   if (app.router) {
     ui.routerBreadcrumb(app.router, routes)
     ui.routerTabs(app.router, routes)
   }
   ```

## Verification

- Correct screens render for each route
- Guards block unauthorized access and redirect
- Nested outlet renders child routes
- Back navigation works

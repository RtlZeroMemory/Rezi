# Routing

Rezi's page router handles **application-level screen navigation** (Home, Logs, Settings, Detail) while the internal runtime router continues handling widget-level navigation (tabs, dropdowns, tree, virtual list).

## Why Use Routing

Use the page router when your app needs:

- Multi-screen workflows
- Push/replace/back semantics
- Navigation history
- Global route keybindings
- Focus restoration when returning to previous screens

## CreateApp Route Mode

`createApp` supports route mode directly:

```ts
import { createApp, ui, type RouteDefinition } from "@rezi-ui/core";

type State = { counter: number };

const routes: readonly RouteDefinition<State>[] = [
  {
    id: "home",
    title: "Home",
    keybinding: "ctrl+1",
    screen: (_params, ctx) =>
      ui.button({
        id: "to-settings",
        label: `Counter ${String(ctx.state.counter)}`,
        onPress: () => ctx.router.navigate("settings"),
      }),
  },
  {
    id: "settings",
    title: "Settings",
    keybinding: "ctrl+2",
    screen: (_params, ctx) =>
      ui.button({
        id: "inc",
        label: "Increment",
        onPress: () => ctx.update((prev) => ({ ...prev, counter: prev.counter + 1 })),
      }),
  },
];

const app = createApp({
  backend,
  initialState: { counter: 0 },
  routes,
  initialRoute: "home",
  routeHistoryMaxDepth: 50,
});
```

Notes:

- When routes are configured, `createApp` manages the widget `view` internally.
- Calling `app.view(...)` in route mode throws `ZRUI_MODE_CONFLICT`.
- Use `app.replaceRoutes(nextRoutes)` for development-time route hot swaps
  without restarting the process.

## Route Definition

```ts
type RouteDefinition<S = unknown> = {
  id: string;
  screen: (params: RouteParams, context: RouteRenderContext<S>) => VNode;
  guard?: (params: RouteParams, state: Readonly<S>, ctx: RouteGuardContext) => RouteGuardResult;
  children?: readonly RouteDefinition<S>[];
  title?: string;
  keybinding?: string;
};

type RouteParams = Readonly<Record<string, string>>;
type RouteGuardResult = true | false | { redirect: string; params?: RouteParams };
type RouteGuardContext = {
  from: RouteLocation;
  to: RouteLocation;
  action: "navigate" | "replace" | "back";
};
type RouteRenderContext<S> = {
  router: RouterApi;
  state: Readonly<S>;
  update: (updater: S | ((prev: Readonly<S>) => S)) => void;
  outlet: VNode | null;
};
```

- `id` must be unique.
- `params` are immutable string maps.
- `guard` runs before entering a route.
- `children` enables nested parent/child layouts.
- `title` is used by route-aware UI helpers.
- `keybinding` registers global navigation bindings.

## Router API

When route mode is enabled, `app.router` is available:

```ts
interface RouterApi {
  navigate(routeId: string, params?: RouteParams): void;
  replace(routeId: string, params?: RouteParams): void;
  back(): void;
  currentRoute(): { id: string; params: RouteParams };
  canGoBack(): boolean;
  history(): readonly { id: string; params: RouteParams }[];
}
```

Semantics:

- `navigate`: push a new history entry
- `replace`: replace current entry in-place
- `back`: pop one entry when available
- `navigate` to the same `id+params`: no-op

## Route Guards

Use `guard` to block or redirect before navigation commits:

```ts
{
  id: "admin",
  title: "Admin",
  guard: (_params, state) => {
    if (!state.isAdmin) {
      return { redirect: "home" };
    }
    return true;
  },
  screen: () => ui.text("Admin"),
}
```

- Return `true` to allow.
- Return `false` to cancel.
- Return `{ redirect: "routeId" }` to reroute before rendering the blocked target.
- Guards run for `navigate`, `replace`, and `back` destination resolution.
- For nested routes, guards run in ancestry order (parent to child).

`RouteGuardContext` includes:

- `from`: current route location
- `to`: attempted destination location
- `action`: `"navigate" | "replace" | "back"`

## Nested Routes and Outlet Rendering

Use `children` to define nested route trees:

```ts
const routes: readonly RouteDefinition<State>[] = [
  {
    id: "settings",
    title: "Settings",
    screen: (_params, ctx) =>
      ui.column({ gap: 1 }, [
        ui.text("Settings"),
        ctx.outlet ?? ui.text("Select a tab"),
      ]),
    children: [
      { id: "profile", title: "Profile", screen: () => ui.text("Profile") },
      { id: "appearance", title: "Appearance", screen: () => ui.text("Appearance") },
    ],
  },
];
```

- Child routes render through `context.outlet` in the parent screen.
- Child route ids are still globally unique in the route tree.
- Route helpers (`routerBreadcrumb`, `routerTabs`) resolve nested titles correctly.
- `routerTabs` keeps the top-level parent tab active when a nested child route is selected.

## History Stack

- Default max depth: `50`
- Configure via `routeHistoryMaxDepth`
- Bounded/circular behavior: overflow evicts oldest entries
- Public history entries are serializable (`id`, `params`)

## Keybinding Integration

Routes with `keybinding` register global app keybindings automatically.

Behavior:

- If keybinding target is not current route: `navigate(targetRoute)`
- If already current: no-op

## Focus Restoration

On route transitions:

- Current route focus state is snapshotted before navigate/replace/back
- `back()` restores the destination route focus snapshot when available

This preserves screen-level focus continuity for workflows like:

1. Focus a control in Logs
2. Navigate to Detail
3. Back to Logs
4. Focus returns to prior Logs control

## Route UI Helpers

Use existing navigation widgets with router state:

```ts
ui.routerTabs(ctx.router, routes, { id: "main-tabs" });
ui.routerBreadcrumb(ctx.router, routes, { id: "main-crumb" });
```

These are thin wrappers over built-in `tabs` and `breadcrumb` widgets.

`routerTabs` uses `replace` semantics by default so top-level tab switches
don't spam route history. If you explicitly want push history per tab switch:

```ts
ui.routerTabs(ctx.router, routes, {
  id: "main-tabs",
  historyMode: "push",
});
```

## Parameterized Routes

Pass params in `navigate`/`replace`:

```ts
ctx.router.navigate("detail", { id: entry.id });
ctx.router.replace("detail", { id: nextEntry.id });
```

Read params in screen:

```ts
screen: (params, ctx) => {
  const id = params["id"];
  // ...
}
```

## JSX Usage

No special JSX router wrapper is required.

- Route screens can return JSX VNodes via `@rezi-ui/jsx`
- Router API is available through the screen render context (`ctx.router`)

## Record/Replay Compatibility

Router transitions are deterministic and state-driven:

- Same route action sequence produces the same route history
- History entries are serializable
- Back/replace/push semantics are stable across replay

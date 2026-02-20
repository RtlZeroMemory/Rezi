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

## Route Definition

```ts
type RouteDefinition<S = unknown> = {
  id: string;
  screen: (params: RouteParams, context: RouteRenderContext<S>) => VNode;
  title?: string;
  keybinding?: string;
};

type RouteParams = Readonly<Record<string, string>>;
```

- `id` must be unique.
- `params` are immutable string maps.
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

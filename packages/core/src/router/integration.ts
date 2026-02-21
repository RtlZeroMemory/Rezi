import { ZrUiError } from "../abi.js";
import type { WidgetFocusSnapshot } from "../app/widgetRenderer.js";
import type { BindingMap, KeyContext } from "../keybindings/index.js";
import type { VNode } from "../widgets/types.js";
import { createRouteKeybindings } from "./keybindings.js";
import {
  backRouterState,
  canGoBackFromState,
  createRouteRegistry,
  createRouterState,
  currentRouteFromState,
  historyFromState,
  navigateRouterState,
  normalizeRouteParams,
  replaceRouterState,
} from "./router.js";
import type {
  RouteDefinition,
  RouteGuardResult,
  RouteParams,
  RouterApi,
  RouterState,
} from "./types.js";

const GUARD_MAX_REDIRECT_DEPTH = 16;

/**
 * Integration options for binding the router to `createApp` lifecycle.
 */
export type RouterIntegrationOptions<S> = Readonly<{
  routes: readonly RouteDefinition<S>[];
  initialRoute: string;
  maxHistoryDepth?: number;
  getState: () => Readonly<S>;
  requestRouteRender: () => void;
  captureFocusSnapshot: () => WidgetFocusSnapshot;
  restoreFocusSnapshot: (snapshot: WidgetFocusSnapshot) => void;
  assertCanMutate: (method: string) => void;
}>;

/**
 * Router integration result consumed by createApp.
 */
export type RouterIntegration<S> = Readonly<{
  router: RouterApi;
  routeKeybindings: BindingMap<KeyContext<S>>;
  replaceRoutes: (routes: readonly RouteDefinition<S>[]) => BindingMap<KeyContext<S>>;
  renderCurrentScreen: (
    state: Readonly<S>,
    update: (updater: S | ((prev: Readonly<S>) => S)) => void,
  ) => VNode;
}>;

function pruneUnusedFocusSnapshots(
  snapshots: Map<number, WidgetFocusSnapshot>,
  state: RouterState,
): void {
  const aliveVisitIds = new Set<number>();
  for (const entry of state.entries) {
    aliveVisitIds.add(entry.visitId);
  }

  for (const visitId of snapshots.keys()) {
    if (!aliveVisitIds.has(visitId)) snapshots.delete(visitId);
  }
}

function isGuardRedirect(
  result: RouteGuardResult,
): result is Exclude<RouteGuardResult, true | false> {
  return typeof result === "object" && result !== null && typeof result.redirect === "string";
}

function buildRouteKeybindingTargets<S>(
  routes: readonly RouteDefinition<S>[],
): ReadonlyMap<string, string> {
  const byKeybinding = new Map<string, string>();

  function visit(routeList: readonly RouteDefinition<S>[]): void {
    for (const route of routeList) {
      const keybinding = route.keybinding?.trim();
      if (keybinding) {
        byKeybinding.set(keybinding, route.id);
      }
      if (route.children !== undefined) {
        visit(route.children);
      }
    }
  }

  visit(routes);
  return byKeybinding;
}

/**
 * Create an app-bound router integration.
 */
export function createRouterIntegration<S>(
  opts: RouterIntegrationOptions<S>,
): RouterIntegration<S> {
  let routeRegistry = createRouteRegistry(opts.routes);
  let routeMap = routeRegistry.routeMap;
  let recordById = routeRegistry.recordById;
  if (!routeMap.has(opts.initialRoute)) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `initialRoute \"${opts.initialRoute}\" was not found in routes`,
    );
  }

  let state = createRouterState(opts.initialRoute, {
    ...(opts.maxHistoryDepth === undefined ? {} : { maxDepth: opts.maxHistoryDepth }),
  });

  const focusSnapshotsByVisitId = new Map<number, WidgetFocusSnapshot>();

  function normalizeKnownRouteId(routeId: string): string {
    const normalized = routeId.trim();
    if (!normalized) {
      throw new ZrUiError("ZRUI_INVALID_PROPS", "route id must be a non-empty string");
    }
    if (!routeMap.has(normalized)) {
      throw new ZrUiError("ZRUI_INVALID_PROPS", `unknown route id: ${normalized}`);
    }
    return normalized;
  }

  function resolveGuardedNavigation(
    routeId: string,
    params: RouteParams | undefined,
    action: "navigate" | "replace" | "back",
  ): Readonly<{ routeId: string; params: RouteParams }> | null {
    const from = currentRouteFromState(state);
    let resolvedRouteId = normalizeKnownRouteId(routeId);
    let resolvedParams = normalizeRouteParams(params);
    const seen = new Set<string>();

    for (let depth = 0; depth <= GUARD_MAX_REDIRECT_DEPTH; depth += 1) {
      const record = recordById.get(resolvedRouteId);
      if (!record) {
        throw new ZrUiError(
          "ZRUI_INVALID_STATE",
          `route id "${resolvedRouteId}" is not registered`,
        );
      }
      const to = Object.freeze({ id: resolvedRouteId, params: resolvedParams });
      let redirected = false;
      for (const ancestryRouteId of record.ancestry) {
        const ancestryRoute = routeMap.get(ancestryRouteId);
        if (!ancestryRoute) {
          throw new ZrUiError(
            "ZRUI_INVALID_STATE",
            `route id "${ancestryRouteId}" is not registered`,
          );
        }

        const guard = ancestryRoute.guard;
        if (!guard) continue;

        const guardResult = guard(
          resolvedParams,
          opts.getState(),
          Object.freeze({
            from,
            to,
            action,
          }),
        );

        if (guardResult === true) {
          continue;
        }
        if (guardResult === false) {
          return null;
        }
        if (!isGuardRedirect(guardResult)) {
          throw new ZrUiError(
            "ZRUI_INVALID_PROPS",
            `guard for route "${ancestryRouteId}" must return true, false, or { redirect }`,
          );
        }

        resolvedRouteId = normalizeKnownRouteId(guardResult.redirect);
        resolvedParams = normalizeRouteParams(guardResult.params);

        const marker = `${resolvedRouteId}\u0000${JSON.stringify(resolvedParams)}`;
        if (seen.has(marker)) {
          throw new ZrUiError(
            "ZRUI_INVALID_PROPS",
            `route guard redirect loop detected at route "${resolvedRouteId}"`,
          );
        }
        seen.add(marker);
        redirected = true;
        break;
      }

      if (!redirected) {
        return Object.freeze({ routeId: resolvedRouteId, params: resolvedParams });
      }
    }

    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `route guard redirect depth exceeded ${String(GUARD_MAX_REDIRECT_DEPTH)}`,
    );
  }

  function captureCurrentFocusSnapshot(): void {
    const currentEntry = state.entries[state.entries.length - 1];
    if (!currentEntry) return;
    focusSnapshotsByVisitId.set(currentEntry.visitId, opts.captureFocusSnapshot());
  }

  function commitState(nextState: RouterState, restoreFocus: boolean): void {
    if (nextState === state) return;
    state = nextState;

    pruneUnusedFocusSnapshots(focusSnapshotsByVisitId, state);

    if (restoreFocus) {
      const currentEntry = state.entries[state.entries.length - 1];
      if (currentEntry) {
        const snapshot = focusSnapshotsByVisitId.get(currentEntry.visitId);
        if (snapshot) {
          opts.restoreFocusSnapshot(snapshot);
        }
      }
    }

    opts.requestRouteRender();
  }

  function coerceFirstRouteId(routes: readonly RouteDefinition<S>[]): string {
    const first = routes[0];
    if (!first || typeof first.id !== "string" || first.id.trim().length === 0) {
      throw new ZrUiError("ZRUI_INVALID_PROPS", "routes must contain at least one route");
    }
    return first.id.trim();
  }

  function remapStateToRouteRegistry(
    nextRouteMap: ReadonlyMap<string, RouteDefinition<S>>,
    nextRoutes: readonly RouteDefinition<S>[],
  ): RouterState {
    const keptEntries = state.entries.filter((entry) => nextRouteMap.has(entry.id));
    if (keptEntries.length === state.entries.length) {
      return state;
    }

    if (keptEntries.length === 0) {
      return createRouterState(coerceFirstRouteId(nextRoutes), { maxDepth: state.maxDepth });
    }

    return Object.freeze({
      maxDepth: state.maxDepth,
      nextVisitId: state.nextVisitId,
      entries: Object.freeze([...keptEntries]),
    });
  }

  const router: RouterApi = Object.freeze({
    navigate(routeId: string, params?: RouteParams) {
      opts.assertCanMutate("router.navigate");
      const resolved = resolveGuardedNavigation(routeId, params, "navigate");
      if (!resolved) return;

      captureCurrentFocusSnapshot();
      commitState(navigateRouterState(state, resolved.routeId, resolved.params), false);
    },

    replace(routeId: string, params?: RouteParams) {
      opts.assertCanMutate("router.replace");
      const resolved = resolveGuardedNavigation(routeId, params, "replace");
      if (!resolved) return;

      captureCurrentFocusSnapshot();
      commitState(replaceRouterState(state, resolved.routeId, resolved.params), false);
    },

    back() {
      opts.assertCanMutate("router.back");
      if (!canGoBackFromState(state)) return;

      const previous = state.entries[state.entries.length - 2];
      if (!previous) return;
      const resolved = resolveGuardedNavigation(previous.id, previous.params, "back");
      if (!resolved) return;

      captureCurrentFocusSnapshot();
      const poppedState = backRouterState(state);
      const redirectedState = replaceRouterState(poppedState, resolved.routeId, resolved.params);
      commitState(redirectedState, redirectedState === poppedState);
    },

    currentRoute() {
      return currentRouteFromState(state);
    },

    canGoBack() {
      return canGoBackFromState(state);
    },

    history() {
      return historyFromState(state);
    },
  });

  let routeKeybindingTargets = buildRouteKeybindingTargets(opts.routes);
  const resolveRouteIdForKeybinding = (keybinding: string): string | undefined => {
    return routeKeybindingTargets.get(keybinding);
  };

  const routeKeybindings = createRouteKeybindings(opts.routes, router, {
    resolveRouteIdForKeybinding,
  });

  return Object.freeze({
    router,
    routeKeybindings,
    replaceRoutes: (routes: readonly RouteDefinition<S>[]) => {
      const nextRegistry = createRouteRegistry(routes);
      const nextRouteMap = nextRegistry.routeMap;
      if (nextRouteMap.size === 0) {
        throw new ZrUiError("ZRUI_INVALID_PROPS", "routes must contain at least one route");
      }

      routeRegistry = nextRegistry;
      routeMap = routeRegistry.routeMap;
      recordById = routeRegistry.recordById;
      routeKeybindingTargets = buildRouteKeybindingTargets(routes);

      state = remapStateToRouteRegistry(routeMap, routes);
      pruneUnusedFocusSnapshots(focusSnapshotsByVisitId, state);
      opts.requestRouteRender();

      return createRouteKeybindings(routes, router, {
        resolveRouteIdForKeybinding,
      });
    },
    renderCurrentScreen: (appState, update) => {
      const current = currentRouteFromState(state);
      const record = recordById.get(current.id);
      if (!record) {
        throw new ZrUiError(
          "ZRUI_INVALID_STATE",
          `route id "${current.id}" is not registered in the route map`,
        );
      }

      let outlet: VNode | null = null;
      for (let i = record.ancestry.length - 1; i >= 0; i -= 1) {
        const routeId = record.ancestry[i];
        if (!routeId) {
          throw new ZrUiError("ZRUI_INVALID_STATE", "route ancestry contains an empty id");
        }
        const route = routeMap.get(routeId);
        if (!route) {
          throw new ZrUiError(
            "ZRUI_INVALID_STATE",
            `route id "${routeId}" is not registered in the route map`,
          );
        }

        outlet = route.screen(
          current.params,
          Object.freeze({
            router,
            state: appState,
            update,
            outlet,
          }),
        );
      }

      if (!outlet) {
        throw new ZrUiError("ZRUI_INVALID_STATE", "failed to render route outlet");
      }
      return outlet;
    },
  });
}

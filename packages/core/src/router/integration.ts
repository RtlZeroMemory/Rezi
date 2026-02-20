import { ZrUiError } from "../abi.js";
import type { WidgetFocusSnapshot } from "../app/widgetRenderer.js";
import type { BindingMap, KeyContext } from "../keybindings/index.js";
import type { VNode } from "../widgets/types.js";
import { createRouteKeybindings } from "./keybindings.js";
import {
  backRouterState,
  canGoBackFromState,
  createRouteMap,
  createRouterState,
  currentRouteFromState,
  historyFromState,
  navigateRouterState,
  replaceRouterState,
} from "./router.js";
import type { RouteDefinition, RouteParams, RouterApi, RouterState } from "./types.js";

/**
 * Integration options for binding the router to `createApp` lifecycle.
 */
export type RouterIntegrationOptions<S> = Readonly<{
  routes: readonly RouteDefinition<S>[];
  initialRoute: string;
  maxHistoryDepth?: number;
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

/**
 * Create an app-bound router integration.
 */
export function createRouterIntegration<S>(
  opts: RouterIntegrationOptions<S>,
): RouterIntegration<S> {
  const routeMap = createRouteMap(opts.routes);
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

  const router: RouterApi = Object.freeze({
    navigate(routeId: string, params?: RouteParams) {
      opts.assertCanMutate("router.navigate");
      if (!routeMap.has(routeId)) {
        throw new ZrUiError("ZRUI_INVALID_PROPS", `unknown route id: ${routeId}`);
      }

      captureCurrentFocusSnapshot();
      commitState(navigateRouterState(state, routeId, params), false);
    },

    replace(routeId: string, params?: RouteParams) {
      opts.assertCanMutate("router.replace");
      if (!routeMap.has(routeId)) {
        throw new ZrUiError("ZRUI_INVALID_PROPS", `unknown route id: ${routeId}`);
      }

      captureCurrentFocusSnapshot();
      commitState(replaceRouterState(state, routeId, params), false);
    },

    back() {
      opts.assertCanMutate("router.back");
      if (!canGoBackFromState(state)) return;

      captureCurrentFocusSnapshot();
      commitState(backRouterState(state), true);
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

  const routeKeybindings = createRouteKeybindings(opts.routes, router);

  return Object.freeze({
    router,
    routeKeybindings,
    renderCurrentScreen: (appState, update) => {
      const current = currentRouteFromState(state);
      const route = routeMap.get(current.id);
      if (!route) {
        throw new ZrUiError(
          "ZRUI_INVALID_STATE",
          `route id \"${current.id}\" is not registered in the route map`,
        );
      }

      return route.screen(
        current.params,
        Object.freeze({
          router,
          state: appState,
          update,
        }),
      );
    },
  });
}

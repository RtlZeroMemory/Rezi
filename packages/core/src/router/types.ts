import type { VNode } from "../widgets/types.js";

/**
 * Route params passed to a screen.
 *
 * Params are stored as an immutable string map so routing history remains
 * serializable and deterministic.
 */
export type RouteParams = Readonly<Record<string, string>>;

/**
 * Public route location entry.
 */
export type RouteLocation = Readonly<{
  id: string;
  params: RouteParams;
}>;

/**
 * Public navigation API for page-level routing.
 */
export interface RouterApi {
  /** Push a route on top of history. */
  navigate(routeId: string, params?: RouteParams): void;
  /** Replace the current route entry without growing history. */
  replace(routeId: string, params?: RouteParams): void;
  /** Pop one entry from history when possible. */
  back(): void;
  /** Get the current route location. */
  currentRoute(): RouteLocation;
  /** True when back() can pop an entry. */
  canGoBack(): boolean;
  /** Ordered history from oldest entry to current entry. */
  history(): readonly RouteLocation[];
}

/**
 * Context passed to route screen render functions.
 *
 * A route screen can ignore this context and use only `params`, or use it to
 * read state, schedule updates, and navigate.
 */
export type RouteRenderContext<S> = Readonly<{
  router: RouterApi;
  state: Readonly<S>;
  update: (updater: S | ((prev: Readonly<S>) => S)) => void;
}>;

/**
 * Route registration entry.
 */
export type RouteDefinition<S = unknown> = Readonly<{
  /** Unique route identifier. */
  id: string;
  /** Route screen render function. */
  screen: (params: RouteParams, context: RouteRenderContext<S>) => VNode;
  /** Human-readable title for breadcrumbs/tabs/navigation UI. */
  title?: string;
  /** Optional global keybinding (e.g. "ctrl+1"). */
  keybinding?: string;
}>;

/**
 * Internal route stack entry (includes stable visit id for focus snapshots).
 */
export type RouterStateEntry = Readonly<{
  visitId: number;
  id: string;
  params: RouteParams;
}>;

/**
 * Internal router state.
 *
 * Serializable by design for record/replay and deterministic tests.
 */
export type RouterState = Readonly<{
  maxDepth: number;
  nextVisitId: number;
  entries: readonly RouterStateEntry[];
}>;

/**
 * Serialized router state snapshot.
 */
export type RouterStateSnapshot = RouterState;

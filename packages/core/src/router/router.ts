import { ZrUiError } from "../abi.js";
import type {
  RouteDefinition,
  RouteLocation,
  RouteParams,
  RouterState,
  RouterStateEntry,
  RouterStateSnapshot,
} from "./types.js";

const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
const DEV_MODE = NODE_ENV !== "production";

function warnDev(message: string): void {
  if (!DEV_MODE) return;
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

const DEFAULT_HISTORY_DEPTH = 50;

export type RouteRecord<S> = Readonly<{
  route: RouteDefinition<S>;
  parentId: string | null;
  ancestry: readonly string[];
}>;

export type RouteRegistry<S> = Readonly<{
  routeMap: ReadonlyMap<string, RouteDefinition<S>>;
  recordById: ReadonlyMap<string, RouteRecord<S>>;
}>;

function throwInvalidProps(detail: string): never {
  throw new ZrUiError("ZRUI_INVALID_PROPS", detail);
}

function normalizeRouteId(routeId: string): string {
  const normalized = routeId.trim();
  if (!normalized) {
    throwInvalidProps("route id must be a non-empty string");
  }
  if (DEV_MODE && /[^a-zA-Z0-9_\-.]/.test(normalized)) {
    warnDev(
      `[rezi] route id "${normalized}" contains non-identifier characters. Use only letters, digits, hyphens, underscores, and dots.`,
    );
  }
  return normalized;
}

/**
 * Normalize params to an immutable, key-sorted object.
 */
export function normalizeRouteParams(params: RouteParams | undefined): RouteParams {
  if (!params) return Object.freeze({});

  const entries = Object.entries(params)
    .map(([key, value]) => {
      if (DEV_MODE && typeof value !== "string") {
        warnDev(
          `[rezi] route param "${key}" has non-string value (${typeof value}), coerced to string. Pass string values to avoid implicit coercion.`,
        );
      }
      return [String(key), String(value)] as const;
    })
    .sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return 0;
    });

  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    normalized[key] = value;
  }

  return Object.freeze(normalized);
}

function routeParamsEqual(a: RouteParams, b: RouteParams): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function createStateEntry(visitId: number, id: string, params: RouteParams): RouterStateEntry {
  return Object.freeze({ visitId, id, params });
}

function createState(
  maxDepth: number,
  nextVisitId: number,
  entries: readonly RouterStateEntry[],
): RouterState {
  return Object.freeze({
    maxDepth,
    nextVisitId,
    entries: Object.freeze(entries.slice()),
  });
}

function collectRouteDefinitions<S>(
  routes: readonly RouteDefinition<S>[],
  parentId: string | null,
  ancestryPrefix: readonly string[],
  routeMap: Map<string, RouteDefinition<S>>,
  recordById: Map<string, RouteRecord<S>>,
): void {
  for (const route of routes) {
    const routeId = normalizeRouteId(route.id);
    if (routeMap.has(routeId)) {
      throwInvalidProps(`duplicate route id: ${routeId}`);
    }

    const ancestry = Object.freeze([...ancestryPrefix, routeId]);
    routeMap.set(routeId, route);
    recordById.set(
      routeId,
      Object.freeze({
        route,
        parentId,
        ancestry,
      }),
    );

    const children = route.children;
    if (children !== undefined) {
      if (!Array.isArray(children)) {
        throwInvalidProps(`children for route "${routeId}" must be an array when provided`);
      }
      collectRouteDefinitions(children, routeId, ancestry, routeMap, recordById);
    }
  }
}

/**
 * Build and validate route registry metadata.
 */
export function createRouteRegistry<S>(routes: readonly RouteDefinition<S>[]): RouteRegistry<S> {
  if (routes.length === 0) {
    throwInvalidProps("routes must contain at least one route");
  }

  const routeMap = new Map<string, RouteDefinition<S>>();
  const recordById = new Map<string, RouteRecord<S>>();
  collectRouteDefinitions(routes, null, [], routeMap, recordById);

  return Object.freeze({
    routeMap,
    recordById,
  });
}

/**
 * Build and validate a route map.
 */
export function createRouteMap<S>(
  routes: readonly RouteDefinition<S>[],
): ReadonlyMap<string, RouteDefinition<S>> {
  return createRouteRegistry(routes).routeMap;
}

/**
 * Create initial router state.
 */
export function createRouterState(
  initialRouteId: string,
  opts: Readonly<{ maxDepth?: number; initialParams?: RouteParams }> = {},
): RouterState {
  const routeId = normalizeRouteId(initialRouteId);
  const maxDepth = opts.maxDepth ?? DEFAULT_HISTORY_DEPTH;
  if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
    throwInvalidProps("routeHistoryMaxDepth must be a positive integer");
  }

  const initialEntry = createStateEntry(1, routeId, normalizeRouteParams(opts.initialParams));
  return createState(maxDepth, 2, [initialEntry]);
}

function pushBounded(
  entries: readonly RouterStateEntry[],
  entry: RouterStateEntry,
  maxDepth: number,
): readonly RouterStateEntry[] {
  const next = [...entries, entry];
  if (next.length > maxDepth) {
    next.shift();
  }
  return next;
}

/**
 * Push navigation.
 */
export function navigateRouterState(
  state: RouterState,
  routeId: string,
  params?: RouteParams,
): RouterState {
  const id = normalizeRouteId(routeId);
  const nextParams = normalizeRouteParams(params);
  const current = state.entries[state.entries.length - 1];

  if (current && current.id === id && routeParamsEqual(current.params, nextParams)) {
    return state;
  }

  const nextEntry = createStateEntry(state.nextVisitId, id, nextParams);
  const nextEntries = pushBounded(state.entries, nextEntry, state.maxDepth);
  return createState(state.maxDepth, state.nextVisitId + 1, nextEntries);
}

/**
 * Replace current navigation entry.
 */
export function replaceRouterState(
  state: RouterState,
  routeId: string,
  params?: RouteParams,
): RouterState {
  const id = normalizeRouteId(routeId);
  const nextParams = normalizeRouteParams(params);
  const current = state.entries[state.entries.length - 1];

  if (current && current.id === id && routeParamsEqual(current.params, nextParams)) {
    return state;
  }

  const nextEntry = createStateEntry(state.nextVisitId, id, nextParams);
  const nextEntries = state.entries.slice(0, -1);
  nextEntries.push(nextEntry);

  return createState(state.maxDepth, state.nextVisitId + 1, nextEntries);
}

/**
 * Pop navigation history.
 */
export function backRouterState(state: RouterState): RouterState {
  if (state.entries.length <= 1) return state;
  return createState(state.maxDepth, state.nextVisitId, state.entries.slice(0, -1));
}

/**
 * Read current route location.
 */
export function currentRouteFromState(state: RouterState): RouteLocation {
  const current = state.entries[state.entries.length - 1];
  if (!current) {
    throw new ZrUiError("ZRUI_INVALID_STATE", "router state is empty");
  }
  return Object.freeze({ id: current.id, params: current.params });
}

/**
 * Read full route history from oldest to newest.
 */
export function historyFromState(state: RouterState): readonly RouteLocation[] {
  return Object.freeze(
    state.entries.map((entry) =>
      Object.freeze({
        id: entry.id,
        params: entry.params,
      }),
    ),
  );
}

/**
 * Whether back() can pop.
 */
export function canGoBackFromState(state: RouterState): boolean {
  return state.entries.length > 1;
}

/**
 * Serialize router state.
 */
export function serializeRouterState(state: RouterState): RouterStateSnapshot {
  return Object.freeze({
    maxDepth: state.maxDepth,
    nextVisitId: state.nextVisitId,
    entries: Object.freeze(
      state.entries.map((entry) =>
        Object.freeze({
          visitId: entry.visitId,
          id: entry.id,
          params: normalizeRouteParams(entry.params),
        }),
      ),
    ),
  });
}

/**
 * Deserialize and validate router state.
 */
export function deserializeRouterState(snapshot: RouterStateSnapshot): RouterState {
  const maxDepth = snapshot.maxDepth;
  if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
    throwInvalidProps("router snapshot maxDepth must be a positive integer");
  }

  const nextVisitId = snapshot.nextVisitId;
  if (!Number.isInteger(nextVisitId) || nextVisitId <= 0) {
    throwInvalidProps("router snapshot nextVisitId must be a positive integer");
  }

  if (!Array.isArray(snapshot.entries) || snapshot.entries.length === 0) {
    throwInvalidProps("router snapshot entries must contain at least one item");
  }

  const entries: RouterStateEntry[] = [];
  for (const entry of snapshot.entries) {
    if (!Number.isInteger(entry.visitId) || entry.visitId <= 0) {
      throwInvalidProps("router snapshot visitId must be a positive integer");
    }
    const id = normalizeRouteId(entry.id);
    entries.push(createStateEntry(entry.visitId, id, normalizeRouteParams(entry.params)));
  }

  return createState(maxDepth, nextVisitId, entries);
}

/**
 * Return the default bounded router history depth.
 */
export function defaultRouteHistoryDepth(): number {
  return DEFAULT_HISTORY_DEPTH;
}

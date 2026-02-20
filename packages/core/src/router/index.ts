export {
  defaultRouteHistoryDepth,
  createRouteMap,
  createRouterState,
  normalizeRouteParams,
  navigateRouterState,
  replaceRouterState,
  backRouterState,
  currentRouteFromState,
  canGoBackFromState,
  historyFromState,
  serializeRouterState,
  deserializeRouterState,
} from "./router.js";

export { createRouteKeybindings } from "./keybindings.js";

export {
  buildRouterBreadcrumbItems,
  buildRouterTabsProps,
  buildRouterTabsItems,
  routerBreadcrumb,
  routerTabs,
  type RouterBreadcrumbProps,
  type RouterTabsProps,
} from "./helpers.js";

export { createRouterIntegration, type RouterIntegration } from "./integration.js";

export type {
  RouteDefinition,
  RouteLocation,
  RouteParams,
  RouteRenderContext,
  RouterApi,
  RouterState,
  RouterStateEntry,
  RouterStateSnapshot,
} from "./types.js";

/**
 * packages/core/src/runtime/router.ts — Event routing to widget actions.
 *
 * Facade file: public import path and exports are stable.
 * Internal implementation lives in `./router/*`.
 *
 * @see docs/guide/runtime-and-layout.md
 */

export type {
  DropdownRoutingCtx,
  DropdownRoutingResult,
  EnabledById,
  KeyRoutingCtx,
  KeyRoutingCtxWithZones,
  LayerRoutingCtx,
  LayerRoutingResult,
  MouseRoutingCtx,
  RoutedAction,
  RoutingResult,
  RoutingResultWithZones,
  TableRoutingCtx,
  TableRoutingResult,
  TreeRoutingCtx,
  TreeRoutingResult,
  VirtualListRoutingCtx,
  VirtualListRoutingResult,
  VirtualListWheelCtx,
} from "./router/types.js";

export { routeKey } from "./router/key.js";
export { routeMouse } from "./router/mouse.js";
export { routeKeyWithZones } from "./router/zones.js";
export { routeVirtualListKey, routeVirtualListWheel } from "./router/virtualList.js";
export { routeLayerEscape } from "./router/layer.js";
export { routeDropdownKey } from "./router/dropdown.js";
export { routeTableKey } from "./router/table.js";
export { routeTreeKey } from "./router/tree.js";
export { routeTabsKey } from "./router/tabs.js";
export { routePaginationKey } from "./router/pagination.js";

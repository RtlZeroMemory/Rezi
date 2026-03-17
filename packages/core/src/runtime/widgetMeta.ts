/**
 * packages/core/src/runtime/widgetMeta.ts — Public widget metadata API.
 *
 * Why: Keep the stable widget metadata entrypoint small while delegating
 * concern-specific logic to internal modules under `runtime/widgetMeta/`.
 */

export type { CollectedWidgetMetadata } from "./widgetMeta/collector.js";
export {
  WidgetMetadataCollector,
  collectAllWidgetMetadata,
  createWidgetMetadataCollector,
} from "./widgetMeta/collector.js";
export type { CollectedTrap, CollectedZone } from "./widgetMeta/focusContainers.js";
export { collectFocusTraps, collectFocusZones } from "./widgetMeta/focusContainers.js";
export type { FocusInfo } from "./widgetMeta/focusInfo.js";
export type { InputMeta } from "./widgetMeta/helpers.js";
export {
  collectEnabledMap,
  collectFocusableIds,
  collectInputMetaById,
  collectPressableIds,
} from "./widgetMeta/helpers.js";

/**
 * packages/core/src/app/runtimeBreadcrumbs.ts — Runtime breadcrumb snapshot shapes.
 *
 * Why: Defines metadata shapes consumed by inspector/export plumbing without
 * affecting runtime behavior.
 */

import type { CursorShape } from "../abi.js";
import type { RoutedAction } from "../runtime/router.js";

/** Engine event kinds tracked by runtime breadcrumbs. */
export type RuntimeBreadcrumbEventKind =
  | "key"
  | "text"
  | "paste"
  | "mouse"
  | "resize"
  | "tick"
  | "user";

/** Which routing path handled the last tracked engine event. */
export type RuntimeBreadcrumbConsumptionPath = "keybindings" | "widgetRouting";

/** Last emitted widget action summary. */
export type RuntimeBreadcrumbAction = Readonly<{
  id: string;
  action: RoutedAction["action"];
}>;

/** Focus summary for inspector/export snapshots. */
export type RuntimeBreadcrumbFocusSummary = Readonly<{
  focusedId: string | null;
  activeZoneId: string | null;
  activeTrapId: string | null;
  announcement: string | null;
}>;

/** Cursor intent summary for native cursor protocol. */
export type RuntimeBreadcrumbCursorSummary =
  | Readonly<{
      visible: false;
      shape: CursorShape;
      blink: boolean;
    }>
  | Readonly<{
      visible: true;
      x: number;
      y: number;
      shape: CursorShape;
      blink: boolean;
    }>;

/** Damage mode for the submitted frame. */
export type RuntimeBreadcrumbDamageMode = "none" | "full" | "incremental";

/** Damage summary for inspector/export snapshots. */
export type RuntimeBreadcrumbDamageSummary = Readonly<{
  mode: RuntimeBreadcrumbDamageMode;
  rectCount: number;
  area: number;
}>;

/** Frame summary captured during submitFrame(). */
export type RuntimeBreadcrumbFrameSummary = Readonly<{
  tick: number;
  commit: boolean;
  layout: boolean;
  incremental: boolean;
  renderTimeMs: number;
}>;

/** Renderer-owned runtime metadata snapshot (without app-level event routing fields). */
export type WidgetRuntimeBreadcrumbSnapshot = Readonly<{
  focus: RuntimeBreadcrumbFocusSummary;
  cursor: RuntimeBreadcrumbCursorSummary | null;
  damage: RuntimeBreadcrumbDamageSummary;
  frame: RuntimeBreadcrumbFrameSummary;
}>;

/** Full runtime breadcrumb snapshot emitted to internal inspector hooks. */
export type RuntimeBreadcrumbSnapshot = Readonly<
  WidgetRuntimeBreadcrumbSnapshot & {
    event: Readonly<{
      kind: RuntimeBreadcrumbEventKind | null;
      path: RuntimeBreadcrumbConsumptionPath | null;
    }>;
    lastAction: RuntimeBreadcrumbAction | null;
  }
>;

const EMPTY_FOCUS: RuntimeBreadcrumbFocusSummary = Object.freeze({
  focusedId: null,
  activeZoneId: null,
  activeTrapId: null,
  announcement: null,
});

const EMPTY_DAMAGE: RuntimeBreadcrumbDamageSummary = Object.freeze({
  mode: "none",
  rectCount: 0,
  area: 0,
});

const EMPTY_FRAME: RuntimeBreadcrumbFrameSummary = Object.freeze({
  tick: 0,
  commit: false,
  layout: false,
  incremental: false,
  renderTimeMs: 0,
});

/** Zero-state runtime snapshot used before first captured frame. */
export const EMPTY_WIDGET_RUNTIME_BREADCRUMBS: WidgetRuntimeBreadcrumbSnapshot = Object.freeze({
  focus: EMPTY_FOCUS,
  cursor: null,
  damage: EMPTY_DAMAGE,
  frame: EMPTY_FRAME,
});

/** Convert router action payload to breadcrumb summary shape. */
export function toRuntimeBreadcrumbAction(action: RoutedAction): RuntimeBreadcrumbAction {
  return Object.freeze({
    id: action.id,
    action: action.action,
  });
}

/** Narrow runtime event kinds that breadcrumbs track. */
export function isRuntimeBreadcrumbEventKind(kind: string): kind is RuntimeBreadcrumbEventKind {
  return (
    kind === "key" ||
    kind === "text" ||
    kind === "paste" ||
    kind === "mouse" ||
    kind === "resize" ||
    kind === "tick" ||
    kind === "user"
  );
}

/** Merge renderer snapshot with app-level event/action metadata. */
export function mergeRuntimeBreadcrumbSnapshot(
  widget: WidgetRuntimeBreadcrumbSnapshot,
  eventKind: RuntimeBreadcrumbEventKind | null,
  eventPath: RuntimeBreadcrumbConsumptionPath | null,
  lastAction: RuntimeBreadcrumbAction | null,
  renderTimeMs: number,
): RuntimeBreadcrumbSnapshot {
  const frame: RuntimeBreadcrumbFrameSummary = Object.freeze({
    ...widget.frame,
    renderTimeMs,
  });

  return Object.freeze({
    focus: widget.focus,
    cursor: widget.cursor,
    damage: widget.damage,
    frame,
    event: Object.freeze({
      kind: eventKind,
      path: eventPath,
    }),
    lastAction,
  });
}

/**
 * Widget Protocol Registry — single source of truth for per-kind capabilities.
 *
 * Every subsystem (commit, widgetMeta, hitTest, router) MUST use this registry
 * instead of hardcoding widget kind checks.
 */

import type { VNode } from "./types.js";

/** Children layout policy. */
export type ChildrenPolicy = "none" | "single" | "many";

/** Input model for event routing. */
export type InputModel = "none" | "press" | "text" | "value" | "composite";

/** Per-widget-kind capability descriptor. */
export type WidgetProtocol = Readonly<{
  /** Does this widget require a unique `id` prop for focus/routing? */
  requiresId: boolean;
  /** Is this widget focusable by default (Tab traversal)? */
  focusable: boolean;
  /** Can this widget produce a "press" action? */
  pressable: boolean;
  /** Does this widget support the `disabled` prop to suppress focus? */
  disableable: boolean;
  /** Does this widget need an `open` prop to be focusable? (commandPalette, toolApprovalDialog) */
  openGated: boolean;
  /** Does this widget require routing rebuild when props change? */
  requiresRoutingRebuild: boolean;
}>;

const INTERACTIVE_FOCUSABLE_PRESSABLE: WidgetProtocol = Object.freeze({
  requiresId: true,
  focusable: true,
  pressable: true,
  disableable: true,
  openGated: false,
  requiresRoutingRebuild: true,
});

const INTERACTIVE_OPTIONAL_ID_FOCUSABLE_PRESSABLE: WidgetProtocol = Object.freeze({
  requiresId: false,
  focusable: true,
  pressable: true,
  disableable: true,
  openGated: false,
  requiresRoutingRebuild: true,
});

const INTERACTIVE_FOCUSABLE: WidgetProtocol = Object.freeze({
  requiresId: true,
  focusable: true,
  pressable: false,
  disableable: false,
  openGated: false,
  requiresRoutingRebuild: true,
});

const INTERACTIVE_NON_FOCUSABLE: WidgetProtocol = Object.freeze({
  requiresId: true,
  focusable: false,
  pressable: false,
  disableable: false,
  openGated: false,
  requiresRoutingRebuild: true,
});

const OPEN_GATED_FOCUSABLE: WidgetProtocol = Object.freeze({
  requiresId: true,
  focusable: true,
  pressable: false,
  disableable: false,
  openGated: true,
  requiresRoutingRebuild: true,
});

const DISPLAY_ONLY: WidgetProtocol = Object.freeze({
  requiresId: false,
  focusable: false,
  pressable: false,
  disableable: false,
  openGated: false,
  requiresRoutingRebuild: false,
});

const CONTAINER: WidgetProtocol = Object.freeze({
  requiresId: false,
  focusable: false,
  pressable: false,
  disableable: false,
  openGated: false,
  requiresRoutingRebuild: false,
});

/**
 * Canonical widget protocol registry.
 *
 * To add a new widget kind: add its entry here, and all subsystems
 * (commit, widgetMeta, hitTest, router) will automatically pick it up.
 */
export const WIDGET_PROTOCOL: Readonly<Partial<Record<string, WidgetProtocol>>> = Object.freeze({
  // --- Interactive + focusable + pressable + disableable ---
  button: INTERACTIVE_FOCUSABLE_PRESSABLE,
  link: INTERACTIVE_OPTIONAL_ID_FOCUSABLE_PRESSABLE,

  // --- Interactive + focusable + disableable (form widgets) ---
  input: { ...INTERACTIVE_FOCUSABLE, disableable: true, requiresRoutingRebuild: false },
  slider: { ...INTERACTIVE_FOCUSABLE, disableable: true },
  select: { ...INTERACTIVE_FOCUSABLE, disableable: true },
  checkbox: { ...INTERACTIVE_FOCUSABLE, disableable: true },
  radioGroup: { ...INTERACTIVE_FOCUSABLE, disableable: true },

  // --- Interactive + focusable (data widgets) ---
  virtualList: INTERACTIVE_FOCUSABLE,
  table: INTERACTIVE_FOCUSABLE,
  tree: INTERACTIVE_FOCUSABLE,
  codeEditor: INTERACTIVE_FOCUSABLE,
  diffViewer: INTERACTIVE_FOCUSABLE,
  logsConsole: INTERACTIVE_FOCUSABLE,
  filePicker: INTERACTIVE_FOCUSABLE,
  fileTreeExplorer: INTERACTIVE_FOCUSABLE,

  // --- Interactive + focusable + open-gated ---
  commandPalette: OPEN_GATED_FOCUSABLE,
  toolApprovalDialog: OPEN_GATED_FOCUSABLE,

  // --- Interactive but NOT directly focusable (structural/overlay) ---
  tabs: INTERACTIVE_NON_FOCUSABLE,
  accordion: INTERACTIVE_NON_FOCUSABLE,
  pagination: INTERACTIVE_NON_FOCUSABLE,
  modal: INTERACTIVE_NON_FOCUSABLE,
  layer: INTERACTIVE_NON_FOCUSABLE,
  dropdown: INTERACTIVE_NON_FOCUSABLE,
  splitPane: INTERACTIVE_NON_FOCUSABLE,
  panelGroup: INTERACTIVE_NON_FOCUSABLE,
  toastContainer: { ...CONTAINER, requiresRoutingRebuild: true },

  // --- Display-only (no id required, not focusable) ---
  text: DISPLAY_ONLY,
  richText: DISPLAY_ONLY,
  kbd: DISPLAY_ONLY,
  badge: DISPLAY_ONLY,
  status: DISPLAY_ONLY,
  tag: DISPLAY_ONLY,
  gauge: DISPLAY_ONLY,
  empty: DISPLAY_ONLY,
  errorDisplay: DISPLAY_ONLY,
  errorBoundary: DISPLAY_ONLY,
  callout: DISPLAY_ONLY,
  sparkline: DISPLAY_ONLY,
  barChart: DISPLAY_ONLY,
  miniChart: DISPLAY_ONLY,
  canvas: DISPLAY_ONLY,
  image: DISPLAY_ONLY,
  lineChart: DISPLAY_ONLY,
  scatter: DISPLAY_ONLY,
  heatmap: DISPLAY_ONLY,
  focusAnnouncer: DISPLAY_ONLY,
  icon: DISPLAY_ONLY,
  spinner: DISPLAY_ONLY,
  progress: DISPLAY_ONLY,
  skeleton: DISPLAY_ONLY,
  divider: DISPLAY_ONLY,
  spacer: DISPLAY_ONLY,

  // --- Containers ---
  box: CONTAINER,
  row: CONTAINER,
  column: CONTAINER,
  grid: CONTAINER,
  layers: CONTAINER,
  field: CONTAINER,
  focusZone: CONTAINER,
  focusTrap: CONTAINER,
  breadcrumb: CONTAINER,
  resizablePanel: CONTAINER,
  textarea: CONTAINER,
});

/** Get the protocol for a widget kind. Returns DISPLAY_ONLY for unknown kinds. */
export function getWidgetProtocol(kind: string): WidgetProtocol {
  return WIDGET_PROTOCOL[kind] ?? DISPLAY_ONLY;
}

/** Check if a widget kind requires a unique interactive id. */
export function kindRequiresId(kind: string): boolean {
  return getWidgetProtocol(kind).requiresId;
}

/** Check if a widget kind is focusable by default. */
export function kindIsFocusable(kind: string): boolean {
  return getWidgetProtocol(kind).focusable;
}

/** Check if a widget kind can produce press actions. */
export function kindIsPressable(kind: string): boolean {
  return getWidgetProtocol(kind).pressable;
}

/** Check if a widget kind supports the disabled prop for focus suppression. */
export function kindIsDisableable(kind: string): boolean {
  return getWidgetProtocol(kind).disableable;
}

/** Check if a widget kind requires `open: true` to be focusable. */
export function kindIsOpenGated(kind: string): boolean {
  return getWidgetProtocol(kind).openGated;
}

import type {
  RuntimeBreadcrumbAction,
  RuntimeBreadcrumbConsumptionPath,
  RuntimeBreadcrumbEventKind,
  RuntimeBreadcrumbSnapshot,
  WidgetRuntimeBreadcrumbSnapshot,
} from "../runtimeBreadcrumbs.js";
import {
  isRuntimeBreadcrumbEventKind,
  mergeRuntimeBreadcrumbSnapshot,
  toRuntimeBreadcrumbAction,
} from "../runtimeBreadcrumbs.js";
import type { AppLayoutSnapshot, AppRenderMetrics } from "../types.js";
import type { WidgetRoutingOutcome } from "../widgetRenderer.js";

export type InternalRuntimeBreadcrumbHooks = Readonly<{
  onRender?: ((metrics: AppRenderMetrics) => void) | undefined;
  onLayout?: ((snapshot: AppLayoutSnapshot) => void) | undefined;
}>;

type CreateRuntimeBreadcrumbHelpersOptions = Readonly<{
  getBaseInternalOnLayout: () => ((snapshot: AppLayoutSnapshot) => void) | undefined;
  getBaseInternalOnRender: () => ((metrics: AppRenderMetrics) => void) | undefined;
  getInspectorInternalOnLayout: () => ((snapshot: AppLayoutSnapshot) => void) | undefined;
  getInspectorInternalOnRender: () => ((metrics: AppRenderMetrics) => void) | undefined;
  getLastAction: () => RuntimeBreadcrumbAction | null;
  getLastConsumptionPath: () => RuntimeBreadcrumbConsumptionPath | null;
  getLastEventKind: () => RuntimeBreadcrumbEventKind | null;
  getWidgetRuntimeBreadcrumbSnapshot: () => WidgetRuntimeBreadcrumbSnapshot | null;
  isEnabled: () => boolean;
  isEventTracked: () => boolean;
  setEnabled: (enabled: boolean) => void;
  setEventTracked: (tracked: boolean) => void;
  setInspectorInternalOnLayout: (
    callback: ((snapshot: AppLayoutSnapshot) => void) | undefined,
  ) => void;
  setInspectorInternalOnRender: (
    callback: ((metrics: AppRenderMetrics) => void) | undefined,
  ) => void;
  setLastAction: (action: RuntimeBreadcrumbAction | null) => void;
  setLastConsumptionPath: (path: RuntimeBreadcrumbConsumptionPath | null) => void;
  setLastEventKind: (kind: RuntimeBreadcrumbEventKind | null) => void;
  setWidgetRuntimeBreadcrumbCaptureEnabled: (enabled: boolean) => void;
}>;

export type RuntimeBreadcrumbHelpers = Readonly<{
  buildRuntimeBreadcrumbSnapshot: (renderTimeMs: number) => RuntimeBreadcrumbSnapshot | null;
  noteBreadcrumbAction: (action: NonNullable<WidgetRoutingOutcome["action"]>) => void;
  noteBreadcrumbConsumptionPath: (path: RuntimeBreadcrumbConsumptionPath) => void;
  noteBreadcrumbEvent: (kind: string) => void;
  recomputeRuntimeBreadcrumbCollection: () => void;
  setInspectorHooks: (hooks: InternalRuntimeBreadcrumbHooks | null | undefined) => void;
}>;

export function createRuntimeBreadcrumbHelpers(
  options: CreateRuntimeBreadcrumbHelpersOptions,
): RuntimeBreadcrumbHelpers {
  function recomputeRuntimeBreadcrumbCollection(): void {
    const next =
      options.getBaseInternalOnRender() !== undefined ||
      options.getBaseInternalOnLayout() !== undefined ||
      options.getInspectorInternalOnRender() !== undefined ||
      options.getInspectorInternalOnLayout() !== undefined;
    if (next === options.isEnabled()) return;
    options.setEnabled(next);
    options.setWidgetRuntimeBreadcrumbCaptureEnabled(next);
    if (!next) {
      options.setLastEventKind(null);
      options.setLastConsumptionPath(null);
      options.setLastAction(null);
      options.setEventTracked(false);
    }
  }

  function noteBreadcrumbEvent(kind: string): void {
    options.setEventTracked(false);
    if (!options.isEnabled()) return;
    if (!isRuntimeBreadcrumbEventKind(kind)) return;
    options.setLastEventKind(kind);
    options.setLastConsumptionPath(null);
    options.setEventTracked(true);
  }

  function noteBreadcrumbConsumptionPath(path: RuntimeBreadcrumbConsumptionPath): void {
    if (!options.isEnabled()) return;
    if (!options.isEventTracked()) return;
    options.setLastConsumptionPath(path);
  }

  function noteBreadcrumbAction(action: NonNullable<WidgetRoutingOutcome["action"]>): void {
    if (!options.isEnabled()) return;
    if (!options.isEventTracked()) return;
    options.setLastAction(toRuntimeBreadcrumbAction(action));
  }

  function buildRuntimeBreadcrumbSnapshot(renderTimeMs: number): RuntimeBreadcrumbSnapshot | null {
    if (!options.isEnabled()) return null;
    const widgetSnapshot = options.getWidgetRuntimeBreadcrumbSnapshot();
    if (!widgetSnapshot) return null;
    return mergeRuntimeBreadcrumbSnapshot(
      widgetSnapshot,
      options.getLastEventKind(),
      options.getLastConsumptionPath(),
      options.getLastAction(),
      renderTimeMs,
    );
  }

  function setInspectorHooks(hooks: InternalRuntimeBreadcrumbHooks | null | undefined): void {
    options.setInspectorInternalOnRender(
      typeof hooks?.onRender === "function" ? hooks.onRender : undefined,
    );
    options.setInspectorInternalOnLayout(
      typeof hooks?.onLayout === "function" ? hooks.onLayout : undefined,
    );
    recomputeRuntimeBreadcrumbCollection();
  }

  return {
    buildRuntimeBreadcrumbSnapshot,
    noteBreadcrumbAction,
    noteBreadcrumbConsumptionPath,
    noteBreadcrumbEvent,
    recomputeRuntimeBreadcrumbCollection,
    setInspectorHooks,
  };
}

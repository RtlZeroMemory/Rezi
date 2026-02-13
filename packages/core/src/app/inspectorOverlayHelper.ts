/**
 * packages/core/src/app/inspectorOverlayHelper.ts — createApp helper with inspector overlay.
 *
 * Why: Minimizes integration work by wrapping `createApp` with:
 *   - automatic runtime breadcrumb capture
 *   - optional hotkey toggle
 *   - view() auto-wrapping that injects inspectorOverlay into the layer stack
 */

import type { RuntimeBackend } from "../backend.js";
import type { FrameSnapshot } from "../debug/frameInspector.js";
import type {
  App,
  AppConfig,
  AppLayoutSnapshot,
  AppRenderMetrics,
  DrawFn,
  EventHandler,
  ViewFn,
} from "../index.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import type { Theme } from "../theme/theme.js";
import type { ThemeDefinition } from "../theme/tokens.js";
import {
  type InspectorOverlayFrameTiming,
  type InspectorOverlayPosition,
  inspectorOverlay,
} from "../widgets/inspectorOverlay.js";
import { ui } from "../widgets/ui.js";
import {
  APP_INTERNAL_REQUEST_VIEW_LAYOUT_MARKER,
  APP_INTERNAL_SET_RUNTIME_BREADCRUMB_HOOKS_MARKER,
  createApp,
} from "./createApp.js";
import type { RuntimeBreadcrumbSnapshot } from "./runtimeBreadcrumbs.js";

type AppCreateOptions<S> = Readonly<{
  backend: RuntimeBackend;
  initialState: S;
  config?: AppConfig;
  theme?: Theme | ThemeDefinition;
}>;

export type InspectorOverlayHelperOptions = Readonly<{
  enabled?: boolean;
  hotkey?: string | false;
  id?: string;
  title?: string;
  position?: InspectorOverlayPosition;
  width?: number;
  zIndex?: number;
  /**
   * Optional debug controller-like source used to auto-populate frame timing rows.
   */
  debug?: Readonly<{
    frameInspector: Readonly<{
      getSnapshots: (limit?: number) => readonly FrameSnapshot[];
    }>;
  }>;
  /**
   * Optional override for frame timing rows.
   * When omitted, helper will use `debug.frameInspector` if available.
   */
  frameTiming?: () => InspectorOverlayFrameTiming | null | undefined;
}>;

export type CreateAppWithInspectorOverlayOptions<S> = AppCreateOptions<S> &
  Readonly<{
    inspector?: InspectorOverlayHelperOptions;
  }>;

export type InspectorOverlayController = Readonly<{
  isEnabled: () => boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => boolean;
  getSnapshot: () => RuntimeBreadcrumbSnapshot | null;
}>;

export type AppWithInspectorOverlay<S> = App<S> &
  Readonly<{
    inspectorOverlay: InspectorOverlayController;
  }>;

type RenderMetricsWithBreadcrumbs = AppRenderMetrics &
  Readonly<{
    runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot;
  }>;

type LayoutSnapshotWithBreadcrumbs = AppLayoutSnapshot &
  Readonly<{
    runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot;
  }>;

type InspectorRuntimeBreadcrumbHooks = Readonly<{
  onRender?: ((metrics: AppRenderMetrics) => void) | undefined;
  onLayout?: ((snapshot: AppLayoutSnapshot) => void) | undefined;
}>;

type AppWithInternalInspectorMarkers<S> = App<S> &
  Partial<Readonly<Record<typeof APP_INTERNAL_REQUEST_VIEW_LAYOUT_MARKER, () => void>>> &
  Partial<
    Readonly<
      Record<
        typeof APP_INTERNAL_SET_RUNTIME_BREADCRUMB_HOOKS_MARKER,
        (hooks: InspectorRuntimeBreadcrumbHooks | null | undefined) => void
      >
    >
  >;

const DEFAULT_HOTKEY = "ctrl+shift+i";

/**
 * Create an App wrapper that auto-injects the inspector overlay and a hotkey toggle.
 *
 * Notes:
 * - Overlay state is internal and does not require user state fields.
 * - Existing `config.internal_onRender/internal_onLayout` callbacks are preserved.
 * - Hotkey binding is registered with low priority so user bindings can override it.
 */
export function createAppWithInspectorOverlay<S>(
  opts: CreateAppWithInspectorOverlayOptions<S>,
): AppWithInspectorOverlay<S> {
  const inspectorOpts = opts.inspector ?? {};

  let latestSnapshot: RuntimeBreadcrumbSnapshot | null = null;
  let overlayEnabled = inspectorOpts.enabled === true;
  let lastThemeInput: Theme | ThemeDefinition = opts.theme ?? defaultTheme;

  const app = createApp({
    backend: opts.backend,
    initialState: opts.initialState,
    ...(opts.config === undefined ? {} : { config: opts.config }),
    ...(opts.theme === undefined ? {} : { theme: opts.theme }),
  });
  const appWithInternalMarkers = app as AppWithInternalInspectorMarkers<S>;

  const hotkey = inspectorOpts.hotkey === undefined ? DEFAULT_HOTKEY : inspectorOpts.hotkey;
  const hotkeyHint = typeof hotkey === "string" && hotkey.length > 0 ? hotkey : null;

  const resolveFrameTiming = (): InspectorOverlayFrameTiming | null => {
    const overridden = inspectorOpts.frameTiming?.();
    if (overridden) return overridden;

    const snapshot = inspectorOpts.debug?.frameInspector.getSnapshots(1)[0];
    if (!snapshot) return null;

    return {
      damageRects: snapshot.damageRects,
      damageCells: snapshot.dirtyCells,
      drawlistBytes: snapshot.drawlistBytes,
      diffBytesEmitted: snapshot.diffBytesEmitted,
      usDrawlist: snapshot.usDrawlist,
      usDiff: snapshot.usDiff,
      usWrite: snapshot.usWrite,
    };
  };

  const captureHooks: InspectorRuntimeBreadcrumbHooks = Object.freeze({
    onRender: (metrics: AppRenderMetrics) => {
      const snapshot = (metrics as RenderMetricsWithBreadcrumbs).runtimeBreadcrumbs;
      if (snapshot) latestSnapshot = snapshot;
    },
    onLayout: (snapshot: AppLayoutSnapshot) => {
      const breadcrumbs = (snapshot as LayoutSnapshotWithBreadcrumbs).runtimeBreadcrumbs;
      if (breadcrumbs) latestSnapshot = breadcrumbs;
    },
  });

  const syncRuntimeCapture = (): void => {
    const setHooks = appWithInternalMarkers[APP_INTERNAL_SET_RUNTIME_BREADCRUMB_HOOKS_MARKER];
    if (typeof setHooks !== "function") return;
    setHooks(overlayEnabled ? captureHooks : null);
  };
  syncRuntimeCapture();

  const requestInspectorRefresh = (): void => {
    const internalRefresh = appWithInternalMarkers[APP_INTERNAL_REQUEST_VIEW_LAYOUT_MARKER];
    if (typeof internalRefresh === "function") {
      internalRefresh();
      return;
    }

    // Fallback for runtimes that don't expose the internal refresh marker.
    app.setTheme(lastThemeInput);
  };

  const controller: InspectorOverlayController = Object.freeze({
    isEnabled: () => overlayEnabled,
    setEnabled: (next: boolean) => {
      const normalized = next === true;
      if (overlayEnabled === normalized) return;
      overlayEnabled = normalized;
      syncRuntimeCapture();
      requestInspectorRefresh();
    },
    toggle: () => {
      overlayEnabled = !overlayEnabled;
      syncRuntimeCapture();
      requestInspectorRefresh();
      return overlayEnabled;
    },
    getSnapshot: () => latestSnapshot,
  });

  if (hotkeyHint) {
    app.keys({
      [hotkeyHint]: {
        priority: -1000,
        handler: () => {
          controller.toggle();
        },
      },
    });
  }

  const wrapView = (viewFn: ViewFn<S>): ViewFn<S> => {
    return (state) => {
      const root = viewFn(state);
      if (!overlayEnabled) return root;
      const frameTiming = resolveFrameTiming();
      return ui.layers([
        root,
        inspectorOverlay(
          Object.freeze({
            snapshot: latestSnapshot,
            frameTiming,
            ...(inspectorOpts.id === undefined ? {} : { id: inspectorOpts.id }),
            ...(inspectorOpts.title === undefined ? {} : { title: inspectorOpts.title }),
            ...(inspectorOpts.position === undefined ? {} : { position: inspectorOpts.position }),
            ...(inspectorOpts.width === undefined ? {} : { width: inspectorOpts.width }),
            ...(inspectorOpts.zIndex === undefined ? {} : { zIndex: inspectorOpts.zIndex }),
            ...(hotkeyHint === null ? {} : { hotkeyHint }),
          }),
        ),
      ]);
    };
  };

  const wrapped: AppWithInspectorOverlay<S> = {
    view(fn: ViewFn<S>): void {
      app.view(wrapView(fn));
    },
    draw(fn: DrawFn): void {
      app.draw(fn);
    },
    onEvent(handler: EventHandler): () => void {
      return app.onEvent(handler);
    },
    update(updater: S | ((prev: Readonly<S>) => S)): void {
      app.update(updater);
    },
    setTheme(theme: Theme | ThemeDefinition): void {
      lastThemeInput = theme;
      app.setTheme(theme);
    },
    start(): Promise<void> {
      return app.start();
    },
    stop(): Promise<void> {
      return app.stop();
    },
    dispose(): void {
      app.dispose();
    },
    keys(bindings): void {
      app.keys(bindings);
    },
    modes(modes): void {
      app.modes(modes);
    },
    setMode(modeName: string): void {
      app.setMode(modeName);
    },
    getMode(): string {
      return app.getMode();
    },
    inspectorOverlay: controller,
  };

  return wrapped;
}

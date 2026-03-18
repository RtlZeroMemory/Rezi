import {
  type App,
  type AppConfig,
  type RouteDefinition,
  type ThemeDefinition,
  createApp,
  darkTheme,
  setDefaultTailSourceFactory,
} from "@rezi-ui/core";
import {
  type NodeBackend,
  type NodeBackendConfig,
  createNodeBackendInternal,
} from "./backend/nodeBackend.js";
import { type HotStateReloadController, createHotStateReload } from "./dev/hotStateReload.js";
import {
  type NodeAppHotReloadOptions,
  attachNodeAppHotReloadLifecycle,
  createNodeAppHotReloadController,
} from "./dev/nodeAppHotReload.js";
import { createReproRecorder } from "./repro/index.js";
import { createNodeTailSource } from "./streams/tail.js";

export type { NodeBackendConfig };
export type { NodeBackend };
export type {
  HotStateReloadBaseOptions,
  HotStateReloadController,
  HotStateReloadErrorContext,
  HotStateReloadLogEvent,
  HotStateReloadOptions,
  HotStateReloadRoutesOptions,
  HotStateReloadViewOptions,
} from "./dev/hotStateReload.js";
export type {
  NodeAppHotReloadOptions,
  NodeAppHotReloadRoutesOptions,
  NodeAppHotReloadViewOptions,
} from "./dev/nodeAppHotReload.js";
export type { NodeBackendPerf, NodeBackendPerfSnapshot } from "./backend/nodeBackend.js";
export type {
  CreateReproRecorderOptions,
  ReproRecorder,
  ReproRecorderBackendCapsOverrides,
  ReproRecorderBounds,
  ReproRecorderBuildResult,
} from "./repro/index.js";
export { createHotStateReload };
export { createReproRecorder };
export { loadImage } from "./image.js";
export { createNodeTailSource } from "./streams/tail.js";

setDefaultTailSourceFactory(createNodeTailSource);

export type NodeAppConfig = Readonly<
  AppConfig & Omit<NodeBackendConfig, "fpsCap" | "maxEventBytes">
>;

export type CreateNodeAppOptions<S> = Readonly<{
  initialState: S;
  routes?: readonly RouteDefinition<S>[];
  initialRoute?: string;
  config?: NodeAppConfig;
  theme?: ThemeDefinition;
  /**
   * Development-only hot state-preserving reload wiring.
   *
   * When configured, createNodeApp automatically starts/stops the HSR watcher
   * together with app lifecycle and exposes the controller on `app.hotReload`.
   */
  hotReload?: NodeAppHotReloadOptions<S>;
}>;

export type NodeApp<S> = App<S> &
  Readonly<{
    /** Node/Bun runtime backend instance. */
    backend: NodeBackend;
    /** True when NO_COLOR is present in the process environment. */
    isNoColor: boolean;
    /**
     * Built-in HSR controller when `createNodeApp({ hotReload })` is configured.
     * `null` when hot reload is not configured.
     */
    hotReload: HotStateReloadController | null;
  }>;

type ProcessEnv = Readonly<Record<string, string | undefined>>;

function createNoColorTheme(theme: ThemeDefinition | undefined): ThemeDefinition {
  const base = theme ?? darkTheme;
  const mono = base.colors.fg.primary;
  return Object.freeze({
    ...base,
    colors: Object.freeze({
      ...base.colors,
      accent: Object.freeze({
        primary: mono,
        secondary: mono,
        tertiary: mono,
      }),
      success: mono,
      warning: mono,
      error: mono,
      info: mono,
      focus: Object.freeze({
        ring: mono,
        bg: base.colors.bg.base,
      }),
      selected: Object.freeze({
        bg: base.colors.bg.base,
        fg: mono,
      }),
      disabled: Object.freeze({
        fg: mono,
        bg: base.colors.bg.base,
      }),
      diagnostic: Object.freeze({
        error: mono,
        warning: mono,
        info: mono,
        hint: mono,
      }),
      border: Object.freeze({
        subtle: mono,
        default: mono,
        strong: mono,
      }),
    }),
    widget: Object.freeze({
      syntax: Object.freeze({
        keyword: mono,
        type: mono,
        string: mono,
        number: mono,
        comment: mono,
        operator: mono,
        punctuation: mono,
        function: mono,
        variable: mono,
        cursorFg: base.colors.bg.base,
        cursorBg: mono,
      }),
      diff: Object.freeze({
        addBg: base.colors.bg.base,
        deleteBg: base.colors.bg.base,
        addFg: mono,
        deleteFg: mono,
        hunkHeader: mono,
        lineNumber: mono,
        border: mono,
      }),
      logs: Object.freeze({
        trace: mono,
        debug: mono,
        info: mono,
        warn: mono,
        error: mono,
      }),
      toast: Object.freeze({
        info: mono,
        success: mono,
        warning: mono,
        error: mono,
      }),
      chart: Object.freeze({
        primary: mono,
        accent: mono,
        muted: mono,
        success: mono,
        warning: mono,
        danger: mono,
      }),
    }),
  });
}

function readProcessEnv(): ProcessEnv | null {
  const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  if (!processRef || typeof processRef !== "object") return null;
  const env = processRef.env;
  if (!env || typeof env !== "object") return null;
  return env;
}

function hasNoColorEnv(env: ProcessEnv | null): boolean {
  if (!env) return false;
  return Object.prototype.hasOwnProperty.call(env, "NO_COLOR");
}

function toAppConfig(config: NodeAppConfig | undefined): AppConfig | undefined {
  if (config === undefined) return undefined;
  return {
    ...(config.fpsCap !== undefined ? { fpsCap: config.fpsCap } : {}),
    ...(config.maxEventBytes !== undefined ? { maxEventBytes: config.maxEventBytes } : {}),
    ...(config.maxDrawlistBytes !== undefined ? { maxDrawlistBytes: config.maxDrawlistBytes } : {}),
    ...(config.drawlistValidateParams !== undefined
      ? { drawlistValidateParams: config.drawlistValidateParams }
      : {}),
    ...(config.drawlistReuseOutputBuffer !== undefined
      ? { drawlistReuseOutputBuffer: config.drawlistReuseOutputBuffer }
      : {}),
    ...(config.drawlistEncodedStringCacheCap !== undefined
      ? { drawlistEncodedStringCacheCap: config.drawlistEncodedStringCacheCap }
      : {}),
    ...(config.maxFramesInFlight !== undefined
      ? { maxFramesInFlight: config.maxFramesInFlight }
      : {}),
    ...(config.internal_onRender !== undefined
      ? { internal_onRender: config.internal_onRender }
      : {}),
    ...(config.internal_onLayout !== undefined
      ? { internal_onLayout: config.internal_onLayout }
      : {}),
  };
}

function toBackendConfig(config: NodeAppConfig | undefined): NodeBackendConfig {
  if (config === undefined) return {};
  return {
    ...(config.executionMode !== undefined ? { executionMode: config.executionMode } : {}),
    ...(config.fpsCap !== undefined ? { fpsCap: config.fpsCap } : {}),
    ...(config.maxEventBytes !== undefined ? { maxEventBytes: config.maxEventBytes } : {}),
    ...(config.frameTransport !== undefined ? { frameTransport: config.frameTransport } : {}),
    ...(config.frameSabSlotCount !== undefined
      ? { frameSabSlotCount: config.frameSabSlotCount }
      : {}),
    ...(config.frameSabSlotBytes !== undefined
      ? { frameSabSlotBytes: config.frameSabSlotBytes }
      : {}),
    ...(config.nativeConfig !== undefined ? { nativeConfig: config.nativeConfig } : {}),
  };
}

export function createNodeApp<S>(opts: CreateNodeAppOptions<S>): NodeApp<S> {
  const appConfig = toAppConfig(opts.config);
  const backend = createNodeBackend(toBackendConfig(opts.config));
  const isNoColor = hasNoColorEnv(readProcessEnv());
  const theme = isNoColor ? createNoColorTheme(opts.theme) : opts.theme;

  const app = createApp({
    backend,
    initialState: opts.initialState,
    ...(opts.routes !== undefined ? { routes: opts.routes } : {}),
    ...(opts.initialRoute !== undefined ? { initialRoute: opts.initialRoute } : {}),
    ...(appConfig !== undefined ? { config: appConfig } : {}),
    ...(theme !== undefined ? { theme } : {}),
  });
  const hotReload =
    opts.hotReload === undefined ? null : createNodeAppHotReloadController(app, opts.hotReload);
  if (hotReload) {
    attachNodeAppHotReloadLifecycle(app, hotReload);
  }

  Object.defineProperty(app, "hotReload", {
    value: hotReload,
    enumerable: true,
    configurable: false,
    writable: false,
  });

  Object.defineProperty(app, "backend", {
    value: backend,
    enumerable: true,
    configurable: false,
    writable: false,
  });

  return Object.defineProperty(app, "isNoColor", {
    value: isNoColor,
    enumerable: true,
    configurable: false,
    writable: false,
  }) as NodeApp<S>;
}

/**
 * Low-level Node/Bun backend constructor.
 *
 * Prefer `createNodeApp()` for standard app construction so core/backend config
 * stays aligned automatically.
 */
export function createNodeBackend(config: NodeBackendConfig = {}): NodeBackend {
  return createNodeBackendInternal({ config });
}

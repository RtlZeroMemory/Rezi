import {
  type App,
  type AppConfig,
  type RouteDefinition,
  type Theme,
  type ThemeDefinition,
  createApp,
  defaultTheme,
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
  theme?: Theme | ThemeDefinition;
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

type ThemeSpacingTokensLike = Readonly<{
  xs?: unknown;
  sm?: unknown;
  md?: unknown;
  lg?: unknown;
  xl?: unknown;
  "2xl"?: unknown;
}>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRgb(value: unknown): value is Readonly<{ r: number; g: number; b: number }> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { r?: unknown; g?: unknown; b?: unknown };
  return isFiniteNumber(candidate.r) && isFiniteNumber(candidate.g) && isFiniteNumber(candidate.b);
}

function isSpacingToken(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function readLegacyThemeColors(theme: Theme | ThemeDefinition | undefined): Theme["colors"] | null {
  if (!theme || typeof theme !== "object") return null;
  const colors = (theme as { colors?: unknown }).colors;
  if (!colors || typeof colors !== "object") return null;
  const candidate = colors as { fg?: unknown; bg?: unknown } & Record<string, unknown>;
  if (!isRgb(candidate.fg) || !isRgb(candidate.bg)) return null;
  return candidate as Theme["colors"];
}

function readThemeSpacing(theme: Theme | ThemeDefinition | undefined): Theme["spacing"] {
  if (!theme || typeof theme !== "object") return defaultTheme.spacing;
  const spacing = (theme as { spacing?: unknown }).spacing;
  if (Array.isArray(spacing)) {
    for (const value of spacing) {
      if (!isFiniteNumber(value)) return defaultTheme.spacing;
    }
    return Object.freeze([...spacing]);
  }
  if (spacing && typeof spacing === "object") {
    const tokens = spacing as ThemeSpacingTokensLike;
    const xs = tokens.xs;
    const sm = tokens.sm;
    const md = tokens.md;
    const lg = tokens.lg;
    const xl = tokens.xl;
    const x2xl = tokens["2xl"];
    if (
      isSpacingToken(xs) &&
      isSpacingToken(sm) &&
      isSpacingToken(md) &&
      isSpacingToken(lg) &&
      isSpacingToken(xl) &&
      isSpacingToken(x2xl)
    ) {
      return Object.freeze([0, xs, sm, md, lg, xl, x2xl]);
    }
  }
  return defaultTheme.spacing;
}

function createNoColorTheme(theme: Theme | ThemeDefinition | undefined): Theme {
  const baseColors = readLegacyThemeColors(theme) ?? defaultTheme.colors;
  const spacing = readThemeSpacing(theme);
  const mono = baseColors.fg;
  return Object.freeze({
    colors: Object.freeze({
      ...baseColors,
      primary: mono,
      secondary: mono,
      success: mono,
      danger: mono,
      warning: mono,
      info: mono,
      muted: mono,
      border: mono,
      "diagnostic.error": mono,
      "diagnostic.warning": mono,
      "diagnostic.info": mono,
      "diagnostic.hint": mono,
    }),
    spacing,
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
    ...(config.drawlistVersion !== undefined ? { drawlistVersion: config.drawlistVersion } : {}),
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

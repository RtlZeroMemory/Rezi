import {
  type App,
  type AppConfig,
  defaultTheme,
  type Theme,
  type ThemeDefinition,
  createApp,
} from "@rezi-ui/core";
import {
  type NodeBackend,
  type NodeBackendConfig,
  createNodeBackendInternal,
} from "./backend/nodeBackend.js";
import { createReproRecorder } from "./repro/index.js";

export type { NodeBackendConfig };
export type { NodeBackend };
export type {
  CreateReproRecorderOptions,
  ReproRecorder,
  ReproRecorderBackendCapsOverrides,
  ReproRecorderBounds,
  ReproRecorderBuildResult,
} from "./repro/index.js";
export { createReproRecorder };
export { loadImage } from "./image.js";

export type NodeAppConfig = Readonly<
  AppConfig & Omit<NodeBackendConfig, "fpsCap" | "maxEventBytes" | "useDrawlistV2">
>;

export type CreateNodeAppOptions<S> = Readonly<{
  initialState: S;
  config?: NodeAppConfig;
  theme?: Theme | ThemeDefinition;
}>;

export type NodeApp<S> = App<S> &
  Readonly<{
    /** True when NO_COLOR is present in the process environment. */
    isNoColor: boolean;
  }>;

type ProcessEnv = Readonly<Record<string, string | undefined>>;

const NO_COLOR_THEME: Theme = Object.freeze({
  colors: Object.freeze({
    ...defaultTheme.colors,
    primary: defaultTheme.colors.fg,
    secondary: defaultTheme.colors.fg,
    success: defaultTheme.colors.fg,
    danger: defaultTheme.colors.fg,
    warning: defaultTheme.colors.fg,
    info: defaultTheme.colors.fg,
    muted: defaultTheme.colors.fg,
    border: defaultTheme.colors.fg,
    "diagnostic.error": defaultTheme.colors.fg,
    "diagnostic.warning": defaultTheme.colors.fg,
    "diagnostic.info": defaultTheme.colors.fg,
    "diagnostic.hint": defaultTheme.colors.fg,
  }),
  spacing: defaultTheme.spacing,
});

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
    ...(config.useV2Cursor !== undefined ? { useV2Cursor: config.useV2Cursor } : {}),
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
  const theme = isNoColor ? NO_COLOR_THEME : opts.theme;

  const app = createApp({
    backend,
    initialState: opts.initialState,
    ...(appConfig !== undefined ? { config: appConfig } : {}),
    ...(theme !== undefined ? { theme } : {}),
  });
  return Object.defineProperty(app, "isNoColor", {
    value: isNoColor,
    enumerable: true,
    configurable: false,
    writable: false,
  }) as NodeApp<S>;
}

/**
 * @deprecated Prefer createNodeApp() for normal Node/Bun apps.
 * createNodeBackend() remains available for advanced runtime composition.
 */
export function createNodeBackend(config: NodeBackendConfig = {}): NodeBackend {
  return createNodeBackendInternal({ config });
}

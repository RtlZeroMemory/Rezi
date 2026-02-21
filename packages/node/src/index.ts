import {
  darkTheme,
  dimmedTheme,
  draculaTheme,
  type App,
  type AppConfig,
  type Theme,
  type ThemeDefinition,
  createApp,
  highContrastTheme,
  lightTheme,
  nordTheme,
  ui,
} from "@rezi-ui/core";
export {
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
  ui,
} from "@rezi-ui/core";
export type { TextStyle, VNode } from "@rezi-ui/core";
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

let didWarnLegacyCreateNodeBackend = false;

function warnLegacyCreateNodeBackend(): void {
  if (didWarnLegacyCreateNodeBackend) return;
  if (process.env["NODE_ENV"] === "production") return;
  didWarnLegacyCreateNodeBackend = true;
  console.warn(
    "[rezi] createNodeBackend() is deprecated for standard app setup. Prefer createNodeApp().",
  );
}

function toAppConfig(config: NodeAppConfig | undefined): AppConfig | undefined {
  if (config === undefined) return undefined;
  return {
    ...(config.fpsCap !== undefined ? { fpsCap: config.fpsCap } : {}),
    ...(config.maxEventBytes !== undefined ? { maxEventBytes: config.maxEventBytes } : {}),
    ...(config.maxDrawlistBytes !== undefined ? { maxDrawlistBytes: config.maxDrawlistBytes } : {}),
    ...(config.rootPadding !== undefined ? { rootPadding: config.rootPadding } : {}),
    ...(config.breakpoints !== undefined ? { breakpoints: config.breakpoints } : {}),
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
    ...(config.emojiWidthPolicy !== undefined
      ? { emojiWidthPolicy: config.emojiWidthPolicy }
      : {}),
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

export function createNodeApp<S>(opts: CreateNodeAppOptions<S>): App<S> {
  const appConfig = toAppConfig(opts.config);
  const resolvedAppConfig: AppConfig = {
    rootPadding: 1,
    ...(appConfig ?? {}),
  };
  const backend = createNodeBackendInternal({ config: toBackendConfig(opts.config) });

  return createApp({
    backend,
    initialState: opts.initialState,
    config: resolvedAppConfig,
    theme: opts.theme ?? darkTheme,
  });
}

/**
 * @deprecated Prefer createNodeApp() for normal Node/Bun apps.
 * createNodeBackend() remains available for advanced runtime composition.
 */
export function createNodeBackend(config: NodeBackendConfig = {}): NodeBackend {
  warnLegacyCreateNodeBackend();
  return createNodeBackendInternal({ config });
}

export const rezi: Readonly<{
  ui: typeof ui;
  createNodeApp: typeof createNodeApp;
  createNodeBackend: typeof createNodeBackend;
  createReproRecorder: typeof createReproRecorder;
  themes: Readonly<{
    dark: typeof darkTheme;
    light: typeof lightTheme;
    dimmed: typeof dimmedTheme;
    highContrast: typeof highContrastTheme;
    nord: typeof nordTheme;
    dracula: typeof draculaTheme;
  }>;
}> = Object.freeze({
  ui,
  createNodeApp,
  createNodeBackend,
  createReproRecorder,
  themes: Object.freeze({
    dark: darkTheme,
    light: lightTheme,
    dimmed: dimmedTheme,
    highContrast: highContrastTheme,
    nord: nordTheme,
    dracula: draculaTheme,
  }),
});

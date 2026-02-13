import {
  type App,
  type AppConfig,
  type Theme,
  type ThemeDefinition,
  createApp,
} from "@rezi-ui/core";
import {
  type NodeBackend,
  type NodeBackendConfig,
  createNodeBackendInternal,
} from "./backend/nodeBackend.js";

export type { NodeBackendConfig };
export type { NodeBackend };

export type NodeAppConfig = Readonly<
  AppConfig & Omit<NodeBackendConfig, "fpsCap" | "maxEventBytes" | "useDrawlistV2">
>;

export type CreateNodeAppOptions<S> = Readonly<{
  initialState: S;
  config?: NodeAppConfig;
  theme?: Theme | ThemeDefinition;
}>;

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
    ...(config.useV2Cursor === true ? { useDrawlistV2: true } : {}),
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
  const backend = createNodeBackend(toBackendConfig(opts.config));

  return createApp({
    backend,
    initialState: opts.initialState,
    ...(appConfig !== undefined ? { config: appConfig } : {}),
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
  });
}

/**
 * @deprecated Prefer createNodeApp() for normal Node/Bun apps.
 * createNodeBackend() remains available for advanced runtime composition.
 */
export function createNodeBackend(config: NodeBackendConfig = {}): NodeBackend {
  return createNodeBackendInternal({ config });
}

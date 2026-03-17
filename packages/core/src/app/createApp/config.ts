import { ZrUiError } from "../../abi.js";
import {
  BACKEND_DRAWLIST_VERSION_MARKER,
  type BACKEND_FPS_CAP_MARKER,
  type BACKEND_MAX_EVENT_BYTES_MARKER,
  type RuntimeBackend,
} from "../../backend.js";
import {
  type ResponsiveBreakpointThresholds,
  normalizeBreakpointThresholds,
} from "../../layout/responsive.js";
import {
  DEFAULT_TERMINAL_PROFILE,
  type TerminalProfile,
  terminalProfileFromCaps,
} from "../../terminalProfile.js";
import type { AppConfig, AppLayoutSnapshot, AppRenderMetrics } from "../types.js";

export type ResolvedAppConfig = Readonly<{
  fpsCap: number;
  maxEventBytes: number;
  maxDrawlistBytes: number;
  rootPadding: number;
  breakpointThresholds: ResponsiveBreakpointThresholds;
  drawlistValidateParams: boolean;
  drawlistReuseOutputBuffer: boolean;
  drawlistEncodedStringCacheCap: number;
  maxFramesInFlight: number;
  themeTransitionFrames: number;
  internal_onRender?: ((metrics: AppRenderMetrics) => void) | undefined;
  internal_onLayout?: ((snapshot: AppLayoutSnapshot) => void) | undefined;
}>;

const DEFAULT_CONFIG: ResolvedAppConfig = Object.freeze({
  fpsCap: 60,
  maxEventBytes: 1 << 20 /* 1 MiB */,
  maxDrawlistBytes: 2 << 20 /* 2 MiB */,
  rootPadding: 0,
  breakpointThresholds: normalizeBreakpointThresholds(undefined),
  drawlistValidateParams: true,
  drawlistReuseOutputBuffer: true,
  drawlistEncodedStringCacheCap: 131072,
  maxFramesInFlight: 1,
  themeTransitionFrames: 0,
  internal_onRender: undefined,
  internal_onLayout: undefined,
});

const MAX_SAFE_FPS_CAP = 1000;
const MAX_SAFE_EVENT_BYTES = 4 << 20; /* 4 MiB */

function invalidProps(detail: string): never {
  throw new ZrUiError("ZRUI_INVALID_PROPS", detail);
}

export function requirePositiveInt(name: string, v: number): number {
  if (!Number.isInteger(v) || v <= 0) invalidProps(`${name} must be a positive integer`);
  return v;
}

function requirePositiveIntAtMost(name: string, v: number, max: number): number {
  const parsed = requirePositiveInt(name, v);
  if (parsed > max) invalidProps(`${name} must be <= ${String(max)}`);
  return parsed;
}

function requireNonNegativeInt(name: string, v: number): number {
  if (!Number.isInteger(v) || v < 0) invalidProps(`${name} must be a non-negative integer`);
  return v;
}

export function resolveAppConfig(config: AppConfig | undefined): ResolvedAppConfig {
  if (!config) return DEFAULT_CONFIG;
  const fpsCap =
    config.fpsCap === undefined
      ? DEFAULT_CONFIG.fpsCap
      : requirePositiveIntAtMost("fpsCap", config.fpsCap, MAX_SAFE_FPS_CAP);
  const maxEventBytes =
    config.maxEventBytes === undefined
      ? DEFAULT_CONFIG.maxEventBytes
      : requirePositiveIntAtMost("maxEventBytes", config.maxEventBytes, MAX_SAFE_EVENT_BYTES);
  const maxDrawlistBytes =
    config.maxDrawlistBytes === undefined
      ? DEFAULT_CONFIG.maxDrawlistBytes
      : requirePositiveInt("maxDrawlistBytes", config.maxDrawlistBytes);
  const rootPadding =
    config.rootPadding === undefined
      ? DEFAULT_CONFIG.rootPadding
      : requireNonNegativeInt("rootPadding", config.rootPadding);
  const breakpointThresholds = normalizeBreakpointThresholds(config.breakpoints);
  const drawlistValidateParams =
    config.drawlistValidateParams === undefined
      ? DEFAULT_CONFIG.drawlistValidateParams
      : config.drawlistValidateParams !== false;
  const drawlistReuseOutputBuffer =
    config.drawlistReuseOutputBuffer === undefined
      ? DEFAULT_CONFIG.drawlistReuseOutputBuffer
      : config.drawlistReuseOutputBuffer === true;
  const drawlistEncodedStringCacheCap =
    config.drawlistEncodedStringCacheCap === undefined
      ? DEFAULT_CONFIG.drawlistEncodedStringCacheCap
      : requireNonNegativeInt(
          "drawlistEncodedStringCacheCap",
          config.drawlistEncodedStringCacheCap,
        );
  const maxFramesInFlight =
    config.maxFramesInFlight === undefined
      ? DEFAULT_CONFIG.maxFramesInFlight
      : Math.min(4, Math.max(1, requirePositiveInt("maxFramesInFlight", config.maxFramesInFlight)));
  const themeTransitionFrames =
    config.themeTransitionFrames === undefined
      ? DEFAULT_CONFIG.themeTransitionFrames
      : requireNonNegativeInt("themeTransitionFrames", config.themeTransitionFrames);
  const internal_onRender =
    typeof config.internal_onRender === "function" ? config.internal_onRender : undefined;
  const internal_onLayout =
    typeof config.internal_onLayout === "function" ? config.internal_onLayout : undefined;

  return Object.freeze({
    fpsCap,
    maxEventBytes,
    maxDrawlistBytes,
    rootPadding,
    breakpointThresholds,
    drawlistValidateParams,
    drawlistReuseOutputBuffer,
    drawlistEncodedStringCacheCap,
    maxFramesInFlight,
    themeTransitionFrames,
    internal_onRender,
    internal_onLayout,
  });
}

export function readBackendPositiveIntMarker(
  backend: RuntimeBackend,
  marker: typeof BACKEND_MAX_EVENT_BYTES_MARKER | typeof BACKEND_FPS_CAP_MARKER,
): number | null {
  const value = (backend as RuntimeBackend & Readonly<Record<string, unknown>>)[marker];
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    invalidProps(`backend marker ${marker} must be a positive integer when present`);
  }
  return value;
}

export function readBackendDrawlistVersionMarker(backend: RuntimeBackend): 1 | null {
  const value = (backend as RuntimeBackend & Readonly<Record<string, unknown>>)[
    BACKEND_DRAWLIST_VERSION_MARKER
  ];
  if (value === undefined) return null;
  if (value !== 1) {
    invalidProps(
      `backend marker ${BACKEND_DRAWLIST_VERSION_MARKER} must be 1 (received ${String(value)})`,
    );
  }
  return 1;
}

export function monotonicNowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = perf?.now;
  if (typeof perfNow === "function") return perfNow.call(perf);
  return Date.now();
}

export async function loadTerminalProfile(backend: RuntimeBackend): Promise<TerminalProfile> {
  try {
    if (typeof backend.getTerminalProfile === "function") {
      return await backend.getTerminalProfile();
    }
  } catch {
    // fall through to caps-derived profile
  }

  try {
    const caps = await backend.getCaps();
    return terminalProfileFromCaps(caps);
  } catch {
    return DEFAULT_TERMINAL_PROFILE;
  }
}

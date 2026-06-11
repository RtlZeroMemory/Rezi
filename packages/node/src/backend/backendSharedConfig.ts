import { ZrUiError } from "@rezi-ui/core";

export const DEFAULT_FPS_CAP = 60 as const;
export const MAX_SAFE_FPS_CAP = 1000 as const;
export const DEFAULT_MAX_EVENT_BYTES = 1 << 20;
export const MAX_SAFE_EVENT_BYTES = 4 << 20;

const EMPTY_NATIVE_CONFIG = Object.freeze({}) as Readonly<Record<string, unknown>>;

const DEFAULT_NATIVE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  // Align native validation caps with JS drawlist builder defaults.
  //
  // Native defaults are intentionally conservative; however, @rezi-ui/core's
  // drawlist builders default to 2 MiB max drawlist bytes and large command
  // budgets. Without overriding, moderately large frames (e.g. images/canvas)
  // can fail with ZR_ERR_LIMIT (-3) at submit time.
  outMaxBytesPerFrame: 2 * 1024 * 1024,
  dlMaxTotalBytes: 2 * 1024 * 1024,
  dlMaxCmds: 100_000,
  dlMaxStrings: 10_000,
  dlMaxBlobs: 10_000,
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function mergeNativeLimits(
  nativeConfig: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  // biome-ignore lint/complexity/useLiteralKeys: bracket access is required by noPropertyAccessFromIndexSignature.
  const limitsValue = nativeConfig["limits"];
  const existingLimits = isPlainObject(limitsValue)
    ? (limitsValue as Record<string, unknown>)
    : null;
  const limits: Record<string, unknown> = { ...(existingLimits ?? {}) };

  const has = (camel: string): boolean => {
    const snake = camel.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    return (
      Object.prototype.hasOwnProperty.call(limits, camel) ||
      Object.prototype.hasOwnProperty.call(limits, snake)
    );
  };

  for (const [camel, value] of Object.entries(DEFAULT_NATIVE_LIMITS)) {
    if (has(camel)) continue;
    limits[camel] = value;
  }

  return Object.freeze({ ...nativeConfig, limits: Object.freeze(limits) });
}

export function normalizeBackendNativeConfig(
  nativeConfig: unknown,
): Readonly<Record<string, unknown>> {
  return isPlainObject(nativeConfig)
    ? mergeNativeLimits(nativeConfig)
    : mergeNativeLimits(EMPTY_NATIVE_CONFIG);
}

/** Maximum inline viewport height accepted by the engine (zr_config.h). */
export const INLINE_ROWS_MAX = 1024 as const;

/** Native wire values for plat.screenMode (zr_platform_types.h). */
export const NATIVE_SCREEN_MODE_ALT = 0 as const;
export const NATIVE_SCREEN_MODE_INLINE = 1 as const;

export type BackendScreenConfig = Readonly<{
  mode?: "alt" | "inline";
  inlineRows?: number;
}>;

/**
 * Fold the high-level `screen` backend option into the native engine config.
 *
 * The explicit `screen` option wins over raw `nativeConfig` passthrough keys
 * (`plat.screenMode` / `inlineRows`) while preserving unrelated plat keys.
 * When `screen` is omitted the native config is returned untouched, so
 * existing alt-screen behavior is byte-for-byte unchanged.
 */
export function mergeScreenIntoNativeConfig(
  nativeConfig: Readonly<Record<string, unknown>>,
  screen: BackendScreenConfig | undefined,
): Readonly<Record<string, unknown>> {
  if (screen === undefined) return nativeConfig;

  const mode = screen.mode ?? "alt";
  if (mode !== "alt" && mode !== "inline") {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `screen.mode must be "alt" or "inline" (got ${JSON.stringify(mode)})`,
    );
  }
  if (mode === "inline") {
    const rows = screen.inlineRows;
    if (typeof rows !== "number" || !Number.isInteger(rows) || rows < 1 || rows > INLINE_ROWS_MAX) {
      throw new ZrUiError(
        "ZRUI_INVALID_PROPS",
        `screen.inlineRows must be an integer in [1, ${String(INLINE_ROWS_MAX)}] when screen.mode is "inline"`,
      );
    }
  } else if (screen.inlineRows !== undefined) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      'screen.inlineRows requires screen.mode "inline"',
    );
  }

  // biome-ignore lint/complexity/useLiteralKeys: bracket access is required by noPropertyAccessFromIndexSignature.
  const platValue = nativeConfig["plat"];
  const basePlat = isPlainObject(platValue) ? platValue : {};
  const screenMode = mode === "inline" ? NATIVE_SCREEN_MODE_INLINE : NATIVE_SCREEN_MODE_ALT;
  return Object.freeze({
    ...nativeConfig,
    plat: Object.freeze({ ...basePlat, screenMode }),
    inlineRows: mode === "inline" ? (screen.inlineRows as number) : 0,
  });
}

export function parsePositiveIntOr(n: unknown, fallback: number): number {
  if (typeof n !== "number") return fallback;
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n <= 0) return fallback;
  return n;
}

export function parsePositiveInt(n: unknown): number | null {
  if (typeof n !== "number") return null;
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n <= 0) return null;
  return n;
}

export function parseBoundedPositiveIntOrThrow(
  name: string,
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const parsed = parsePositiveInt(value);
  if (parsed === null) {
    throw new ZrUiError("ZRUI_INVALID_PROPS", `${name} must be a positive integer`);
  }
  if (parsed > max) {
    throw new ZrUiError("ZRUI_INVALID_PROPS", `${name} must be <= ${String(max)}`);
  }
  return parsed;
}

function readNativeTargetFpsValues(
  cfg: Readonly<Record<string, unknown>>,
): Readonly<{ camel: number | null; snake: number | null }> {
  const targetFpsCfg = cfg as Readonly<{ targetFps?: unknown; target_fps?: unknown }>;
  return {
    camel: parsePositiveInt(targetFpsCfg.targetFps),
    snake: parsePositiveInt(targetFpsCfg.target_fps),
  };
}

export function resolveTargetFps(
  fpsCap: number,
  nativeConfig: Readonly<Record<string, unknown>>,
): number {
  const values = readNativeTargetFpsValues(nativeConfig);
  if (values.camel !== null && values.snake !== null && values.camel !== values.snake) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `createNodeBackend config mismatch: nativeConfig.targetFps=${String(values.camel)} must match nativeConfig.target_fps=${String(values.snake)}.`,
    );
  }
  const nativeTargetFps = values.camel ?? values.snake;
  if (nativeTargetFps !== null && nativeTargetFps !== fpsCap) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `createNodeBackend config mismatch: fpsCap=${String(fpsCap)} must match nativeConfig.targetFps/target_fps=${String(nativeTargetFps)}. Fix: set nativeConfig.targetFps (or target_fps) to ${String(fpsCap)}, or remove the override and use fpsCap only.`,
    );
  }
  return fpsCap;
}

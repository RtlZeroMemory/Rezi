import {
  ZR_DRAWLIST_VERSION_V5,
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
  ZR_EVENT_BATCH_VERSION_V1,
} from "@rezi-ui/core";

const ZR_ERR_INVALID_ARGUMENT = -1;
const ZR_ERR_OOM = -2;
const ZR_ERR_LIMIT = -3;
const ZR_ERR_UNSUPPORTED = -4;
const ZR_ERR_FORMAT = -5;
const ZR_ERR_PLATFORM = -6;

type EngineCreateConfigLike = Readonly<Record<string, unknown>>;

export type EngineCreateProbeFns = Readonly<{
  probe: (config: EngineCreateConfigLike) => number;
  destroy?: (engineId: number) => void;
}>;

function asPositiveInt(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  if (!Number.isInteger(v)) return null;
  if (v < 0) return null;
  return v;
}

function readRequestedPin(config: EngineCreateConfigLike, key: string, fallback: number): number {
  const parsed = asPositiveInt(config[key]);
  return parsed === null ? fallback : parsed;
}

function zrResultCodeName(code: number): string {
  switch (code) {
    case ZR_ERR_INVALID_ARGUMENT:
      return "ZR_ERR_INVALID_ARGUMENT";
    case ZR_ERR_OOM:
      return "ZR_ERR_OOM";
    case ZR_ERR_LIMIT:
      return "ZR_ERR_LIMIT";
    case ZR_ERR_UNSUPPORTED:
      return "ZR_ERR_UNSUPPORTED";
    case ZR_ERR_FORMAT:
      return "ZR_ERR_FORMAT";
    case ZR_ERR_PLATFORM:
      return "ZR_ERR_PLATFORM";
    default:
      return "ZR_ERR_UNKNOWN";
  }
}

function maybeDetectLegacyAbiDrawlistSupport(
  config: EngineCreateConfigLike,
  probeFns: EngineCreateProbeFns | undefined,
): string | null {
  if (probeFns === undefined) return null;

  const requestedAbiMajor = readRequestedPin(
    config,
    "requestedEngineAbiMajor",
    ZR_ENGINE_ABI_MAJOR,
  );
  const requestedAbiMinor = readRequestedPin(
    config,
    "requestedEngineAbiMinor",
    ZR_ENGINE_ABI_MINOR,
  );
  const requestedAbiPatch = readRequestedPin(
    config,
    "requestedEngineAbiPatch",
    ZR_ENGINE_ABI_PATCH,
  );
  const requestedDrawlist = readRequestedPin(
    config,
    "requestedDrawlistVersion",
    ZR_DRAWLIST_VERSION_V5,
  );

  if (
    requestedAbiMajor === 1 &&
    requestedAbiMinor === 1 &&
    requestedAbiPatch === 0 &&
    requestedDrawlist <= 2
  ) {
    return null;
  }

  const legacyProbe: EngineCreateConfigLike = {
    ...config,
    requestedEngineAbiMajor: 1,
    requestedEngineAbiMinor: 1,
    requestedEngineAbiPatch: 0,
    requestedDrawlistVersion: 2,
    requestedEventBatchVersion: 1,
  };

  let probeId = 0;
  try {
    probeId = probeFns.probe(legacyProbe);
  } catch {
    return null;
  }

  if (!Number.isInteger(probeId) || probeId <= 0) {
    return null;
  }

  try {
    probeFns.destroy?.(probeId);
  } catch {
    // best effort cleanup only
  }

  return "Detected native compatibility with legacy pins engine ABI 1.1.0 + drawlist v2.";
}

export function buildEngineCreateFailureDetail(
  code: number,
  config: EngineCreateConfigLike,
  opts: Readonly<{
    nativeModuleHint?: string;
    probeFns?: EngineCreateProbeFns;
  }> = {},
): string {
  const codeName = zrResultCodeName(code);
  const parts = [`engine_create failed: code=${String(code)} (${codeName}).`];

  if (code === ZR_ERR_UNSUPPORTED) {
    const requestedAbiMajor = readRequestedPin(
      config,
      "requestedEngineAbiMajor",
      ZR_ENGINE_ABI_MAJOR,
    );
    const requestedAbiMinor = readRequestedPin(
      config,
      "requestedEngineAbiMinor",
      ZR_ENGINE_ABI_MINOR,
    );
    const requestedAbiPatch = readRequestedPin(
      config,
      "requestedEngineAbiPatch",
      ZR_ENGINE_ABI_PATCH,
    );
    const requestedDrawlist = readRequestedPin(
      config,
      "requestedDrawlistVersion",
      ZR_DRAWLIST_VERSION_V5,
    );
    const requestedEventBatch = readRequestedPin(
      config,
      "requestedEventBatchVersion",
      ZR_EVENT_BATCH_VERSION_V1,
    );

    parts.push(
      `Requested pins: engine ABI ${requestedAbiMajor}.${requestedAbiMinor}.${requestedAbiPatch}, drawlist v${requestedDrawlist}, event batch v${requestedEventBatch}.`,
    );
    parts.push(
      `Current Rezi pins: engine ABI ${ZR_ENGINE_ABI_MAJOR}.${ZR_ENGINE_ABI_MINOR}.${ZR_ENGINE_ABI_PATCH}, drawlist v${ZR_DRAWLIST_VERSION_V5}, event batch v${ZR_EVENT_BATCH_VERSION_V1}.`,
    );

    const legacyHint = maybeDetectLegacyAbiDrawlistSupport(config, opts.probeFns);
    if (legacyHint !== null) {
      parts.push(legacyHint);
    }

    parts.push(
      "Fix: rebuild or reinstall @rezi-ui/native so the loaded binary matches @rezi-ui/core/@rezi-ui/node (for local repo builds: npm -w @rezi-ui/native run build:native).",
    );
  } else if (code === ZR_ERR_PLATFORM) {
    parts.push(
      "Platform backend init failed (typically no TTY or unsupported terminal mode). Run inside an interactive terminal; for non-TTY test mode use ZIREAEL_POSIX_PIPE_MODE=1.",
    );
  }

  if (typeof opts.nativeModuleHint === "string" && opts.nativeModuleHint.length > 0) {
    parts.push(`Native module: ${opts.nativeModuleHint}.`);
  }

  return parts.join(" ");
}

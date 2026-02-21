type EngineState = Readonly<{
  destroyed: boolean;
}>;

let nextEngineId = 1;
const engines = new Map<number, EngineState>();

function parsePositiveInt(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v) || !Number.isInteger(v)) return null;
  if (v <= 0) return null;
  return v;
}

type LimitsConfig = Readonly<{
  limits?: unknown;
}>;

type Limits = Readonly<{
  outMaxBytesPerFrame?: unknown;
  out_max_bytes_per_frame?: unknown;
  dlMaxTotalBytes?: unknown;
  dl_max_total_bytes?: unknown;
  dlMaxCmds?: unknown;
  dl_max_cmds?: unknown;
}>;

function readLimits(cfg: unknown): Limits | null {
  if (typeof cfg !== "object" || cfg === null) return null;
  const rec = cfg as LimitsConfig;
  if (typeof rec.limits !== "object" || rec.limits === null) return null;
  return rec.limits as Limits;
}

function readLimitU32(lim: Limits, camel: keyof Limits, snake: keyof Limits): number | null {
  return parsePositiveInt(lim[camel]) ?? parsePositiveInt(lim[snake]);
}

export const native = {
  engineCreate(config?: object | null): number {
    const lim = readLimits(config);
    if (lim === null) return -1;
    const outMax = readLimitU32(lim, "outMaxBytesPerFrame", "out_max_bytes_per_frame");
    const dlMax = readLimitU32(lim, "dlMaxTotalBytes", "dl_max_total_bytes");
    const cmdMax = readLimitU32(lim, "dlMaxCmds", "dl_max_cmds");
    if (outMax === null || dlMax === null || cmdMax === null) return -1;
    if (outMax < 2 * 1024 * 1024) return -1;
    if (dlMax < 2 * 1024 * 1024) return -1;
    if (cmdMax < 100_000) return -1;

    const id = nextEngineId++;
    engines.set(id, Object.freeze({ destroyed: false }));
    return id;
  },

  engineDestroy(engineId: number): void {
    engines.delete(engineId);
  },

  engineSubmitDrawlist(engineId: number, _drawlist: Uint8Array): number {
    return engines.has(engineId) ? 0 : -1;
  },

  enginePresent(engineId: number): number {
    return engines.has(engineId) ? 0 : -1;
  },

  enginePollEvents(engineId: number, _timeoutMs: number, _out: Uint8Array): number {
    return engines.has(engineId) ? 0 : -1;
  },

  enginePostUserEvent(engineId: number, _tag: number, _payload: Uint8Array): number {
    return engines.has(engineId) ? 0 : -1;
  },

  engineSetConfig(engineId: number, _cfg?: object | null): number {
    return engines.has(engineId) ? 0 : -1;
  },

  engineGetCaps(engineId: number) {
    if (!engines.has(engineId)) {
      return {
        colorMode: 0,
        supportsMouse: false,
        supportsBracketedPaste: false,
        supportsFocusEvents: false,
        supportsOsc52: false,
        supportsSyncUpdate: false,
        supportsScrollRegion: false,
        supportsCursorShape: false,
        supportsOutputWaitWritable: false,
        sgrAttrsSupported: 0,
      };
    }
    return {
      colorMode: 2,
      supportsMouse: true,
      supportsBracketedPaste: true,
      supportsFocusEvents: true,
      supportsOsc52: false,
      supportsSyncUpdate: true,
      supportsScrollRegion: true,
      supportsCursorShape: true,
      supportsOutputWaitWritable: true,
      sgrAttrsSupported: 0xffffffff,
    };
  },
} as const;

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

type TargetFpsConfig = Readonly<{
  targetFps?: unknown;
  target_fps?: unknown;
}>;

function readTargetFps(cfg: unknown): number | null {
  if (typeof cfg !== "object" || cfg === null) return null;
  const rec = cfg as TargetFpsConfig;
  return parsePositiveInt(rec.targetFps) ?? parsePositiveInt(rec.target_fps);
}

export const native = {
  engineCreate(config?: object | null): number {
    const targetFps = readTargetFps(config);
    if (targetFps === null) return -1;
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

type EngineState = Readonly<{
  destroyed: boolean;
}>;

let nextEngineId = 1;
const engines = new Map<number, EngineState>();

type ScreenConfig = Readonly<{
  plat?: unknown;
  inlineRows?: unknown;
  inline_rows?: unknown;
}>;

type PlatConfig = Readonly<{
  screenMode?: unknown;
  screen_mode?: unknown;
}>;

function readU32(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v) || !Number.isInteger(v)) return null;
  if (v < 0) return null;
  return v;
}

function readScreenMode(cfg: unknown): number | null {
  if (typeof cfg !== "object" || cfg === null) return null;
  const rec = cfg as ScreenConfig;
  if (typeof rec.plat !== "object" || rec.plat === null) return null;
  const plat = rec.plat as PlatConfig;
  return readU32(plat.screenMode) ?? readU32(plat.screen_mode);
}

function readInlineRows(cfg: unknown): number | null {
  if (typeof cfg !== "object" || cfg === null) return null;
  const rec = cfg as ScreenConfig;
  return readU32(rec.inlineRows) ?? readU32(rec.inline_rows);
}

export const native = {
  engineCreate(config?: object | null): number {
    // Expect the high-level screen option to arrive as native wire keys:
    // plat.screenMode=1 (inline) and inlineRows=6.
    if (readScreenMode(config) !== 1) return -1;
    if (readInlineRows(config) !== 6) return -1;
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

  engineGetMetrics(engineId: number) {
    return {
      structSize: 0,
      negotiatedEngineAbiMajor: 1,
      negotiatedEngineAbiMinor: 3,
      negotiatedEngineAbiPatch: 0,
      negotiatedDrawlistVersion: 1,
      negotiatedEventBatchVersion: 1,
      frameIndex: 0n,
      fps: 0,
      bytesEmittedTotal: 0n,
      bytesEmittedLastFrame: 0,
      dirtyLinesLastFrame: 0,
      dirtyColsLastFrame: 0,
      usInputLastFrame: 0,
      usDrawlistLastFrame: 0,
      usDiffLastFrame: 0,
      usWriteLastFrame: 0,
      eventsOutLastPoll: 0,
      eventsDroppedTotal: 0,
      arenaFrameHighWaterBytes: 0n,
      arenaPersistentHighWaterBytes: 0n,
      damageRectsLastFrame: 0,
      damageCellsLastFrame: 0,
      damageFullFrame: false,
    };
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
      // Inline mode suppresses absolute-row capabilities in the real engine.
      supportsScrollRegion: false,
      supportsCursorShape: true,
      supportsOutputWaitWritable: true,
      sgrAttrsSupported: 0xffffffff,
    };
  },
} as const;

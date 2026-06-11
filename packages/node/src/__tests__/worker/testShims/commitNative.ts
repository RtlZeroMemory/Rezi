type EngineState = Readonly<{
  destroyed: boolean;
}>;

let nextEngineId = 1;
const engines = new Map<number, EngineState>();

const ZRDL_MAGIC = 0x4c44525a;

/* Rejection trigger: rows value the shim treats as engine backpressure. */
const COMMIT_REJECT_ROWS = 99;

/* The only runtime inlineRows value this strict shim accepts. */
const SET_CONFIG_EXPECT_ROWS = 5;

function readU32le(bytes: Uint8Array, off: number): number {
  if (off + 4 > bytes.byteLength) return -1;
  return (
    ((bytes[off] ?? 0) |
      ((bytes[off + 1] ?? 0) << 8) |
      ((bytes[off + 2] ?? 0) << 16) |
      ((bytes[off + 3] ?? 0) << 24)) >>>
    0
  );
}

type RuntimeCfg = Readonly<{
  inlineRows?: unknown;
  plat?: unknown;
}>;

type PlatCfg = Readonly<{ screenMode?: unknown; screen_mode?: unknown }>;

export const native = {
  engineCreate(_config?: object | null): number {
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

  engineCommitScrollback(engineId: number, drawlist: Uint8Array, rows: number): number {
    if (!engines.has(engineId)) return -1;
    if (rows === COMMIT_REJECT_ROWS) return -3;
    if (!Number.isInteger(rows) || rows < 1) return -1;
    if (readU32le(drawlist, 0) !== ZRDL_MAGIC) return -1;
    return 0;
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

  engineSetConfig(engineId: number, cfg?: object | null): number {
    if (!engines.has(engineId)) return -1;
    const rec = (cfg ?? {}) as RuntimeCfg;
    if (rec.inlineRows !== SET_CONFIG_EXPECT_ROWS) return -1;
    if (typeof rec.plat !== "object" || rec.plat === null) return -1;
    const plat = rec.plat as PlatCfg;
    const mode = plat.screenMode ?? plat.screen_mode;
    if (mode !== 1) return -1;
    return 0;
  },

  engineGetMetrics(engineId: number) {
    void engineId;
    return {
      structSize: 0,
      negotiatedEngineAbiMajor: 1,
      negotiatedEngineAbiMinor: 4,
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
      supportsScrollRegion: false,
      supportsCursorShape: true,
      supportsOutputWaitWritable: true,
      sgrAttrsSupported: 0xffffffff,
    };
  },
} as const;

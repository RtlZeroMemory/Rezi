type EngineState = Readonly<{
  destroyed: boolean;
  pollCalls: number;
}>;

let nextEngineId = 1;
const engines = new Map<number, EngineState>();

export const native = {
  engineCreate(_config?: object | null): number {
    const id = nextEngineId++;
    engines.set(id, Object.freeze({ destroyed: false, pollCalls: 0 }));
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

  enginePollEvents(engineId: number, _timeoutMs: number, out: Uint8Array): number {
    const state = engines.get(engineId);
    if (!state) return -1;
    const nextPollCalls = state.pollCalls + 1;
    engines.set(engineId, Object.freeze({ ...state, pollCalls: nextPollCalls }));
    if (nextPollCalls === 1) {
      // Return an impossible byte count to verify guard behavior.
      return out.byteLength + 1;
    }
    return 0;
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

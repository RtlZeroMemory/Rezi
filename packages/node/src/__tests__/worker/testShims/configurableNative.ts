type NativeCaps = Readonly<{
  colorMode: number;
  supportsMouse: boolean;
  supportsBracketedPaste: boolean;
  supportsFocusEvents: boolean;
  supportsOsc52: boolean;
  supportsSyncUpdate: boolean;
  supportsScrollRegion: boolean;
  supportsCursorShape: boolean;
  supportsOutputWaitWritable: boolean;
  supportsUnderlineStyles?: boolean;
  supportsColoredUnderlines?: boolean;
  supportsHyperlinks?: boolean;
  sgrAttrsSupported: number;
}>;

type EngineState = Readonly<{
  destroyed: { value: boolean };
  queue: Uint8Array[];
  caps: NativeCaps;
  submitResult: number | null;
  presentResult: number | null;
  pollBytes: Uint8Array | null;
}>;

const DEFAULT_CAPS: NativeCaps = Object.freeze({
  colorMode: 2,
  supportsMouse: true,
  supportsBracketedPaste: true,
  supportsFocusEvents: true,
  supportsOsc52: false,
  supportsSyncUpdate: true,
  supportsScrollRegion: true,
  supportsCursorShape: true,
  supportsOutputWaitWritable: true,
  supportsUnderlineStyles: false,
  supportsColoredUnderlines: false,
  supportsHyperlinks: false,
  sgrAttrsSupported: 0xffffffff,
});

let nextEngineId = 1;
const engines = new Map<number, EngineState>();

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTestBehavior(config: unknown): Record<string, unknown> {
  const record = asPlainRecord(config);
  const behavior = record === null ? null : asPlainRecord(record["testBehavior"]);
  return behavior ?? {};
}

function readCapsOverride(config: unknown): NativeCaps {
  const behavior = readTestBehavior(config);
  const caps = asPlainRecord(behavior["caps"]);
  return Object.freeze({
    ...DEFAULT_CAPS,
    ...(caps ?? {}),
  });
}

function readInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readBytes(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function getEngine(engineId: number): EngineState | null {
  const engine = engines.get(engineId);
  if (engine === undefined || engine.destroyed.value) return null;
  return engine;
}

export const native = {
  engineCreate(config?: object | null): number {
    const behavior = readTestBehavior(config);
    const id = nextEngineId++;
    engines.set(
      id,
      Object.freeze({
        destroyed: { value: false },
        queue: [],
        caps: readCapsOverride(config),
        submitResult: readInt(behavior["submitResult"]),
        presentResult: readInt(behavior["presentResult"]),
        pollBytes: readBytes(behavior["pollBytesBase64"]),
      }),
    );
    return id;
  },

  engineDestroy(engineId: number): void {
    const engine = engines.get(engineId);
    if (engine === undefined) return;
    engine.destroyed.value = true;
    engines.delete(engineId);
  },

  engineSubmitDrawlist(engineId: number, _drawlist: Uint8Array): number {
    const engine = getEngine(engineId);
    if (engine === null) return -1;
    if (engine.submitResult !== null) return engine.submitResult;
    return 0;
  },

  enginePresent(engineId: number): number {
    const engine = getEngine(engineId);
    if (engine === null) return -1;
    if (engine.presentResult !== null) return engine.presentResult;
    return 0;
  },

  enginePollEvents(engineId: number, _timeoutMs: number, out: Uint8Array): number {
    const engine = getEngine(engineId);
    if (engine === null) return -1;
    const bytes = engine.pollBytes ?? engine.queue.shift();
    if (bytes === undefined || bytes === null) return 0;
    if (bytes.byteLength > out.byteLength) return -3;
    out.set(bytes);
    return bytes.byteLength;
  },

  enginePostUserEvent(engineId: number, tag: number, payload: Uint8Array): number {
    const engine = getEngine(engineId);
    if (engine === null) return -1;
    const header = new Uint8Array([tag & 0xff, payload.byteLength & 0xff]);
    engine.queue.push(Uint8Array.from([...header, ...payload]));
    return 0;
  },

  engineSetConfig(engineId: number, _cfg?: object | null): number {
    return getEngine(engineId) === null ? -1 : 0;
  },

  engineGetCaps(engineId: number): NativeCaps {
    const engine = getEngine(engineId);
    return engine?.caps ?? DEFAULT_CAPS;
  },
} as const;

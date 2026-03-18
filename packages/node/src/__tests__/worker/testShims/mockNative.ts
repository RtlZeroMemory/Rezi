/**
 * Deterministic native shim for Node worker tests.
 *
 * This is loaded via workerData.nativeShimModule and MUST NOT affect the
 * production worker protocol or behavior.
 */

// Little-endian u32 magic for bytes "ZREV".
const ZREV_MAGIC = 0x5645525a;
const ZR_EVENT_BATCH_VERSION_V1 = 1;
const ZREV_RECORD_USER = 7;
const DEBUG_HEADER_BYTES = 40;

type EngineState = {
  destroyed: boolean;
  queue: Uint8Array[];
};

let nextEngineId = 1;
const engines = new Map<number, EngineState>();

function align4(n: number): number {
  const rem = n % 4;
  return rem === 0 ? n : n + (4 - rem);
}

function buildUserBatch(tag: number, payload: Uint8Array): Uint8Array {
  const padded = align4(payload.byteLength);
  const recordSize = 16 + 16 + padded;
  const totalSize = 24 + recordSize;

  const ab = new ArrayBuffer(totalSize);
  const dv = new DataView(ab);
  let off = 0;

  // Batch header (24 bytes)
  dv.setUint32(off, ZREV_MAGIC, true);
  off += 4;
  dv.setUint32(off, ZR_EVENT_BATCH_VERSION_V1, true);
  off += 4;
  dv.setUint32(off, totalSize, true);
  off += 4;
  dv.setUint32(off, 1, true); // event_count
  off += 4;
  dv.setUint32(off, 0, true); // batch_flags
  off += 4;
  dv.setUint32(off, 0, true); // reserved0
  off += 4;

  // Record header (16 bytes)
  dv.setUint32(off, ZREV_RECORD_USER, true);
  off += 4;
  dv.setUint32(off, recordSize, true);
  off += 4;
  dv.setUint32(off, 0, true); // time_ms
  off += 4;
  dv.setUint32(off, 0, true); // flags (ignored)
  off += 4;

  // USER payload header (16 bytes)
  dv.setUint32(off, tag >>> 0, true);
  off += 4;
  dv.setUint32(off, payload.byteLength, true);
  off += 4;
  dv.setUint32(off, 0, true);
  off += 4;
  dv.setUint32(off, 0, true);
  off += 4;

  // USER payload bytes (padded to 4)
  new Uint8Array(ab, off, payload.byteLength).set(payload);
  // padding already zero-filled

  return new Uint8Array(ab);
}

export const native = {
  engineCreate(_config?: object | null): number {
    const id = nextEngineId++;
    engines.set(id, { destroyed: false, queue: [] });
    return id;
  },

  engineDestroy(engineId: number): void {
    const st = engines.get(engineId);
    if (st === undefined) return;
    st.destroyed = true;
    engines.delete(engineId);
  },

  engineSubmitDrawlist(engineId: number, _drawlist: Uint8Array): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    if (_drawlist.byteLength > 0 && _drawlist[0] === 0xff) return -2;
    return 0;
  },

  enginePresent(engineId: number): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },

  enginePollEvents(engineId: number, _timeoutMs: number, out: Uint8Array): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;

    const next = st.queue.shift();
    if (next === undefined) return 0;

    if (next.byteLength > out.byteLength) {
      // Deterministic "buffer too small" in ABI is -3 (ZR_ERR_LIMIT).
      return -3;
    }

    out.set(next);
    return next.byteLength;
  },

  enginePostUserEvent(engineId: number, tag: number, payload: Uint8Array): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    st.queue.push(buildUserBatch(tag, payload));
    return 0;
  },

  engineSetConfig(engineId: number, _cfg?: object | null): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },

  engineGetCaps(engineId: number) {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) {
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

  engineDebugEnable(engineId: number, _config?: object | null): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },

  engineDebugDisable(engineId: number): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },

  engineDebugQuery(engineId: number, _query: object | null, outHeaders: Uint8Array) {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) {
      return {
        recordsReturned: 0,
        recordsAvailable: 0,
        oldestRecordId: 0n,
        newestRecordId: 0n,
        recordsDropped: 0,
      };
    }

    const recordsReturned = Math.floor(outHeaders.byteLength / DEBUG_HEADER_BYTES);
    return {
      recordsReturned,
      recordsAvailable: recordsReturned,
      oldestRecordId: recordsReturned > 0 ? 1n : 0n,
      newestRecordId: BigInt(recordsReturned),
      recordsDropped: 0,
    };
  },

  engineDebugGetPayload(engineId: number, _recordId: bigint, _outPayload: Uint8Array): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },

  engineDebugGetStats(engineId: number) {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) {
      return {
        totalRecords: 0n,
        totalDropped: 0n,
        errorCount: 0,
        warnCount: 0,
        currentRingUsage: 0,
        ringCapacity: 0,
      };
    }
    return {
      totalRecords: 0n,
      totalDropped: 0n,
      errorCount: 0,
      warnCount: 0,
      currentRingUsage: 0,
      ringCapacity: 0,
    };
  },

  engineDebugExport(engineId: number, _outBuf: Uint8Array): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },

  engineDebugReset(engineId: number): number {
    const st = engines.get(engineId);
    if (st === undefined || st.destroyed) return -1;
    return 0;
  },
} as const;

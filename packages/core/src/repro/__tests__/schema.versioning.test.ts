import { assert, describe, test } from "@rezi-ui/testkit";
import {
  REPRO_BUNDLE_SCHEMA_V1,
  REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
} from "../constants.js";
import {
  exportReproBundleBytes,
  parseReproBundleBytes,
  parseReproBundleJson,
  serializeReproBundleStable,
  validateReproBundle,
} from "../index.js";
import type { ReproBundleV1 } from "../types.js";

function makeBundle(): ReproBundleV1 {
  return {
    schema: REPRO_BUNDLE_SCHEMA_V1,
    captureConfig: {
      captureRawEvents: true,
      captureDrawlistBytes: false,
      maxEventBytes: 8192,
      maxDrawlistBytes: 0,
      maxFrames: 4,
      fpsCap: 75,
      cursorProtocolVersion: 2,
    },
    capsSnapshot: {
      terminalCaps: {
        colorMode: 3,
        supportsMouse: true,
        supportsBracketedPaste: true,
        supportsFocusEvents: true,
        supportsOsc52: false,
        supportsSyncUpdate: true,
        supportsScrollRegion: true,
        supportsCursorShape: true,
        supportsOutputWaitWritable: false,
        sgrAttrsSupported: 255,
      },
      backendCaps: {
        maxEventBytes: 8192,
        fpsCap: 75,
        cursorProtocolVersion: 2,
      },
    },
    timingModel: {
      kind: "deterministic",
      clock: "monotonic-ms",
      replayStrategy: "recorded-delta",
      timeUnit: "ms",
      baseTimeMs: 0,
    },
    eventCapture: {
      ordering: "poll-order",
      timing: "step-delta-ms",
      bounds: {
        maxBatches: 4,
        maxEvents: 6,
        maxBytes: 400,
      },
      totals: {
        capturedBatches: 2,
        capturedEvents: 3,
        capturedBytes: 144,
        runtimeDroppedBatches: 1,
        omittedBatches: 1,
        omittedEvents: 1,
        omittedBytes: 56,
      },
      truncation: {
        mode: REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
        truncated: true,
        reason: "max-events",
        firstOmittedStep: 2,
      },
      batches: [
        {
          step: 0,
          deltaMs: 0,
          byteLength: 56,
          bytesHex: "00".repeat(56),
          eventCount: 1,
          droppedBatches: 0,
          resizeEvents: [{ eventIndex: 0, cols: 120, rows: 32, timeMs: 10 }],
        },
        {
          step: 1,
          deltaMs: 5,
          byteLength: 88,
          bytesHex: "11".repeat(88),
          eventCount: 2,
          droppedBatches: 1,
          resizeEvents: [{ eventIndex: 1, cols: 121, rows: 33, timeMs: 12 }],
        },
      ],
    },
  };
}

describe("repro schema/versioning", () => {
  test("accepts valid rezi-repro-v1 bundle", () => {
    const res = validateReproBundle(makeBundle());
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.schema, REPRO_BUNDLE_SCHEMA_V1);
    assert.equal(res.value.captureConfig.maxFrames, 4);
    assert.equal(res.value.captureConfig.fpsCap, 75);
    assert.equal(res.value.capsSnapshot.backendCaps.cursorProtocolVersion, 2);
    assert.equal(res.value.eventCapture.batches.length, 2);
    assert.equal(res.value.eventCapture.truncation.reason, "max-events");
  });

  test("rejects unsupported schema version", () => {
    const candidate = { ...makeBundle(), schema: "rezi-repro-v2" };
    const res = validateReproBundle(candidate);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZR_REPRO_UNSUPPORTED_VERSION");
    assert.equal(res.error.path, "$.schema");
  });

  test("rejects unknown fields to keep schema strict", () => {
    const candidate = { ...makeBundle(), futureField: 123 };
    const res = validateReproBundle(candidate);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZR_REPRO_UNKNOWN_FIELD");
    assert.equal(res.error.path, "$.futureField");
  });

  test("rejects invalid eventCapture step ordering", () => {
    const base = makeBundle();
    const candidate = {
      ...base,
      eventCapture: {
        ...base.eventCapture,
        batches: [{ ...base.eventCapture.batches[0], step: 1 }, base.eventCapture.batches[1]],
      },
    };

    const res = validateReproBundle(candidate);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZR_REPRO_INVALID_BUNDLE");
    assert.equal(res.error.path, "$.eventCapture.batches[0].step");
  });

  test("parses from JSON text and UTF-8 bytes", () => {
    const json = JSON.stringify(makeBundle());
    const fromJson = parseReproBundleJson(json);
    const fromBytes = parseReproBundleBytes(new TextEncoder().encode(json));
    assert.equal(fromJson.ok, true);
    assert.equal(fromBytes.ok, true);
  });

  test("rejects invalid UTF-8/JSON bytes deterministically", () => {
    const res = parseReproBundleBytes(new Uint8Array([0xff]));
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZR_REPRO_INVALID_JSON");
  });

  test("stable export bytes are deterministic across key insertion order", () => {
    const orderedA = makeBundle();
    const orderedB = {
      eventCapture: {
        truncation: {
          firstOmittedStep: 2,
          reason: "max-events",
          truncated: true,
          mode: REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
        },
        totals: {
          omittedBytes: 56,
          omittedEvents: 1,
          omittedBatches: 1,
          runtimeDroppedBatches: 1,
          capturedBytes: 144,
          capturedEvents: 3,
          capturedBatches: 2,
        },
        bounds: {
          maxBytes: 400,
          maxEvents: 6,
          maxBatches: 4,
        },
        timing: "step-delta-ms",
        ordering: "poll-order",
        batches: [
          {
            droppedBatches: 0,
            eventCount: 1,
            bytesHex: "00".repeat(56),
            byteLength: 56,
            resizeEvents: [{ cols: 120, eventIndex: 0, rows: 32, timeMs: 10 }],
            step: 0,
            deltaMs: 0,
          },
          {
            resizeEvents: [{ rows: 33, cols: 121, timeMs: 12, eventIndex: 1 }],
            deltaMs: 5,
            step: 1,
            eventCount: 2,
            droppedBatches: 1,
            byteLength: 88,
            bytesHex: "11".repeat(88),
          },
        ],
      },
      timingModel: {
        baseTimeMs: 0,
        timeUnit: "ms",
        replayStrategy: "recorded-delta",
        clock: "monotonic-ms",
        kind: "deterministic",
      },
      capsSnapshot: {
        backendCaps: {
          cursorProtocolVersion: 2,
          fpsCap: 75,
          maxEventBytes: 8192,
        },
        terminalCaps: {
          supportsCursorShape: true,
          supportsFocusEvents: true,
          supportsMouse: true,
          sgrAttrsSupported: 255,
          supportsOsc52: false,
          supportsOutputWaitWritable: false,
          supportsBracketedPaste: true,
          supportsScrollRegion: true,
          supportsSyncUpdate: true,
          colorMode: 3,
        },
      },
      captureConfig: {
        captureDrawlistBytes: false,
        captureRawEvents: true,
        cursorProtocolVersion: 2,
        fpsCap: 75,
        maxDrawlistBytes: 0,
        maxEventBytes: 8192,
        maxFrames: 4,
      },
      schema: REPRO_BUNDLE_SCHEMA_V1,
    };

    const a = validateReproBundle(orderedA);
    const b = validateReproBundle(orderedB);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;

    const jsonA = serializeReproBundleStable(a.value);
    const jsonB = serializeReproBundleStable(b.value);
    assert.equal(jsonA, jsonB);

    const bytesA = exportReproBundleBytes(a.value);
    const bytesB = exportReproBundleBytes(b.value);
    assert.deepEqual(Array.from(bytesA), Array.from(bytesB));
  });
});

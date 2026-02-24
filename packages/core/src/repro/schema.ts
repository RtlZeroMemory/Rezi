/**
 * packages/core/src/repro/schema.ts - Repro bundle parse/validate helpers.
 *
 * Why: Enforces strict schema/version checks for repro bundles and returns
 * deterministic typed objects for higher-level replay tooling.
 */

import type { ColorMode, TerminalCaps } from "../terminalCaps.js";
import {
  REPRO_BUNDLE_SCHEMA_V1,
  REPRO_EVENT_CAPTURE_ORDERING_POLL,
  REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS,
  REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
  REPRO_TIMING_CLOCK_MONOTONIC_MS,
  REPRO_TIMING_MODEL_KIND_DETERMINISTIC,
  REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA,
  REPRO_TIMING_UNIT_MS,
} from "./constants.js";
import type {
  ReproBackendCapsSnapshot,
  ReproBundle,
  ReproBundleSchema,
  ReproCapsSnapshot,
  ReproCaptureConfig,
  ReproEventCapture,
  ReproEventCaptureBounds,
  ReproEventCaptureTotals,
  ReproEventCaptureTruncation,
  ReproEventCaptureTruncationReason,
  ReproParseErrorCode,
  ReproParseResult,
  ReproRecordedEventBatch,
  ReproRecordedResizeEvent,
  ReproTimingModelMetadata,
} from "./types.js";

type JsonObject = Record<string, unknown>;

const TOP_LEVEL_KEYS_V1: ReadonlySet<string> = new Set([
  "schema",
  "captureConfig",
  "capsSnapshot",
  "timingModel",
  "eventCapture",
]);

const CAPTURE_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "captureRawEvents",
  "captureDrawlistBytes",
  "maxEventBytes",
  "maxDrawlistBytes",
  "maxFrames",
  "fpsCap",
  "cursorProtocolVersion",
]);

const CAPS_SNAPSHOT_KEYS: ReadonlySet<string> = new Set(["terminalCaps", "backendCaps"]);

const BACKEND_CAPS_KEYS: ReadonlySet<string> = new Set([
  "maxEventBytes",
  "fpsCap",
  "cursorProtocolVersion",
]);

const TERMINAL_CAPS_KEYS: ReadonlySet<string> = new Set([
  "colorMode",
  "supportsMouse",
  "supportsBracketedPaste",
  "supportsFocusEvents",
  "supportsOsc52",
  "supportsSyncUpdate",
  "supportsScrollRegion",
  "supportsCursorShape",
  "supportsOutputWaitWritable",
  "supportsUnderlineStyles",
  "supportsColoredUnderlines",
  "supportsHyperlinks",
  "sgrAttrsSupported",
]);

const TIMING_MODEL_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "clock",
  "replayStrategy",
  "timeUnit",
  "baseTimeMs",
]);

const EVENT_CAPTURE_KEYS: ReadonlySet<string> = new Set([
  "ordering",
  "timing",
  "bounds",
  "totals",
  "truncation",
  "batches",
]);

const EVENT_CAPTURE_BOUNDS_KEYS: ReadonlySet<string> = new Set([
  "maxBatches",
  "maxEvents",
  "maxBytes",
]);

const EVENT_CAPTURE_TOTALS_KEYS: ReadonlySet<string> = new Set([
  "capturedBatches",
  "capturedEvents",
  "capturedBytes",
  "runtimeDroppedBatches",
  "omittedBatches",
  "omittedEvents",
  "omittedBytes",
]);

const EVENT_CAPTURE_TRUNCATION_KEYS: ReadonlySet<string> = new Set([
  "mode",
  "truncated",
  "reason",
  "firstOmittedStep",
]);

const RECORDED_BATCH_KEYS: ReadonlySet<string> = new Set([
  "step",
  "deltaMs",
  "byteLength",
  "bytesHex",
  "eventCount",
  "droppedBatches",
  "resizeEvents",
]);

const RECORDED_RESIZE_KEYS: ReadonlySet<string> = new Set(["eventIndex", "cols", "rows", "timeMs"]);

function ok<T>(value: T): ReproParseResult<T> {
  return { ok: true, value };
}

function fail<T>(code: ReproParseErrorCode, path: string, detail: string): ReproParseResult<T> {
  return { ok: false, error: { code, path, detail } };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownFields(
  obj: JsonObject,
  knownFields: ReadonlySet<string>,
  path: string,
): ReproParseResult<null> {
  for (const key of Object.keys(obj)) {
    if (!knownFields.has(key)) {
      return fail("ZR_REPRO_UNKNOWN_FIELD", `${path}.${key}`, "unknown field");
    }
  }
  return ok(null);
}

function readBoolean(obj: JsonObject, key: string, path: string): ReproParseResult<boolean> {
  const value = obj[key];
  if (typeof value !== "boolean") {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected boolean");
  }
  return ok(value);
}

function readBooleanWithDefault(
  obj: JsonObject,
  key: string,
  path: string,
  fallback: boolean,
): ReproParseResult<boolean> {
  const value = obj[key];
  if (value === undefined) {
    return ok(fallback);
  }
  if (typeof value !== "boolean") {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected boolean");
  }
  return ok(value);
}

function readString(obj: JsonObject, key: string, path: string): ReproParseResult<string> {
  const value = obj[key];
  if (typeof value !== "string") {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected string");
  }
  return ok(value);
}

function readNonNegativeInteger(
  obj: JsonObject,
  key: string,
  path: string,
): ReproParseResult<number> {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected non-negative integer");
  }
  return ok(value);
}

function readPositiveInteger(obj: JsonObject, key: string, path: string): ReproParseResult<number> {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected positive integer");
  }
  return ok(value);
}

function readNullableString(
  obj: JsonObject,
  key: string,
  path: string,
): ReproParseResult<string | null> {
  const value = obj[key];
  if (value === null || typeof value === "string") {
    return ok(value);
  }
  return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected string or null");
}

function readNullableNonNegativeInteger(
  obj: JsonObject,
  key: string,
  path: string,
): ReproParseResult<number | null> {
  const value = obj[key];
  if (value === null) {
    return ok(null);
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected non-negative integer or null");
  }
  return ok(value);
}

function readArray(
  obj: JsonObject,
  key: string,
  path: string,
): ReproParseResult<readonly unknown[]> {
  const value = obj[key];
  if (!Array.isArray(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected array");
  }
  return ok(value);
}

function readField(obj: JsonObject, key: string): unknown {
  return obj[key];
}

function parseCursorProtocolVersion(value: unknown, path: string): ReproParseResult<2> {
  if (value !== 2) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "cursorProtocolVersion must be 2");
  }
  return ok(value);
}

function parseSchema(value: unknown): ReproParseResult<ReproBundleSchema> {
  if (typeof value !== "string") {
    return fail("ZR_REPRO_INVALID_SCHEMA", "$.schema", "schema must be a string");
  }
  if (value === REPRO_BUNDLE_SCHEMA_V1) {
    return ok(value);
  }
  if (/^rezi-repro-v\d+$/.test(value)) {
    return fail("ZR_REPRO_UNSUPPORTED_VERSION", "$.schema", `unsupported schema '${value}'`);
  }
  return fail("ZR_REPRO_INVALID_SCHEMA", "$.schema", `invalid schema '${value}'`);
}

function parseCaptureConfig(value: unknown, path: string): ReproParseResult<ReproCaptureConfig> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "captureConfig must be an object");
  }
  const known = assertKnownFields(value, CAPTURE_CONFIG_KEYS, path);
  if (!known.ok) return known;

  const captureRawEvents = readBoolean(value, "captureRawEvents", `${path}.captureRawEvents`);
  if (!captureRawEvents.ok) return captureRawEvents;
  const captureDrawlistBytes = readBoolean(
    value,
    "captureDrawlistBytes",
    `${path}.captureDrawlistBytes`,
  );
  if (!captureDrawlistBytes.ok) return captureDrawlistBytes;
  const maxEventBytes = readNonNegativeInteger(value, "maxEventBytes", `${path}.maxEventBytes`);
  if (!maxEventBytes.ok) return maxEventBytes;
  const maxDrawlistBytes = readNonNegativeInteger(
    value,
    "maxDrawlistBytes",
    `${path}.maxDrawlistBytes`,
  );
  if (!maxDrawlistBytes.ok) return maxDrawlistBytes;
  const maxFrames = readNonNegativeInteger(value, "maxFrames", `${path}.maxFrames`);
  if (!maxFrames.ok) return maxFrames;
  const fpsCap = readPositiveInteger(value, "fpsCap", `${path}.fpsCap`);
  if (!fpsCap.ok) return fpsCap;
  const cursorProtocolVersion = parseCursorProtocolVersion(
    readField(value, "cursorProtocolVersion"),
    `${path}.cursorProtocolVersion`,
  );
  if (!cursorProtocolVersion.ok) return cursorProtocolVersion;

  return ok({
    captureRawEvents: captureRawEvents.value,
    captureDrawlistBytes: captureDrawlistBytes.value,
    maxEventBytes: maxEventBytes.value,
    maxDrawlistBytes: maxDrawlistBytes.value,
    maxFrames: maxFrames.value,
    fpsCap: fpsCap.value,
    cursorProtocolVersion: cursorProtocolVersion.value,
  });
}

function parseColorMode(value: unknown, path: string): ReproParseResult<ColorMode> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "colorMode must be an integer in [0, 3]");
  }
  return ok(value as ColorMode);
}

function parseTerminalCapsSnapshot(
  value: unknown,
  path: string,
): ReproParseResult<TerminalCaps | null> {
  if (value === null) {
    return ok(null);
  }
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "terminalCaps must be an object or null");
  }

  const known = assertKnownFields(value, TERMINAL_CAPS_KEYS, path);
  if (!known.ok) return known;

  const colorMode = parseColorMode(readField(value, "colorMode"), `${path}.colorMode`);
  if (!colorMode.ok) return colorMode;
  const supportsMouse = readBoolean(value, "supportsMouse", `${path}.supportsMouse`);
  if (!supportsMouse.ok) return supportsMouse;
  const supportsBracketedPaste = readBoolean(
    value,
    "supportsBracketedPaste",
    `${path}.supportsBracketedPaste`,
  );
  if (!supportsBracketedPaste.ok) return supportsBracketedPaste;
  const supportsFocusEvents = readBoolean(
    value,
    "supportsFocusEvents",
    `${path}.supportsFocusEvents`,
  );
  if (!supportsFocusEvents.ok) return supportsFocusEvents;
  const supportsOsc52 = readBoolean(value, "supportsOsc52", `${path}.supportsOsc52`);
  if (!supportsOsc52.ok) return supportsOsc52;
  const supportsSyncUpdate = readBoolean(value, "supportsSyncUpdate", `${path}.supportsSyncUpdate`);
  if (!supportsSyncUpdate.ok) return supportsSyncUpdate;
  const supportsScrollRegion = readBoolean(
    value,
    "supportsScrollRegion",
    `${path}.supportsScrollRegion`,
  );
  if (!supportsScrollRegion.ok) return supportsScrollRegion;
  const supportsCursorShape = readBoolean(
    value,
    "supportsCursorShape",
    `${path}.supportsCursorShape`,
  );
  if (!supportsCursorShape.ok) return supportsCursorShape;
  const supportsOutputWaitWritable = readBoolean(
    value,
    "supportsOutputWaitWritable",
    `${path}.supportsOutputWaitWritable`,
  );
  if (!supportsOutputWaitWritable.ok) return supportsOutputWaitWritable;
  const supportsUnderlineStyles = readBooleanWithDefault(
    value,
    "supportsUnderlineStyles",
    `${path}.supportsUnderlineStyles`,
    false,
  );
  if (!supportsUnderlineStyles.ok) return supportsUnderlineStyles;
  const supportsColoredUnderlines = readBooleanWithDefault(
    value,
    "supportsColoredUnderlines",
    `${path}.supportsColoredUnderlines`,
    false,
  );
  if (!supportsColoredUnderlines.ok) return supportsColoredUnderlines;
  const supportsHyperlinks = readBooleanWithDefault(
    value,
    "supportsHyperlinks",
    `${path}.supportsHyperlinks`,
    false,
  );
  if (!supportsHyperlinks.ok) return supportsHyperlinks;
  const sgrAttrsSupported = readNonNegativeInteger(
    value,
    "sgrAttrsSupported",
    `${path}.sgrAttrsSupported`,
  );
  if (!sgrAttrsSupported.ok) return sgrAttrsSupported;

  return ok({
    colorMode: colorMode.value,
    supportsMouse: supportsMouse.value,
    supportsBracketedPaste: supportsBracketedPaste.value,
    supportsFocusEvents: supportsFocusEvents.value,
    supportsOsc52: supportsOsc52.value,
    supportsSyncUpdate: supportsSyncUpdate.value,
    supportsScrollRegion: supportsScrollRegion.value,
    supportsCursorShape: supportsCursorShape.value,
    supportsOutputWaitWritable: supportsOutputWaitWritable.value,
    supportsUnderlineStyles: supportsUnderlineStyles.value,
    supportsColoredUnderlines: supportsColoredUnderlines.value,
    supportsHyperlinks: supportsHyperlinks.value,
    sgrAttrsSupported: sgrAttrsSupported.value,
  });
}

function parseBackendCapsSnapshot(
  value: unknown,
  path: string,
): ReproParseResult<ReproBackendCapsSnapshot> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "backendCaps must be an object");
  }
  const known = assertKnownFields(value, BACKEND_CAPS_KEYS, path);
  if (!known.ok) return known;

  const maxEventBytes = readNonNegativeInteger(value, "maxEventBytes", `${path}.maxEventBytes`);
  if (!maxEventBytes.ok) return maxEventBytes;
  const fpsCap = readPositiveInteger(value, "fpsCap", `${path}.fpsCap`);
  if (!fpsCap.ok) return fpsCap;
  const cursorProtocolVersion = parseCursorProtocolVersion(
    readField(value, "cursorProtocolVersion"),
    `${path}.cursorProtocolVersion`,
  );
  if (!cursorProtocolVersion.ok) return cursorProtocolVersion;

  return ok({
    maxEventBytes: maxEventBytes.value,
    fpsCap: fpsCap.value,
    cursorProtocolVersion: cursorProtocolVersion.value,
  });
}

function parseCapsSnapshot(value: unknown, path: string): ReproParseResult<ReproCapsSnapshot> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "capsSnapshot must be an object");
  }
  const known = assertKnownFields(value, CAPS_SNAPSHOT_KEYS, path);
  if (!known.ok) return known;

  const terminalCaps = parseTerminalCapsSnapshot(
    readField(value, "terminalCaps"),
    `${path}.terminalCaps`,
  );
  if (!terminalCaps.ok) return terminalCaps;
  const backendCaps = parseBackendCapsSnapshot(
    readField(value, "backendCaps"),
    `${path}.backendCaps`,
  );
  if (!backendCaps.ok) return backendCaps;

  return ok({
    terminalCaps: terminalCaps.value,
    backendCaps: backendCaps.value,
  });
}

function parseTimingModel(
  value: unknown,
  path: string,
): ReproParseResult<ReproTimingModelMetadata> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "timingModel must be an object");
  }
  const known = assertKnownFields(value, TIMING_MODEL_KEYS, path);
  if (!known.ok) return known;

  const kind = readString(value, "kind", `${path}.kind`);
  if (!kind.ok) return kind;
  if (kind.value !== REPRO_TIMING_MODEL_KIND_DETERMINISTIC) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.kind`,
      `timingModel.kind must be '${REPRO_TIMING_MODEL_KIND_DETERMINISTIC}'`,
    );
  }

  const clock = readString(value, "clock", `${path}.clock`);
  if (!clock.ok) return clock;
  if (clock.value !== REPRO_TIMING_CLOCK_MONOTONIC_MS) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.clock`,
      `timingModel.clock must be '${REPRO_TIMING_CLOCK_MONOTONIC_MS}'`,
    );
  }

  const replayStrategy = readString(value, "replayStrategy", `${path}.replayStrategy`);
  if (!replayStrategy.ok) return replayStrategy;
  if (replayStrategy.value !== REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.replayStrategy`,
      `timingModel.replayStrategy must be '${REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA}'`,
    );
  }

  const timeUnit = readString(value, "timeUnit", `${path}.timeUnit`);
  if (!timeUnit.ok) return timeUnit;
  if (timeUnit.value !== REPRO_TIMING_UNIT_MS) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.timeUnit`,
      `timingModel.timeUnit must be '${REPRO_TIMING_UNIT_MS}'`,
    );
  }

  const baseTimeMs = readNonNegativeInteger(value, "baseTimeMs", `${path}.baseTimeMs`);
  if (!baseTimeMs.ok) return baseTimeMs;

  return ok({
    kind: REPRO_TIMING_MODEL_KIND_DETERMINISTIC,
    clock: REPRO_TIMING_CLOCK_MONOTONIC_MS,
    replayStrategy: REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA,
    timeUnit: REPRO_TIMING_UNIT_MS,
    baseTimeMs: baseTimeMs.value,
  });
}

function parseEventCaptureBounds(
  value: unknown,
  path: string,
): ReproParseResult<ReproEventCaptureBounds> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "eventCapture.bounds must be an object");
  }
  const known = assertKnownFields(value, EVENT_CAPTURE_BOUNDS_KEYS, path);
  if (!known.ok) return known;

  const maxBatches = readNonNegativeInteger(value, "maxBatches", `${path}.maxBatches`);
  if (!maxBatches.ok) return maxBatches;
  const maxEvents = readNonNegativeInteger(value, "maxEvents", `${path}.maxEvents`);
  if (!maxEvents.ok) return maxEvents;
  const maxBytes = readNonNegativeInteger(value, "maxBytes", `${path}.maxBytes`);
  if (!maxBytes.ok) return maxBytes;

  return ok({
    maxBatches: maxBatches.value,
    maxEvents: maxEvents.value,
    maxBytes: maxBytes.value,
  });
}

function parseEventCaptureTotals(
  value: unknown,
  path: string,
): ReproParseResult<ReproEventCaptureTotals> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "eventCapture.totals must be an object");
  }
  const known = assertKnownFields(value, EVENT_CAPTURE_TOTALS_KEYS, path);
  if (!known.ok) return known;

  const capturedBatches = readNonNegativeInteger(
    value,
    "capturedBatches",
    `${path}.capturedBatches`,
  );
  if (!capturedBatches.ok) return capturedBatches;
  const capturedEvents = readNonNegativeInteger(value, "capturedEvents", `${path}.capturedEvents`);
  if (!capturedEvents.ok) return capturedEvents;
  const capturedBytes = readNonNegativeInteger(value, "capturedBytes", `${path}.capturedBytes`);
  if (!capturedBytes.ok) return capturedBytes;
  const runtimeDroppedBatches = readNonNegativeInteger(
    value,
    "runtimeDroppedBatches",
    `${path}.runtimeDroppedBatches`,
  );
  if (!runtimeDroppedBatches.ok) return runtimeDroppedBatches;
  const omittedBatches = readNonNegativeInteger(value, "omittedBatches", `${path}.omittedBatches`);
  if (!omittedBatches.ok) return omittedBatches;
  const omittedEvents = readNonNegativeInteger(value, "omittedEvents", `${path}.omittedEvents`);
  if (!omittedEvents.ok) return omittedEvents;
  const omittedBytes = readNonNegativeInteger(value, "omittedBytes", `${path}.omittedBytes`);
  if (!omittedBytes.ok) return omittedBytes;

  return ok({
    capturedBatches: capturedBatches.value,
    capturedEvents: capturedEvents.value,
    capturedBytes: capturedBytes.value,
    runtimeDroppedBatches: runtimeDroppedBatches.value,
    omittedBatches: omittedBatches.value,
    omittedEvents: omittedEvents.value,
    omittedBytes: omittedBytes.value,
  });
}

function parseTruncationReason(
  value: string,
  path: string,
): ReproParseResult<ReproEventCaptureTruncationReason> {
  if (value === "max-batches" || value === "max-events" || value === "max-bytes") {
    return ok(value);
  }
  return fail(
    "ZR_REPRO_INVALID_BUNDLE",
    path,
    "truncation.reason must be 'max-batches' | 'max-events' | 'max-bytes'",
  );
}

function parseEventCaptureTruncation(
  value: unknown,
  path: string,
): ReproParseResult<ReproEventCaptureTruncation> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "eventCapture.truncation must be an object");
  }
  const known = assertKnownFields(value, EVENT_CAPTURE_TRUNCATION_KEYS, path);
  if (!known.ok) return known;

  const mode = readString(value, "mode", `${path}.mode`);
  if (!mode.ok) return mode;
  if (mode.value !== REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.mode`,
      `truncation.mode must be '${REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH}'`,
    );
  }

  const truncated = readBoolean(value, "truncated", `${path}.truncated`);
  if (!truncated.ok) return truncated;

  const reason = readNullableString(value, "reason", `${path}.reason`);
  if (!reason.ok) return reason;

  const firstOmittedStep = readNullableNonNegativeInteger(
    value,
    "firstOmittedStep",
    `${path}.firstOmittedStep`,
  );
  if (!firstOmittedStep.ok) return firstOmittedStep;

  if (!truncated.value) {
    if (reason.value !== null) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.reason`,
        "reason must be null when not truncated",
      );
    }
    if (firstOmittedStep.value !== null) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.firstOmittedStep`,
        "firstOmittedStep must be null when not truncated",
      );
    }
    return ok({
      mode: REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
      truncated: false,
      reason: null,
      firstOmittedStep: null,
    });
  }

  if (reason.value === null) {
    return fail("ZR_REPRO_INVALID_BUNDLE", `${path}.reason`, "reason is required when truncated");
  }
  if (firstOmittedStep.value === null) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.firstOmittedStep`,
      "firstOmittedStep is required when truncated",
    );
  }

  const parsedReason = parseTruncationReason(reason.value, `${path}.reason`);
  if (!parsedReason.ok) return parsedReason;

  return ok({
    mode: REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
    truncated: true,
    reason: parsedReason.value,
    firstOmittedStep: firstOmittedStep.value,
  });
}

function parseLowerHex(value: unknown, path: string): ReproParseResult<string> {
  if (typeof value !== "string") {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "expected string");
  }
  if (!/^[0-9a-f]*$/.test(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "bytesHex must contain lowercase hex only");
  }
  if ((value.length & 1) !== 0) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "bytesHex length must be even");
  }
  return ok(value);
}

function parseRecordedResizeEvent(
  value: unknown,
  path: string,
): ReproParseResult<ReproRecordedResizeEvent> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "resize event must be an object");
  }
  const known = assertKnownFields(value, RECORDED_RESIZE_KEYS, path);
  if (!known.ok) return known;

  const eventIndex = readNonNegativeInteger(value, "eventIndex", `${path}.eventIndex`);
  if (!eventIndex.ok) return eventIndex;
  const cols = readNonNegativeInteger(value, "cols", `${path}.cols`);
  if (!cols.ok) return cols;
  const rows = readNonNegativeInteger(value, "rows", `${path}.rows`);
  if (!rows.ok) return rows;
  const timeMs = readNonNegativeInteger(value, "timeMs", `${path}.timeMs`);
  if (!timeMs.ok) return timeMs;

  return ok({
    eventIndex: eventIndex.value,
    cols: cols.value,
    rows: rows.value,
    timeMs: timeMs.value,
  });
}

function parseRecordedEventBatch(
  value: unknown,
  path: string,
): ReproParseResult<ReproRecordedEventBatch> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "eventCapture batch must be an object");
  }
  const known = assertKnownFields(value, RECORDED_BATCH_KEYS, path);
  if (!known.ok) return known;

  const step = readNonNegativeInteger(value, "step", `${path}.step`);
  if (!step.ok) return step;
  const deltaMs = readNonNegativeInteger(value, "deltaMs", `${path}.deltaMs`);
  if (!deltaMs.ok) return deltaMs;
  const byteLength = readNonNegativeInteger(value, "byteLength", `${path}.byteLength`);
  if (!byteLength.ok) return byteLength;
  const bytesHex = parseLowerHex(readField(value, "bytesHex"), `${path}.bytesHex`);
  if (!bytesHex.ok) return bytesHex;
  const eventCount = readNonNegativeInteger(value, "eventCount", `${path}.eventCount`);
  if (!eventCount.ok) return eventCount;
  const droppedBatches = readNonNegativeInteger(value, "droppedBatches", `${path}.droppedBatches`);
  if (!droppedBatches.ok) return droppedBatches;

  if (bytesHex.value.length !== byteLength.value * 2) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.bytesHex`,
      "bytesHex length must equal byteLength * 2",
    );
  }

  const resizeEventsRaw = readArray(value, "resizeEvents", `${path}.resizeEvents`);
  if (!resizeEventsRaw.ok) return resizeEventsRaw;

  const resizeEvents: ReproRecordedResizeEvent[] = new Array<ReproRecordedResizeEvent>(
    resizeEventsRaw.value.length,
  );
  let prevResizeEventIndex = -1;
  for (let i = 0; i < resizeEventsRaw.value.length; i++) {
    const parsed = parseRecordedResizeEvent(resizeEventsRaw.value[i], `${path}.resizeEvents[${i}]`);
    if (!parsed.ok) return parsed;
    if (parsed.value.eventIndex >= eventCount.value) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.resizeEvents[${i}].eventIndex`,
        "eventIndex must be < eventCount",
      );
    }
    if (parsed.value.eventIndex < prevResizeEventIndex) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.resizeEvents[${i}].eventIndex`,
        "resizeEvents must be sorted by eventIndex",
      );
    }
    prevResizeEventIndex = parsed.value.eventIndex;
    resizeEvents[i] = parsed.value;
  }

  return ok({
    step: step.value,
    deltaMs: deltaMs.value,
    byteLength: byteLength.value,
    bytesHex: bytesHex.value,
    eventCount: eventCount.value,
    droppedBatches: droppedBatches.value,
    resizeEvents,
  });
}

function parseEventCapture(value: unknown, path: string): ReproParseResult<ReproEventCapture> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", path, "eventCapture must be an object");
  }
  const known = assertKnownFields(value, EVENT_CAPTURE_KEYS, path);
  if (!known.ok) return known;

  const ordering = readString(value, "ordering", `${path}.ordering`);
  if (!ordering.ok) return ordering;
  if (ordering.value !== REPRO_EVENT_CAPTURE_ORDERING_POLL) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.ordering`,
      `eventCapture.ordering must be '${REPRO_EVENT_CAPTURE_ORDERING_POLL}'`,
    );
  }

  const timing = readString(value, "timing", `${path}.timing`);
  if (!timing.ok) return timing;
  if (timing.value !== REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.timing`,
      `eventCapture.timing must be '${REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS}'`,
    );
  }

  const bounds = parseEventCaptureBounds(readField(value, "bounds"), `${path}.bounds`);
  if (!bounds.ok) return bounds;

  const totals = parseEventCaptureTotals(readField(value, "totals"), `${path}.totals`);
  if (!totals.ok) return totals;

  const truncation = parseEventCaptureTruncation(
    readField(value, "truncation"),
    `${path}.truncation`,
  );
  if (!truncation.ok) return truncation;

  const batchesRaw = readArray(value, "batches", `${path}.batches`);
  if (!batchesRaw.ok) return batchesRaw;

  const batches: ReproRecordedEventBatch[] = new Array<ReproRecordedEventBatch>(
    batchesRaw.value.length,
  );
  let sumEvents = 0;
  let sumBytes = 0;
  let capturedDroppedBatches = 0;

  for (let i = 0; i < batchesRaw.value.length; i++) {
    const parsed = parseRecordedEventBatch(batchesRaw.value[i], `${path}.batches[${i}]`);
    if (!parsed.ok) return parsed;

    if (parsed.value.step !== i) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.batches[${i}].step`,
        "batch step must match array order",
      );
    }

    batches[i] = parsed.value;
    sumEvents += parsed.value.eventCount;
    sumBytes += parsed.value.byteLength;
    capturedDroppedBatches += parsed.value.droppedBatches;
  }

  if (totals.value.capturedBatches !== batches.length) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.capturedBatches`,
      "capturedBatches must equal batches.length",
    );
  }
  if (totals.value.capturedEvents !== sumEvents) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.capturedEvents`,
      "capturedEvents must equal the sum of batch eventCount",
    );
  }
  if (totals.value.capturedBytes !== sumBytes) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.capturedBytes`,
      "capturedBytes must equal the sum of batch byteLength",
    );
  }
  if (totals.value.runtimeDroppedBatches < capturedDroppedBatches) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.runtimeDroppedBatches`,
      "runtimeDroppedBatches must be >= captured droppedBatches",
    );
  }

  if (totals.value.capturedBatches > bounds.value.maxBatches) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.capturedBatches`,
      "capturedBatches exceeds bounds.maxBatches",
    );
  }
  if (totals.value.capturedEvents > bounds.value.maxEvents) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.capturedEvents`,
      "capturedEvents exceeds bounds.maxEvents",
    );
  }
  if (totals.value.capturedBytes > bounds.value.maxBytes) {
    return fail(
      "ZR_REPRO_INVALID_BUNDLE",
      `${path}.totals.capturedBytes`,
      "capturedBytes exceeds bounds.maxBytes",
    );
  }

  if (!truncation.value.truncated) {
    if (
      totals.value.omittedBatches !== 0 ||
      totals.value.omittedEvents !== 0 ||
      totals.value.omittedBytes !== 0
    ) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.totals`,
        "omitted totals must be zero when truncation.truncated=false",
      );
    }
  } else {
    if (totals.value.omittedBatches === 0) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.totals.omittedBatches`,
        "omittedBatches must be > 0 when truncated",
      );
    }
    if (truncation.value.firstOmittedStep === null) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.truncation.firstOmittedStep`,
        "firstOmittedStep must be provided when truncated",
      );
    }
    if (truncation.value.firstOmittedStep < totals.value.capturedBatches) {
      return fail(
        "ZR_REPRO_INVALID_BUNDLE",
        `${path}.truncation.firstOmittedStep`,
        "firstOmittedStep must be >= capturedBatches",
      );
    }
  }

  return ok({
    ordering: REPRO_EVENT_CAPTURE_ORDERING_POLL,
    timing: REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS,
    bounds: bounds.value,
    totals: totals.value,
    truncation: truncation.value,
    batches,
  });
}

function validateV1Bundle(
  obj: JsonObject,
): ReproParseResult<Extract<ReproBundle, { schema: "rezi-repro-v1" }>> {
  const known = assertKnownFields(obj, TOP_LEVEL_KEYS_V1, "$");
  if (!known.ok) return known;

  const captureConfig = parseCaptureConfig(readField(obj, "captureConfig"), "$.captureConfig");
  if (!captureConfig.ok) return captureConfig;

  const capsSnapshot = parseCapsSnapshot(readField(obj, "capsSnapshot"), "$.capsSnapshot");
  if (!capsSnapshot.ok) return capsSnapshot;

  const timingModel = parseTimingModel(readField(obj, "timingModel"), "$.timingModel");
  if (!timingModel.ok) return timingModel;

  const eventCapture = parseEventCapture(readField(obj, "eventCapture"), "$.eventCapture");
  if (!eventCapture.ok) return eventCapture;

  return ok({
    schema: REPRO_BUNDLE_SCHEMA_V1,
    captureConfig: captureConfig.value,
    capsSnapshot: capsSnapshot.value,
    timingModel: timingModel.value,
    eventCapture: eventCapture.value,
  });
}

/**
 * Parse/validate a repro bundle object and return the strict typed shape for
 * the currently supported schema versions.
 */
export function validateReproBundle(value: unknown): ReproParseResult<ReproBundle> {
  if (!isJsonObject(value)) {
    return fail("ZR_REPRO_INVALID_BUNDLE", "$", "bundle must be an object");
  }

  const schema = parseSchema(readField(value, "schema"));
  if (!schema.ok) return schema;

  return validateV1Bundle(value);
}

/** Type guard for repro bundles. */
export function isReproBundle(value: unknown): value is ReproBundle {
  return validateReproBundle(value).ok;
}

/** Alias for validateReproBundle to support parser-oriented call sites. */
export function parseReproBundle(value: unknown): ReproParseResult<ReproBundle> {
  return validateReproBundle(value);
}

/** Parse and validate a repro bundle from JSON text. */
export function parseReproBundleJson(json: string): ReproParseResult<ReproBundle> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    return fail("ZR_REPRO_INVALID_JSON", "$", detail);
  }
  return validateReproBundle(parsed);
}

/** Parse and validate a repro bundle from UTF-8 JSON bytes. */
export function parseReproBundleBytes(bytes: Uint8Array): ReproParseResult<ReproBundle> {
  const json = new TextDecoder().decode(bytes);
  return parseReproBundleJson(json);
}

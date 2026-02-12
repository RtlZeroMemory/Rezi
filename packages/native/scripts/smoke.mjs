import { Worker } from "node:worker_threads";
import {
  engineCreate,
  engineDebugDisable,
  engineDebugEnable,
  engineDebugExport,
  engineDebugGetPayload,
  engineDebugGetStats,
  engineDebugQuery,
  engineDebugReset,
  engineDestroy,
  engineGetMetrics,
  enginePostUserEvent,
  enginePresent,
  engineSetConfig,
} from "../index.js";

const ZR_OK = 0;
const ZR_ERR_INVALID_ARGUMENT = -1;
const ZR_ERR_PLATFORM = -6;
const INVALID_ARG_ERROR_RE = /INVALID_ARGUMENT|InvalidArg|ZR_ERR_INVALID_ARGUMENT/i;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn, pattern, msg) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (pattern) {
      const detail = err instanceof Error ? err.message : String(err);
      assert(pattern.test(detail), `${msg}: wrong error detail: ${detail}`);
    }
  }
  assert(threw, `${msg}: expected throw`);
}

function assertMetricsShape(metrics) {
  assert(metrics && typeof metrics === "object", "engineGetMetrics must return an object");
  assert(typeof metrics.frameIndex === "bigint", "metrics.frameIndex must be bigint");
  assert(typeof metrics.bytesEmittedTotal === "bigint", "metrics.bytesEmittedTotal must be bigint");
  assert(
    typeof metrics.arenaFrameHighWaterBytes === "bigint",
    "metrics.arenaFrameHighWaterBytes must be bigint",
  );
  assert(typeof metrics.fps === "number", "metrics.fps must be number");
  assert(
    typeof metrics.negotiatedDrawlistVersion === "number",
    "metrics.negotiatedDrawlistVersion must be number",
  );
  assert(
    typeof metrics.negotiatedEventBatchVersion === "number",
    "metrics.negotiatedEventBatchVersion must be number",
  );
}

function assertDebugStatsShape(stats) {
  assert(stats && typeof stats === "object", "engineDebugGetStats must return an object");
  assert(typeof stats.totalRecords === "bigint", "debug stats totalRecords must be bigint");
  assert(typeof stats.totalDropped === "bigint", "debug stats totalDropped must be bigint");
  assert(typeof stats.errorCount === "number", "debug stats errorCount must be number");
  assert(typeof stats.warnCount === "number", "debug stats warnCount must be number");
  assert(typeof stats.currentRingUsage === "number", "debug stats currentRingUsage must be number");
  assert(typeof stats.ringCapacity === "number", "debug stats ringCapacity must be number");
}

function readU64LE(bytes, offset) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getBigUint64(offset, true);
}

// Unknown / stale id behavior (result-returning functions).
assert(
  enginePresent(0) === ZR_ERR_INVALID_ARGUMENT,
  "enginePresent(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  enginePresent(0x7fff_fffe) === ZR_ERR_INVALID_ARGUMENT,
  "enginePresent(unknown) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  engineSetConfig(0, { targetFps: 30 }) === ZR_ERR_INVALID_ARGUMENT,
  "engineSetConfig(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  enginePostUserEvent(0, 1, new Uint8Array([1])) === ZR_ERR_INVALID_ARGUMENT,
  "enginePostUserEvent(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  engineDebugEnable(0, { enabled: true }) === ZR_ERR_INVALID_ARGUMENT,
  "engineDebugEnable(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  engineDebugDisable(0) === ZR_ERR_INVALID_ARGUMENT,
  "engineDebugDisable(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  engineDebugExport(0, new Uint8Array(64)) === ZR_ERR_INVALID_ARGUMENT,
  "engineDebugExport(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assert(
  engineDebugReset(0) === ZR_ERR_INVALID_ARGUMENT,
  "engineDebugReset(0) must return ZR_ERR_INVALID_ARGUMENT",
);
assertThrows(
  () => engineGetMetrics(0),
  INVALID_ARG_ERROR_RE,
  "engineGetMetrics(0) must throw invalid-arg",
);
assertThrows(
  () => engineDebugQuery(0, null, new Uint8Array(40)),
  INVALID_ARG_ERROR_RE,
  "engineDebugQuery(0) must throw invalid-arg",
);
assertThrows(
  () => engineDebugGetStats(0),
  INVALID_ARG_ERROR_RE,
  "engineDebugGetStats(0) must throw invalid-arg",
);
assertThrows(
  () => engineDebugGetPayload(0, 0n, new Uint8Array(16)),
  INVALID_ARG_ERROR_RE,
  "engineDebugGetPayload(0) must throw invalid-arg",
);

const engineId = engineCreate({});

assert(typeof engineId === "number", "engineCreate must return a number");
if (engineId === ZR_ERR_PLATFORM || engineId === ZR_ERR_INVALID_ARGUMENT) {
  process.stdout.write(
    `native-smoke: SKIP engineCreate() deep checks (engineCreate returned ${engineId}; stdout.isTTY=${String(process.stdout.isTTY)} stdin.isTTY=${String(process.stdin.isTTY)})\n`,
  );
  process.exit(0);
}
assert(engineId > 0, `engineCreate must return a non-zero engineId, got: ${engineId}`);

assert(
  engineSetConfig(engineId, null) === ZR_ERR_INVALID_ARGUMENT,
  "engineSetConfig(null) must return ZR_ERR_INVALID_ARGUMENT",
);
assertThrows(
  () => engineSetConfig(engineId, { unknownKey: 1 }),
  /unknown key/i,
  "engineSetConfig with unknown key must throw",
);
assert(
  engineSetConfig(engineId, {
    targetFps: 30,
    enableScrollOptimizations: true,
    waitForOutputDrain: false,
    plat: { enableMouse: true, enableBracketedPaste: true },
  }) === ZR_OK,
  "engineSetConfig(valid config) must return ZR_OK",
);

const metricsBefore = engineGetMetrics(engineId);
assertMetricsShape(metricsBefore);
assert(
  enginePresent(engineId) === ZR_OK,
  "enginePresent(owner-thread) must return ZR_OK after successful create",
);
const metricsAfter = engineGetMetrics(engineId);
assertMetricsShape(metricsAfter);
assert(metricsAfter.frameIndex >= metricsBefore.frameIndex, "metrics.frameIndex must be monotonic");

assert(
  engineDebugEnable(engineId, {
    enabled: true,
    ringCapacity: 256,
    minSeverity: 0,
    categoryMask: 0xffff_ffff,
  }) === ZR_OK,
  "engineDebugEnable(valid config) must return ZR_OK",
);
assertThrows(
  () => engineDebugQuery(engineId, { bogus: true }, new Uint8Array(40)),
  /unknown key/i,
  "engineDebugQuery with unknown key must throw",
);

assert(
  enginePostUserEvent(engineId, 0xbeef, new Uint8Array([1, 2, 3, 4])) === ZR_OK,
  "enginePostUserEvent(owner-thread) must return ZR_OK",
);

const headers = new Uint8Array(40 * 8);
const query = engineDebugQuery(engineId, { maxRecords: 8 }, headers);
assert(query && typeof query === "object", "engineDebugQuery must return an object");
assert(
  typeof query.recordsReturned === "number" &&
    query.recordsReturned >= 0 &&
    query.recordsReturned <= 8,
  "engineDebugQuery.recordsReturned must be in [0, 8]",
);
assert(
  typeof query.recordsAvailable === "number" && query.recordsAvailable >= 0,
  "engineDebugQuery.recordsAvailable must be non-negative",
);
assert(typeof query.oldestRecordId === "bigint", "engineDebugQuery.oldestRecordId must be bigint");
assert(typeof query.newestRecordId === "bigint", "engineDebugQuery.newestRecordId must be bigint");
assert(
  typeof query.recordsDropped === "number" && query.recordsDropped >= 0,
  "engineDebugQuery.recordsDropped must be non-negative",
);

const payloadOut = new Uint8Array(1024);
const firstRecordId = query.recordsReturned > 0 ? readU64LE(headers, 0) : 0n;
const payloadBytes = engineDebugGetPayload(engineId, firstRecordId, payloadOut);
assert(
  Number.isInteger(payloadBytes),
  "engineDebugGetPayload must return an integer byte count/result code",
);
if (payloadBytes >= 0) {
  assert(
    payloadBytes <= payloadOut.byteLength,
    "engineDebugGetPayload bytes must fit output buffer",
  );
}

const debugStats = engineDebugGetStats(engineId);
assertDebugStatsShape(debugStats);

const exportedBytes = engineDebugExport(engineId, new Uint8Array(64 * 1024));
assert(Number.isInteger(exportedBytes), "engineDebugExport must return integer bytes/result code");
if (exportedBytes >= 0) {
  assert(exportedBytes <= 64 * 1024, "engineDebugExport bytes must fit output buffer");
}

assert(engineDebugReset(engineId) === ZR_OK, "engineDebugReset must return ZR_OK");
assert(engineDebugDisable(engineId) === ZR_OK, "engineDebugDisable must return ZR_OK");

const worker = new Worker(new URL("./smoke-worker.mjs", import.meta.url), {
  workerData: { engineId },
  type: "module",
});

const alive = await new Promise((resolve, reject) => {
  const onExit = (code) => reject(new Error(`worker exited with ${code}`));
  const onError = (err) => reject(err);
  const onMessage = (msg) => {
    worker.off("exit", onExit);
    worker.off("error", onError);
    resolve(msg);
  };
  worker.once("exit", onExit);
  worker.once("error", onError);
  worker.once("message", onMessage);
});

assert(alive.phase === "alive", "worker must send alive phase");
assert(
  alive.present === ZR_ERR_INVALID_ARGUMENT,
  `wrong-thread enginePresent must return ZR_ERR_INVALID_ARGUMENT, got: ${alive.present}`,
);
assert(
  alive.postUserEvent === ZR_OK,
  `enginePostUserEvent must succeed cross-thread while alive (ZR_OK), got: ${alive.postUserEvent}`,
);
assert(
  alive.setConfig === ZR_ERR_INVALID_ARGUMENT,
  `wrong-thread engineSetConfig must return ZR_ERR_INVALID_ARGUMENT, got: ${alive.setConfig}`,
);
assert(
  alive.debugDisable === ZR_ERR_INVALID_ARGUMENT,
  `wrong-thread engineDebugDisable must return ZR_ERR_INVALID_ARGUMENT, got: ${alive.debugDisable}`,
);

engineDestroy(engineId);
engineDestroy(engineId); // idempotent

worker.postMessage({ type: "afterDestroy" });

const destroyed = await new Promise((resolve, reject) => {
  const onExit = (code) => reject(new Error(`worker exited with ${code}`));
  const onError = (err) => reject(err);
  const onMessage = (msg) => {
    worker.off("exit", onExit);
    worker.off("error", onError);
    resolve(msg);
  };
  worker.once("exit", onExit);
  worker.once("error", onError);
  worker.once("message", onMessage);
});

assert(destroyed.phase === "destroyed", "worker must send destroyed phase");
assert(
  destroyed.postUserEvent === ZR_ERR_INVALID_ARGUMENT,
  `postUserEvent after destroy must return ZR_ERR_INVALID_ARGUMENT, got: ${destroyed.postUserEvent}`,
);

await worker.terminate();

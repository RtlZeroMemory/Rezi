import { parentPort, workerData } from "node:worker_threads";
import {
  engineDebugDisable,
  enginePostUserEvent,
  enginePresent,
  engineSetConfig,
} from "../index.js";

const { engineId } = workerData;

if (!parentPort) {
  throw new Error("smoke-worker: missing parentPort");
}

const res1 = enginePresent(engineId);
const res2 = enginePostUserEvent(engineId, 123, new Uint8Array([1, 2, 3]));
const res3 = engineSetConfig(engineId, { targetFps: 33 });
const res4 = engineDebugDisable(engineId);
parentPort.postMessage({
  phase: "alive",
  present: res1,
  postUserEvent: res2,
  setConfig: res3,
  debugDisable: res4,
});

parentPort.on("message", (msg) => {
  if (msg?.type !== "afterDestroy") return;
  const res = enginePostUserEvent(engineId, 456, new Uint8Array([9]));
  parentPort.postMessage({ phase: "destroyed", postUserEvent: res });
});

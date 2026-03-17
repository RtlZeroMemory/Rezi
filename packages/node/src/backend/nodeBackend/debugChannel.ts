import type { DebugQueryResult, DebugStats } from "@rezi-ui/core";
import type { PerfSnapshotWire } from "../../worker/protocol.js";
import type { Deferred } from "./shared.js";

export type NodeBackendDebugChannelState = {
  debugChain: Promise<void>;
  debugEnableDef: Deferred<number> | null;
  debugDisableDef: Deferred<number> | null;
  debugQueryDef: Deferred<{ headers: Uint8Array; result: DebugQueryResult }> | null;
  debugGetPayloadDef: Deferred<Uint8Array | null> | null;
  debugGetStatsDef: Deferred<DebugStats> | null;
  debugExportDef: Deferred<Uint8Array> | null;
  debugResetDef: Deferred<number> | null;
  perfSnapshotDef: Deferred<PerfSnapshotWire> | null;
};

export function createNodeBackendDebugChannelState(): NodeBackendDebugChannelState {
  return {
    debugChain: Promise.resolve(),
    debugEnableDef: null,
    debugDisableDef: null,
    debugQueryDef: null,
    debugGetPayloadDef: null,
    debugGetStatsDef: null,
    debugExportDef: null,
    debugResetDef: null,
    perfSnapshotDef: null,
  };
}

export function rejectDebugWaiters(state: NodeBackendDebugChannelState, err: Error): void {
  state.debugEnableDef?.reject(err);
  state.debugEnableDef = null;
  state.debugDisableDef?.reject(err);
  state.debugDisableDef = null;
  state.debugQueryDef?.reject(err);
  state.debugQueryDef = null;
  state.debugGetPayloadDef?.reject(err);
  state.debugGetPayloadDef = null;
  state.debugGetStatsDef?.reject(err);
  state.debugGetStatsDef = null;
  state.debugExportDef?.reject(err);
  state.debugExportDef = null;
  state.debugResetDef?.reject(err);
  state.debugResetDef = null;
  state.perfSnapshotDef?.reject(err);
  state.perfSnapshotDef = null;
}

export function enqueueDebug<T>(
  state: NodeBackendDebugChannelState,
  fn: () => Promise<T>,
): Promise<T> {
  const p = state.debugChain.then(fn, fn);
  state.debugChain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

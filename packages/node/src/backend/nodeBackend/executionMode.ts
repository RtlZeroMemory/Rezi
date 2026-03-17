import { existsSync } from "node:fs";
import type { WorkerOptions } from "node:worker_threads";
import { ZrUiError } from "@rezi-ui/core";
import type {
  NodeBackendExecutionModeSelection,
  NodeBackendExecutionModeSelectionInput,
} from "./shared.js";

export type WorkerEntryResolution = Readonly<{
  entry: URL;
  options: WorkerOptions;
}>;

export function resolveWorkerEntry(workerData: WorkerOptions["workerData"]): WorkerEntryResolution {
  const options: WorkerOptions = { workerData };
  const workerEntryJs = new URL("../../worker/engineWorker.js", import.meta.url);
  if (existsSync(workerEntryJs)) {
    return { entry: workerEntryJs, options };
  }

  // Source-mode worktrees do not emit sibling .js worker files under src.
  // Use a JS bootstrap that registers tsx and then imports engineWorker.ts.
  const workerEntryBootstrapJs = new URL("../../worker/engineWorker.bootstrap.js", import.meta.url);
  if (existsSync(workerEntryBootstrapJs)) {
    return { entry: workerEntryBootstrapJs, options };
  }

  throw new ZrUiError(
    "ZRUI_BACKEND_ERROR",
    "Unable to locate worker entry (expected engineWorker.js or engineWorker.bootstrap.js)",
  );
}

export function hasInteractiveTty(): boolean {
  return (
    process.stdin.isTTY === true || process.stdout.isTTY === true || process.stderr.isTTY === true
  );
}

export function selectNodeBackendExecutionMode(
  input: NodeBackendExecutionModeSelectionInput,
): NodeBackendExecutionModeSelection {
  const { requestedExecutionMode, fpsCap } = input;
  const resolvedExecutionMode: "worker" | "inline" =
    requestedExecutionMode === "inline"
      ? "inline"
      : requestedExecutionMode === "worker"
        ? "worker"
        : fpsCap <= 30
          ? "inline"
          : "worker";
  return {
    resolvedExecutionMode,
    selectedExecutionMode: resolvedExecutionMode,
    fallbackReason: null,
  };
}

export function assertWorkerEnvironmentSupported(nativeShimModule: string | undefined): void {
  if (nativeShimModule !== undefined) return;
  if (hasInteractiveTty()) return;
  throw new ZrUiError(
    "ZRUI_BACKEND_ERROR",
    'Worker backend requires a TTY when using @rezi-ui/native. Use `executionMode: "inline"` for headless runs or pass `nativeShimModule` in test harnesses.',
  );
}

import type React from "react";
import reconciler from "./reconciler/hostConfig.js";
import type { HostRoot } from "./reconciler/types.js";

export type RootContainer = ReturnType<typeof reconciler.createContainer>;

type RuntimeReconciler = Readonly<{
  createContainer: (
    containerInfo: HostRoot,
    tag: number,
    hydrationCallbacks: null,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null | boolean,
    identifierPrefix: string,
    onUncaughtError: (error: Error) => void,
    onCaughtError: (error: Error) => void,
    onRecoverableError: (error: Error) => void,
    transitionCallbacks: null,
  ) => RootContainer;
  updateContainer: (
    element: unknown,
    container: RootContainer,
    parentComponent: null,
    callback: (() => void) | null,
  ) => unknown;
  updateContainerSync?: (
    element: unknown,
    container: RootContainer,
    parentComponent: null,
    callback: (() => void) | null,
  ) => unknown;
  flushSyncFromReconciler?: (fn: () => void) => unknown;
  flushSyncWork?: () => unknown;
}>;

const runtimeReconciler = reconciler as unknown as RuntimeReconciler;
const noop = () => {};
type ContainerErrorState = { error: Error | null };
const containerErrors = new WeakMap<RootContainer, ContainerErrorState>();

function captureContainerError(container: RootContainer, error: unknown): void {
  const state = containerErrors.get(container);
  if (!state || state.error !== null) return;
  state.error = error instanceof Error ? error : new Error(String(error));
}

export function flushAllUpdates(maxIterations = 100): void {
  for (let i = 0; i < maxIterations; i++) {
    const didSync = runtimeReconciler.flushSyncWork?.() === true;
    const didPassive = reconciler.flushPassiveEffects() === true;
    if (!didSync && !didPassive) break;
  }
}

export function runWithSyncPriority(fn: () => void): void {
  if (typeof runtimeReconciler.flushSyncFromReconciler === "function") {
    runtimeReconciler.flushSyncFromReconciler(fn);
  } else {
    fn();
  }
  flushAllUpdates();
}

export function createRootContainer(root: HostRoot, identifierPrefix = "id"): RootContainer {
  let container: RootContainer | null = null;
  const handleError = (error: Error) => {
    if (!container) return;
    captureContainerError(container, error);
  };

  container = runtimeReconciler.createContainer(
    root,
    0,
    null,
    false,
    null,
    identifierPrefix,
    handleError,
    handleError,
    handleError,
    undefined as unknown as null,
  );

  containerErrors.set(container, { error: null });
  return container;
}

export function updateRootContainer(
  container: RootContainer,
  element: React.ReactNode | null,
  callback: (() => void) | null = noop,
): void {
  const state = containerErrors.get(container);
  if (state) state.error = null;

  if (typeof runtimeReconciler.updateContainerSync === "function") {
    runtimeReconciler.updateContainerSync(element, container, null, null);
  } else {
    runtimeReconciler.updateContainer(element, container, null, null);
  }

  flushAllUpdates();

  if (state?.error) {
    const error = state.error;
    state.error = null;
    throw error;
  }

  callback?.();
}

export default reconciler;
export type {
  HostContext,
  HostElement,
  HostNode,
  HostRoot,
  HostText,
  HostType,
} from "./reconciler/types.js";

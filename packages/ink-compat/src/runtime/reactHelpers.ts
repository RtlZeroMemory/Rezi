import type React from "react";

import { reconciler } from "../reconciler/reconciler.js";

export type ReactRootErrorHandler = (err: unknown) => void;

function throwRootError(err: unknown): never {
  if (err instanceof Error) {
    throw err;
  }
  throw new Error(String(err));
}

export function createReactRoot(
  rootNode: unknown,
  onError: ReactRootErrorHandler = throwRootError,
): unknown {
  // Pass onError to all three error callback slots:
  // arg7 = onUncaughtError, arg8 = onCaughtError, arg9 = onRecoverableError
  return reconciler.createContainer(
    rootNode,
    0,
    null,
    false,
    null,
    "",
    onError,
    onError,
    onError,
    null,
  );
}

export function commitSync(container: unknown, element: React.ReactNode): void {
  if (typeof reconciler.updateContainerSync === "function") {
    reconciler.updateContainerSync(element, container, null, null);
    reconciler.flushSyncWork?.();
    reconciler.flushPassiveEffects?.();
    return;
  }

  reconciler.updateContainer(element, container, null, () => {});
}

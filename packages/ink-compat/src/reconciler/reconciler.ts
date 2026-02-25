import ReactReconciler from "react-reconciler";

import { hostConfig } from "./hostConfig.js";

export type ReconcilerHandle = {
  createContainer: (...args: unknown[]) => unknown;
  updateContainer: (...args: unknown[]) => void;
  updateContainerSync?: (...args: unknown[]) => void;
  flushSyncWork?: () => void;
  flushPassiveEffects?: () => boolean;
};

export const reconciler = ReactReconciler(hostConfig as never) as unknown as ReconcilerHandle;

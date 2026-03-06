export type ProcessLike = Readonly<{
  on?: ((event: string, handler: (...args: unknown[]) => void) => unknown) | undefined;
  off?: ((event: string, handler: (...args: unknown[]) => void) => unknown) | undefined;
  removeListener?: ((event: string, handler: (...args: unknown[]) => void) => unknown) | undefined;
  exit?: ((code?: number) => void) | undefined;
}>;

export type RunSignalController = Readonly<{
  canRegisterSignals: boolean;
  detach: () => void;
  promise: Promise<void>;
  settle: () => void;
}>;

type CreateRunSignalControllerOptions = Readonly<{
  onDetached?: (() => void) | undefined;
  onSignal: () => Promise<void> | void;
  processLike: ProcessLike | null;
  signals?: readonly string[];
}>;

const DEFAULT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export function readProcessLike(): ProcessLike | null {
  const processRef = (
    globalThis as {
      process?: {
        on?: (event: string, handler: (...args: unknown[]) => void) => unknown;
        off?: (event: string, handler: (...args: unknown[]) => void) => unknown;
        removeListener?: (event: string, handler: (...args: unknown[]) => void) => unknown;
        exit?: (code?: number) => void;
      };
    }
  ).process;
  if (!processRef || typeof processRef !== "object") return null;
  return processRef;
}

export function removeSignalHandler(
  proc: ProcessLike,
  signal: string,
  handler: (...args: unknown[]) => void,
): void {
  if (typeof proc.off === "function") {
    proc.off(signal, handler);
    return;
  }
  if (typeof proc.removeListener === "function") {
    proc.removeListener(signal, handler);
  }
}

export function createRunSignalController(
  options: CreateRunSignalControllerOptions,
): RunSignalController {
  const proc = options.processLike;
  const addSignalHandler =
    proc !== null && typeof proc.on === "function" ? proc.on.bind(proc) : null;
  const listeners: Array<Readonly<{ signal: string; handler: (...args: unknown[]) => void }>> = [];
  let detached = false;
  let settled = false;

  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const detach = (): void => {
    if (detached) return;
    detached = true;
    if (proc) {
      for (const entry of listeners) {
        removeSignalHandler(proc, entry.signal, entry.handler);
      }
    }
    listeners.length = 0;
    options.onDetached?.();
  };

  const settle = (): void => {
    if (settled) return;
    settled = true;
    detach();
    resolvePromise();
  };

  if (addSignalHandler !== null) {
    for (const signal of options.signals ?? DEFAULT_SIGNALS) {
      const handler = () => {
        if (settled) return;
        settled = true;
        detach();
        void Promise.resolve()
          .then(() => options.onSignal())
          .catch(() => undefined)
          .finally(() => {
            resolvePromise();
          });
      };
      listeners.push(Object.freeze({ signal, handler }));
      addSignalHandler(signal, handler);
    }
  }

  return {
    canRegisterSignals: addSignalHandler !== null,
    detach,
    promise,
    settle,
  };
}

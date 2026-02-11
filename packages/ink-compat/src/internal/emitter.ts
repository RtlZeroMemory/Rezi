import { runWithSyncPriority } from "../reconciler.js";

export type Listener<T> = (value: T) => void;

export type InputEventEmitter<T> = Readonly<{
  on: (event: "input", listener: Listener<T>) => void;
  removeListener: (event: "input", listener: Listener<T>) => void;
  emit: (event: "input", value: T) => void;
}>;

export function createInputEventEmitter<T>(): InputEventEmitter<T> {
  const listeners = new Set<Listener<T>>();

  return Object.freeze({
    on(event, listener) {
      if (event !== "input") return;
      listeners.add(listener);
    },
    removeListener(event, listener) {
      if (event !== "input") return;
      listeners.delete(listener);
    },
    emit(event, value) {
      if (event !== "input") return;
      // Snapshot listeners so mutation during emit doesn't change delivery order.
      // This mirrors EventEmitter behavior where newly-added listeners are not
      // called for the current emit cycle.
      const snapshot = [...listeners];
      runWithSyncPriority(() => {
        for (const fn of snapshot) fn(value);
      });
    },
  });
}

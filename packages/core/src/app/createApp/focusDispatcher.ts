export type FocusDispatcher<T> = Readonly<{
  emitIfChanged: () => boolean;
  getLastEmittedId: () => string | null;
  register: (handler: (info: T) => void) => () => void;
}>;

type FocusHandlerSlot<T> = Readonly<{ fn: (info: T) => void; active: { value: boolean } }>;

type CreateFocusDispatcherOptions<T> = Readonly<{
  getFocusedId: () => string | null;
  getFocusInfo: () => T;
  initialFocusedId: string | null;
  onHandlerError: (error: unknown) => void;
}>;

export function createFocusDispatcher<T>(
  options: CreateFocusDispatcherOptions<T>,
): FocusDispatcher<T> {
  const handlers: FocusHandlerSlot<T>[] = [];
  let lastEmittedId = options.initialFocusedId;

  return {
    emitIfChanged(): boolean {
      const focusedId = options.getFocusedId();
      if (focusedId === lastEmittedId) return true;
      lastEmittedId = focusedId;

      const info = options.getFocusInfo();
      const snapshot: Array<(info: T) => void> = [];
      for (const slot of handlers) {
        if (slot.active.value) snapshot.push(slot.fn);
      }

      for (const fn of snapshot) {
        try {
          fn(info);
        } catch (error: unknown) {
          options.onHandlerError(error);
          return false;
        }
      }
      return true;
    },

    getLastEmittedId(): string | null {
      return lastEmittedId;
    },

    register(handler: (info: T) => void): () => void {
      const active = { value: true };
      handlers.push({ fn: handler, active });
      return () => {
        active.value = false;
      };
    },
  };
}

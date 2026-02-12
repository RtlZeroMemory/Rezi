import { runWithSyncPriority } from "../reconciler.js";

type InputEventEmitter = Readonly<{
  emit: (event: "input", value: string) => void;
}>;

export function emitInput(emitter: InputEventEmitter, input: string): void {
  runWithSyncPriority(() => {
    emitter.emit("input", input);
  });
}

export function simulateKeyEvent(
  emitter: InputEventEmitter,
  opts: Readonly<{ input: string }>,
): void {
  emitInput(emitter, opts.input);
}

export function simulateTextEvent(
  emitter: InputEventEmitter,
  opts: Readonly<{ input: string }>,
): void {
  emitInput(emitter, opts.input);
}

export function simulatePasteEvent(
  emitter: InputEventEmitter,
  opts: Readonly<{ input: string }>,
): void {
  emitInput(emitter, opts.input);
}

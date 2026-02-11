import type { UiEvent, ZrevEvent } from "@rezi-ui/core";
import type { InputEventEmitter } from "../internal/emitter.js";
import { flushAllUpdates } from "../reconciler.js";

export function emitEngineEvent(emitter: InputEventEmitter<UiEvent>, event: ZrevEvent): void {
  emitter.emit("input", { kind: "engine", event });
  flushAllUpdates();
}

export function simulateKeyEvent(
  emitter: InputEventEmitter<UiEvent>,
  opts: Readonly<{
    key: number;
    mods?: number;
    action?: "down" | "up" | "repeat";
    timeMs?: number;
  }>,
): void {
  emitEngineEvent(emitter, {
    kind: "key",
    timeMs: opts.timeMs ?? 0,
    key: opts.key,
    mods: opts.mods ?? 0,
    action: opts.action ?? "down",
  });
}

export function simulateTextEvent(
  emitter: InputEventEmitter<UiEvent>,
  opts: Readonly<{ codepoint: number; timeMs?: number }>,
): void {
  emitEngineEvent(emitter, { kind: "text", timeMs: opts.timeMs ?? 0, codepoint: opts.codepoint });
}

export function simulatePasteEvent(
  emitter: InputEventEmitter<UiEvent>,
  opts: Readonly<{ text: string; timeMs?: number }>,
): void {
  emitEngineEvent(emitter, {
    kind: "paste",
    timeMs: opts.timeMs ?? 0,
    bytes: new TextEncoder().encode(opts.text),
  });
}

/**
 * Module-level trace collector for the translation layer.
 *
 * render.ts sets up a drain callback via `setTranslationTraceDrain()`.
 * propsToVNode.ts and colorMap.ts push entries via `pushTranslationTrace()`.
 * render.ts flushes after each `translateToVNode()` call.
 */

export interface TranslationTraceEntry {
  kind: string;
  [key: string]: unknown;
}

const buffer: TranslationTraceEntry[] = [];
let enabled = false;

export function enableTranslationTrace(on: boolean): void {
  enabled = on;
}

export function isTranslationTraceEnabled(): boolean {
  return enabled;
}

export function pushTranslationTrace(entry: TranslationTraceEntry): void {
  if (!enabled) return;
  buffer.push(entry);
}

export function flushTranslationTrace(): readonly TranslationTraceEntry[] {
  if (buffer.length === 0) return [];
  const snapshot = buffer.slice();
  buffer.length = 0;
  return snapshot;
}

/**
 * Temporary: Profile layout engine behavior for ink-compat VNode trees.
 * Adds counters and timing to layout internals.
 *
 * Usage: GEMINI_BENCH_NODE_ARGS="--prof" in pty-run.py, then
 *   node --prof-process isolate-*.log > profile.txt
 *
 * Or: run directly with a captured VNode tree.
 */
import { performance } from "node:perf_hooks";

// Counters for profiling the layout pass
export const layoutCounters = {
  layoutNodeCalls: 0,
  measureNodeCalls: 0,
  measureCacheHits: 0,
  layoutCacheHits: 0,
  constraintPassCount: 0,
  textMeasureCalls: 0,
  textMeasureTotalChars: 0,
  textMeasureTotalMs: 0,
  stackLayoutCalls: 0,
  leafLayoutCalls: 0,
  frameCount: 0,
};

export function resetLayoutCounters(): void {
  layoutCounters.layoutNodeCalls = 0;
  layoutCounters.measureNodeCalls = 0;
  layoutCounters.measureCacheHits = 0;
  layoutCounters.layoutCacheHits = 0;
  layoutCounters.constraintPassCount = 0;
  layoutCounters.textMeasureCalls = 0;
  layoutCounters.textMeasureTotalChars = 0;
  layoutCounters.textMeasureTotalMs = 0;
  layoutCounters.stackLayoutCalls = 0;
  layoutCounters.leafLayoutCalls = 0;
  layoutCounters.frameCount += 1;
}

export function dumpLayoutCounters(label: string): string {
  const c = layoutCounters;
  return [
    `=== Layout Profile: ${label} ===`,
    `  layoutNode calls: ${c.layoutNodeCalls}`,
    `  measureNode calls: ${c.measureNodeCalls}`,
    `  measure cache hits: ${c.measureCacheHits}`,
    `  layout cache hits: ${c.layoutCacheHits}`,
    `  constraint pass count: ${c.constraintPassCount}`,
    `  stack layout calls: ${c.stackLayoutCalls}`,
    `  leaf layout calls: ${c.leafLayoutCalls}`,
    `  text measure calls: ${c.textMeasureCalls}`,
    `  text measure total chars: ${c.textMeasureTotalChars}`,
    `  text measure total ms: ${c.textMeasureTotalMs.toFixed(3)}`,
  ].join("\n");
}

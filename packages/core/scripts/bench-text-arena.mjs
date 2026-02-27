#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { FrameTextArena } from "../dist/drawlist/textArena.js";

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const SEGMENTS = parsePositiveInt("SEGMENTS", 20_000);
const ITERATIONS = parsePositiveInt("ITERATIONS", 40);
const WARMUP = parsePositiveInt("WARMUP", 5);

function makeSegments(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const level = i % 3 === 0 ? "INFO" : i % 3 === 1 ? "WARN" : "ERR";
    out.push(
      `${String(i).padStart(6, "0")} ${level} worker-${i % 17}: event-${1000 + (i % 200)} / caf\u00e9 / \u6f22\u5b57 / \ud83d\ude00`,
    );
  }
  return out;
}

function legacyEncodeFrame(strings) {
  const encoder = new TextEncoder();
  const chunks = new Array(strings.length);
  let totalBytes = 0;
  for (let i = 0; i < strings.length; i++) {
    const chunk = encoder.encode(strings[i] ?? "");
    chunks[i] = chunk;
    totalBytes += chunk.byteLength;
  }

  const out = new Uint8Array(totalBytes);
  let off = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    out.set(chunk, off);
    off += chunk.byteLength;
  }

  return {
    bytes: out.byteLength,
    encoderCalls: strings.length,
    textSegments: strings.length,
    estimatedAllocations: strings.length + 1,
  };
}

function arenaEncodeFrame(strings) {
  const arena = new FrameTextArena(new TextEncoder(), 1024);
  for (let i = 0; i < strings.length; i++) {
    arena.allocUtf8(strings[i] ?? "");
  }
  const counters = arena.counters();
  return {
    bytes: arena.bytes().byteLength,
    encoderCalls: counters.textEncoderCalls,
    textSegments: counters.textSegments,
    estimatedAllocations: 1,
  };
}

function bench(label, iterations, warmup, runOnce) {
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error(`bench(${label}): iterations must be > 0 (got ${String(iterations)})`);
  }

  for (let i = 0; i < warmup; i++) runOnce();

  const t0 = performance.now();
  let last = null;
  for (let i = 0; i < iterations; i++) {
    last = runOnce();
  }
  const t1 = performance.now();

  const totalMs = t1 - t0;
  const avgMs = totalMs / iterations;
  return {
    label,
    iterations,
    totalMs,
    avgMs,
    last,
  };
}

const strings = makeSegments(SEGMENTS);

const legacy = bench("legacy_per_string_encode", ITERATIONS, WARMUP, () =>
  legacyEncodeFrame(strings),
);
const arena = bench("arena_encode_into", ITERATIONS, WARMUP, () => arenaEncodeFrame(strings));

const legacyAlloc = legacy.last?.estimatedAllocations ?? 0;
const arenaAlloc = arena.last?.estimatedAllocations ?? 0;
const allocReductionPct = legacyAlloc === 0 ? 0 : ((legacyAlloc - arenaAlloc) / legacyAlloc) * 100;
const speedup = arena.avgMs === 0 ? 0 : legacy.avgMs / arena.avgMs;

console.log(`segments=${SEGMENTS} iterations=${ITERATIONS} warmup=${WARMUP}`);
console.log("---");
console.log(
  `${legacy.label}: avg_ms=${legacy.avgMs.toFixed(3)} total_ms=${legacy.totalMs.toFixed(1)} encoder_calls=${String(legacy.last?.encoderCalls ?? 0)} bytes=${String(legacy.last?.bytes ?? 0)} est_allocs=${String(legacyAlloc)}`,
);
console.log(
  `${arena.label}: avg_ms=${arena.avgMs.toFixed(3)} total_ms=${arena.totalMs.toFixed(1)} encoder_calls=${String(arena.last?.encoderCalls ?? 0)} bytes=${String(arena.last?.bytes ?? 0)} text_segments=${String(arena.last?.textSegments ?? 0)} est_allocs=${String(arenaAlloc)}`,
);
console.log("---");
console.log(
  `allocation_reduction_est=${allocReductionPct.toFixed(1)}% speedup=${speedup.toFixed(2)}x (higher is faster)`,
);
console.log("tip: run with node --trace-gc scripts/bench-text-arena.mjs for GC traces");

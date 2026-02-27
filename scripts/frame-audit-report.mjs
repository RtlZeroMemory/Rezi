#!/usr/bin/env node
/**
 * scripts/frame-audit-report.mjs — Quick analyzer for REZI_FRAME_AUDIT NDJSON logs.
 *
 * Usage:
 *   node scripts/frame-audit-report.mjs /tmp/rezi-frame-audit.ndjson
 */

import fs from "node:fs";

function usage() {
  process.stderr.write(
    "Usage: node scripts/frame-audit-report.mjs <audit-log.ndjson> [--pid=<n>|--latest-pid]\n",
  );
}

const argv = process.argv.slice(2);
const file = argv[0];
if (!file) {
  usage();
  process.exit(1);
}

let pidFilter = null;
let latestPidOnly = false;
for (const arg of argv.slice(1)) {
  if (arg === "--latest-pid") {
    latestPidOnly = true;
    continue;
  }
  if (arg.startsWith("--pid=")) {
    const n = Number(arg.slice("--pid=".length));
    if (Number.isInteger(n) && n > 0) {
      pidFilter = n;
      continue;
    }
  }
  usage();
  process.exit(1);
}

let text = "";
try {
  text = fs.readFileSync(file, "utf8");
} catch (err) {
  process.stderr.write(`Failed to read ${file}: ${String(err)}\n`);
  process.exit(1);
}

const lines = text.split(/\r?\n/);
let records = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  try {
    const rec = JSON.parse(trimmed);
    if (rec && typeof rec === "object") records.push(rec);
  } catch {
    // ignore malformed lines
  }
}

const recordsByPid = new Map();
for (const rec of records) {
  if (!Number.isInteger(rec.pid)) continue;
  const pid = rec.pid;
  const state = recordsByPid.get(pid) ?? {
    count: 0,
    firstTs: null,
    lastTs: null,
    modes: new Set(),
  };
  state.count += 1;
  if (typeof rec.ts === "string") {
    if (state.firstTs === null || rec.ts < state.firstTs) state.firstTs = rec.ts;
    if (state.lastTs === null || rec.ts > state.lastTs) state.lastTs = rec.ts;
  }
  if (typeof rec.executionMode === "string" && rec.executionMode.length > 0) {
    state.modes.add(rec.executionMode);
  }
  recordsByPid.set(pid, state);
}

if (latestPidOnly && pidFilter === null) {
  let latest = null;
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    if (Number.isInteger(rec.pid)) {
      latest = rec.pid;
      break;
    }
  }
  pidFilter = latest;
}

if (pidFilter !== null) {
  records = records.filter((rec) => rec.pid === pidFilter);
}

const OPCODE_NAMES = Object.freeze({
  0: "INVALID",
  1: "CLEAR",
  2: "FILL_RECT",
  3: "DRAW_TEXT",
  4: "PUSH_CLIP",
  5: "POP_CLIP",
  6: "DRAW_TEXT_RUN",
  7: "SET_CURSOR",
  8: "DRAW_CANVAS",
  9: "DRAW_IMAGE",
  10: "DEF_STRING",
  11: "FREE_STRING",
  12: "DEF_BLOB",
  13: "FREE_BLOB",
  14: "BLIT_RECT",
});

function routeId(rec, fallback = null) {
  if (typeof rec.route === "string" && rec.route.length > 0) return rec.route;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return "<unknown>";
}

function seqKey(rec) {
  if (!Number.isInteger(rec.frameSeq)) return null;
  const pid = Number.isInteger(rec.pid) ? rec.pid : "nopid";
  return `${pid}:${rec.frameSeq}`;
}

function addOpcodeHistogram(dst, hist) {
  if (typeof hist !== "object" || hist === null) return;
  for (const [k, v] of Object.entries(hist)) {
    const count = Number(v);
    if (!Number.isFinite(count) || count <= 0) continue;
    dst.set(k, (dst.get(k) ?? 0) + count);
  }
}

function createRouteSummary() {
  return {
    framesSubmitted: 0,
    framesCompleted: 0,
    bytesTotal: 0,
    cmdsTotal: 0,
    cmdsSamples: 0,
    invalidCmdStreams: 0,
    opcodeCounts: new Map(),
  };
}

const backendSubmitted = new Map();
const submitPayloadBySeq = new Map();
const completedBySeq = new Map();
const acceptedBySeq = new Map();
const coreBuilt = [];
const coreCompleted = [];
const nativePayload = [];
const nativeSummaries = [];
const nativeHeaders = [];
const stageCounts = new Map();
const globalOpcodeCounts = new Map();
const routeSummaries = new Map();
const routeBySeq = new Map();
const submittedFramesSeen = new Set();
const completedFramesSeen = new Set();

for (const rec of records) {
  const stage = typeof rec.stage === "string" ? rec.stage : "<unknown>";
  stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);

  if ((rec.scope === "backend" || rec.scope === "backend-inline") && stage === "frame.submitted") {
    const key = seqKey(rec);
    if (key !== null) backendSubmitted.set(key, rec);
    const route = routeId(rec);
    if (route !== "<unknown>" && key !== null) routeBySeq.set(key, route);
  }

  if (
    (rec.scope === "worker" || rec.scope === "backend-inline") &&
    stage === "frame.submit.payload"
  ) {
    const key = seqKey(rec);
    if (key !== null) submitPayloadBySeq.set(key, rec);
    addOpcodeHistogram(globalOpcodeCounts, rec.opcodeHistogram);
    const route = routeId(rec, key !== null ? routeBySeq.get(key) : null);
    const summary = routeSummaries.get(route) ?? createRouteSummary();
    addOpcodeHistogram(summary.opcodeCounts, rec.opcodeHistogram);
    routeSummaries.set(route, summary);
  }

  if ((rec.scope === "worker" || rec.scope === "backend-inline") && stage === "frame.accepted") {
    const key = seqKey(rec);
    if (key !== null) acceptedBySeq.set(key, rec);
  }

  if ((rec.scope === "worker" || rec.scope === "backend-inline") && stage === "frame.completed") {
    const key = seqKey(rec);
    if (key !== null) completedBySeq.set(key, rec);
  }

  if (rec.scope === "worker" && stage === "native.drawlist.payload") {
    nativePayload.push(rec);
  }
  if (rec.scope === "worker" && stage === "native.drawlist.summary") {
    nativeSummaries.push(rec);
  }
  if (rec.scope === "worker" && stage === "native.debug.header") {
    nativeHeaders.push(rec);
  }

  if (rec.scope === "core" && stage === "drawlist.built") {
    coreBuilt.push(rec);
  }

  if (rec.scope === "core" && stage === "backend.completed") {
    coreCompleted.push(rec);
  }

  if (stage === "frame.submitted") {
    const key = seqKey(rec);
    if (key !== null && submittedFramesSeen.has(key)) {
      continue;
    }
    if (key !== null) submittedFramesSeen.add(key);
    const route = routeId(rec, key !== null ? routeBySeq.get(key) : null);
    const summary = routeSummaries.get(route) ?? createRouteSummary();
    summary.framesSubmitted += 1;
    if (Number.isFinite(rec.byteLen)) summary.bytesTotal += Number(rec.byteLen);
    if (Number.isFinite(rec.cmdCount)) {
      summary.cmdsTotal += Number(rec.cmdCount);
      summary.cmdsSamples += 1;
    }
    if (rec.cmdStreamValid === false) summary.invalidCmdStreams += 1;
    routeSummaries.set(route, summary);
  }

  if (stage === "frame.completed") {
    const key = seqKey(rec);
    if (key !== null && completedFramesSeen.has(key)) {
      continue;
    }
    if (key !== null) completedFramesSeen.add(key);
    const route = routeId(rec, key !== null ? routeBySeq.get(key) : null);
    const summary = routeSummaries.get(route) ?? createRouteSummary();
    summary.framesCompleted += 1;
    routeSummaries.set(route, summary);
  }
}

let missingWorkerPayload = 0;
let hashMismatch = 0;
let missingAccepted = 0;
let missingCompleted = 0;
let firstMismatch = null;

for (const [key, backend] of backendSubmitted.entries()) {
  const worker = submitPayloadBySeq.get(key);
  if (!worker) {
    missingWorkerPayload++;
    continue;
  }

  if (
    typeof backend.hash32 === "string" &&
    typeof worker.hash32 === "string" &&
    backend.hash32 !== worker.hash32
  ) {
    hashMismatch++;
    if (firstMismatch === null) {
      firstMismatch = {
        frameKey: key,
        backendHash: backend.hash32,
        workerHash: worker.hash32,
        backendByteLen: backend.byteLen,
        workerByteLen: worker.byteLen,
      };
    }
  }

  if (!acceptedBySeq.has(key)) missingAccepted++;
  if (!completedBySeq.has(key)) missingCompleted++;
}

process.stdout.write(`records=${records.length}\n`);
if (pidFilter !== null) {
  process.stdout.write(`pid_filter=${pidFilter}\n`);
}
if (recordsByPid.size > 0) {
  process.stdout.write(`pids=${recordsByPid.size}\n`);
  process.stdout.write("pid_sessions:\n");
  const sessionRows = [...recordsByPid.entries()].sort((a, b) => a[0] - b[0]);
  for (const [pid, s] of sessionRows) {
    const modes = [...s.modes].sort().join("|");
    process.stdout.write(
      `  pid=${pid} records=${s.count} firstTs=${s.firstTs ?? "-"} lastTs=${s.lastTs ?? "-"} modes=${modes}\n`,
    );
  }
}
process.stdout.write(`backend_submitted=${backendSubmitted.size}\n`);
process.stdout.write(`worker_payload=${submitPayloadBySeq.size}\n`);
process.stdout.write(`worker_accepted=${acceptedBySeq.size}\n`);
process.stdout.write(`worker_completed=${completedBySeq.size}\n`);
process.stdout.write(`native_payload_records=${nativePayload.length}\n`);
process.stdout.write(`native_summary_records=${nativeSummaries.length}\n`);
process.stdout.write(`native_header_records=${nativeHeaders.length}\n`);
process.stdout.write(`missing_worker_payload=${missingWorkerPayload}\n`);
process.stdout.write(`hash_mismatch_backend_vs_worker=${hashMismatch}\n`);
process.stdout.write(`missing_worker_accepted=${missingAccepted}\n`);
process.stdout.write(`missing_worker_completed=${missingCompleted}\n`);

if (backendSubmitted.size === 0 && (coreBuilt.length > 0 || coreCompleted.length > 0)) {
  process.stdout.write(
    "hint=core-only audit records detected; backend likely running a path without frame-level backend instrumentation (for example old build or inline mode without updated backend).\n",
  );
}

if (firstMismatch) {
  process.stdout.write(`first_mismatch=${JSON.stringify(firstMismatch)}\n`);
}

const topOpcodes = [...globalOpcodeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
process.stdout.write("top_opcodes:\n");
for (const [opcode, count] of topOpcodes) {
  const name = OPCODE_NAMES[Number(opcode)] ?? `OP_${opcode}`;
  process.stdout.write(`  ${name}(${opcode}): ${count}\n`);
}

const routes = [...routeSummaries.entries()].sort(
  (a, b) => b[1].framesSubmitted - a[1].framesSubmitted,
);
process.stdout.write("route_summary:\n");
for (const [route, summary] of routes) {
  const avgBytes = summary.framesSubmitted > 0 ? summary.bytesTotal / summary.framesSubmitted : 0;
  const avgCmds = summary.cmdsSamples > 0 ? summary.cmdsTotal / summary.cmdsSamples : 0;
  const topRouteOps = [...summary.opcodeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([opcode, count]) => `${OPCODE_NAMES[Number(opcode)] ?? `OP_${opcode}`}=${count}`)
    .join(",");
  process.stdout.write(
    `  ${route}: submitted=${summary.framesSubmitted} completed=${summary.framesCompleted} avgBytes=${avgBytes.toFixed(1)} avgCmds=${avgCmds.toFixed(1)} invalidCmdStreams=${summary.invalidCmdStreams} topOps=${topRouteOps}\n`,
  );
}

const sortedStages = [...stageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
process.stdout.write("top_stages:\n");
for (const [stage, count] of sortedStages) {
  process.stdout.write(`  ${stage}: ${count}\n`);
}

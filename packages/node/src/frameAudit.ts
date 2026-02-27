/**
 * packages/node/src/frameAudit.ts — Optional end-to-end frame audit utilities.
 *
 * Enable with:
 *   REZI_FRAME_AUDIT=1
 *
 * Optional:
 *   REZI_FRAME_AUDIT_LOG=/tmp/rezi-frame-audit.ndjson
 *   REZI_FRAME_AUDIT_NATIVE=1
 *   REZI_FRAME_AUDIT_NATIVE_RING=<bytes>
 *
 * Defaults:
 * - When REZI_FRAME_AUDIT=1 and REZI_FRAME_AUDIT_LOG is unset, records are
 *   written to /tmp/rezi-frame-audit.ndjson to avoid polluting terminal output.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

export type DrawlistFingerprint = Readonly<{
  byteLen: number;
  hash32: string;
  prefixHash32: string;
  cmdCount: number | null;
  totalSize: number | null;
  head16: string;
  tail16: string;
  opcodeHistogram: Readonly<Record<string, number>>;
  cmdStreamValid: boolean;
}>;

type AuditRecord = Readonly<Record<string, unknown>>;

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function envFlag(name: string, fallback = false): boolean {
  const value = readEnv(name);
  if (value === null) return fallback;
  const norm = value.toLowerCase();
  return norm === "1" || norm === "true" || norm === "yes" || norm === "on";
}

function envPositiveInt(name: string, fallback: number): number {
  const value = readEnv(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toHex32(v: number): string {
  return `0x${(v >>> 0).toString(16).padStart(8, "0")}`;
}

function hashFnv1a32(bytes: Uint8Array, end: number): number {
  const n = Math.max(0, Math.min(end, bytes.byteLength));
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sliceHex(bytes: Uint8Array, start: number, end: number): string {
  const s = Math.max(0, Math.min(start, bytes.byteLength));
  const e = Math.max(s, Math.min(end, bytes.byteLength));
  let out = "";
  for (let i = s; i < e; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

function readHeaderU32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  try {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
  } catch {
    return null;
  }
}

function decodeOpcodeHistogram(bytes: Uint8Array): Readonly<{
  histogram: Readonly<Record<string, number>>;
  valid: boolean;
}> {
  const cmdCount = readHeaderU32(bytes, 24);
  const cmdOffset = readHeaderU32(bytes, 16);
  const cmdBytes = readHeaderU32(bytes, 20);
  if (cmdCount === null || cmdOffset === null || cmdBytes === null) {
    return Object.freeze({ histogram: Object.freeze({}), valid: false });
  }
  if (cmdCount === 0) {
    return Object.freeze({ histogram: Object.freeze({}), valid: true });
  }
  if (cmdOffset < 0 || cmdBytes < 0 || cmdOffset + cmdBytes > bytes.byteLength) {
    return Object.freeze({ histogram: Object.freeze({}), valid: false });
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = cmdOffset;
  const end = cmdOffset + cmdBytes;
  const hist: Record<string, number> = Object.create(null) as Record<string, number>;
  for (let i = 0; i < cmdCount; i++) {
    if (off + 8 > end) {
      return Object.freeze({ histogram: Object.freeze(hist), valid: false });
    }
    const opcode = dv.getUint16(off + 0, true);
    const size = dv.getUint32(off + 4, true);
    if (size < 8 || off + size > end) {
      return Object.freeze({ histogram: Object.freeze(hist), valid: false });
    }
    const key = String(opcode);
    hist[key] = (hist[key] ?? 0) + 1;
    off += size;
  }
  return Object.freeze({ histogram: Object.freeze(hist), valid: off === end });
}

function nowUs(): number {
  return Math.round(performance.now() * 1000);
}

const FRAME_AUDIT_ENABLED = envFlag("REZI_FRAME_AUDIT", false);
const FRAME_AUDIT_LOG_PATH =
  readEnv("REZI_FRAME_AUDIT_LOG") ?? (FRAME_AUDIT_ENABLED ? "/tmp/rezi-frame-audit.ndjson" : null);
const FRAME_AUDIT_STDERR_MIRROR = envFlag("REZI_FRAME_AUDIT_STDERR_MIRROR", false);
const FRAME_AUDIT_DUMP_DIR = readEnv("REZI_FRAME_AUDIT_DUMP_DIR");
const FRAME_AUDIT_DUMP_ROUTE = readEnv("REZI_FRAME_AUDIT_DUMP_ROUTE");
const FRAME_AUDIT_DUMP_MAX = envPositiveInt("REZI_FRAME_AUDIT_DUMP_MAX", 0);
let frameAuditDumpCount = 0;

export { FRAME_AUDIT_ENABLED };
export const FRAME_AUDIT_NATIVE_ENABLED =
  FRAME_AUDIT_ENABLED && envFlag("REZI_FRAME_AUDIT_NATIVE", true);
export const FRAME_AUDIT_NATIVE_RING_BYTES = envPositiveInt(
  "REZI_FRAME_AUDIT_NATIVE_RING",
  4 << 20,
);

// Match zr_debug category/code values.
export const ZR_DEBUG_CAT_FRAME = 1;
export const ZR_DEBUG_CAT_DRAWLIST = 3;
export const ZR_DEBUG_CAT_PERF = 6;
export const ZR_DEBUG_CODE_FRAME_BEGIN = 0x0100;
export const ZR_DEBUG_CODE_FRAME_SUBMIT = 0x0101;
export const ZR_DEBUG_CODE_FRAME_PRESENT = 0x0102;
export const ZR_DEBUG_CODE_FRAME_RESIZE = 0x0103;
export const ZR_DEBUG_CODE_DRAWLIST_VALIDATE = 0x0300;
export const ZR_DEBUG_CODE_DRAWLIST_EXECUTE = 0x0301;
export const ZR_DEBUG_CODE_DRAWLIST_CMD = 0x0302;
export const ZR_DEBUG_CODE_PERF_TIMING = 0x0600;
export const ZR_DEBUG_CODE_PERF_DIFF_PATH = 0x0601;

function readContextRoute(): string | null {
  const g = globalThis as {
    __reziFrameAuditContext?: () => Readonly<{ route?: unknown }>;
  };
  if (typeof g.__reziFrameAuditContext !== "function") return null;
  try {
    const ctx = g.__reziFrameAuditContext();
    const route = ctx.route;
    return typeof route === "string" && route.length > 0 ? route : null;
  } catch {
    return null;
  }
}

function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function maybeDumpDrawlistBytes(
  scope: string,
  stage: string,
  frameSeq: number,
  bytes: Uint8Array,
): void {
  if (!FRAME_AUDIT_ENABLED) return;
  if (FRAME_AUDIT_DUMP_DIR === null) return;
  if (FRAME_AUDIT_DUMP_MAX <= 0) return;
  if (frameAuditDumpCount >= FRAME_AUDIT_DUMP_MAX) return;
  const route = readContextRoute();
  if (FRAME_AUDIT_DUMP_ROUTE !== null && route !== FRAME_AUDIT_DUMP_ROUTE) return;
  try {
    mkdirSync(FRAME_AUDIT_DUMP_DIR, { recursive: true });
    const seq = Number.isInteger(frameSeq) && frameSeq > 0 ? frameSeq : 0;
    const routeToken = route ? sanitizeFileToken(route) : "unknown";
    const scopeToken = sanitizeFileToken(scope);
    const stageToken = sanitizeFileToken(stage);
    const stamp = `${Date.now()}`.padStart(13, "0");
    const base = `${stamp}-pid${process.pid}-seq${seq}-${routeToken}-${scopeToken}-${stageToken}`;
    writeFileSync(join(FRAME_AUDIT_DUMP_DIR, `${base}.bin`), bytes);
    const meta = JSON.stringify(
      {
        ts: new Date().toISOString(),
        pid: process.pid,
        frameSeq: seq,
        route,
        scope,
        stage,
        byteLen: bytes.byteLength,
        hash32: toHex32(hashFnv1a32(bytes, bytes.byteLength)),
      },
      null,
      2,
    );
    writeFileSync(join(FRAME_AUDIT_DUMP_DIR, `${base}.json`), `${meta}\n`, "utf8");
    frameAuditDumpCount += 1;
  } catch {
    // Optional diagnostics must never affect runtime behavior.
  }
}

export function drawlistFingerprint(bytes: Uint8Array): DrawlistFingerprint {
  const byteLen = bytes.byteLength;
  const prefixLen = Math.min(4096, byteLen);
  const cmdCount = readHeaderU32(bytes, 24);
  const totalSize = readHeaderU32(bytes, 12);
  const head16 = sliceHex(bytes, 0, Math.min(16, byteLen));
  const tailStart = Math.max(0, byteLen - 16);
  const tail16 = sliceHex(bytes, tailStart, byteLen);
  const decoded = decodeOpcodeHistogram(bytes);
  return Object.freeze({
    byteLen,
    hash32: toHex32(hashFnv1a32(bytes, byteLen)),
    prefixHash32: toHex32(hashFnv1a32(bytes, prefixLen)),
    cmdCount,
    totalSize,
    head16,
    tail16,
    opcodeHistogram: decoded.histogram,
    cmdStreamValid: decoded.valid,
  });
}

export type FrameAuditLogger = Readonly<{
  enabled: boolean;
  emit: (stage: string, fields?: AuditRecord) => void;
}>;

export function createFrameAuditLogger(scope: string): FrameAuditLogger {
  if (!FRAME_AUDIT_ENABLED) {
    return Object.freeze({
      enabled: false,
      emit: () => {},
    });
  }

  const writeLine = (line: string): void => {
    try {
      if (FRAME_AUDIT_LOG_PATH !== null) {
        appendFileSync(FRAME_AUDIT_LOG_PATH, `${line}\n`, "utf8");
        if (!FRAME_AUDIT_STDERR_MIRROR) {
          return;
        }
      } else if (!FRAME_AUDIT_STDERR_MIRROR) {
        return;
      }
      process.stderr.write(`${line}\n`);
    } catch {
      // Optional diagnostics must never affect runtime behavior.
    }
  };
  const g = globalThis as {
    __reziFrameAuditSink?: (line: string) => void;
    __reziFrameAuditContext?: () => Readonly<Record<string, unknown>>;
  };
  if (typeof g.__reziFrameAuditSink !== "function") {
    g.__reziFrameAuditSink = writeLine;
  }

  return Object.freeze({
    enabled: true,
    emit: (stage: string, fields: AuditRecord = Object.freeze({})) => {
      try {
        const context =
          typeof g.__reziFrameAuditContext === "function" ? g.__reziFrameAuditContext() : null;
        const line = JSON.stringify({
          ts: new Date().toISOString(),
          tUs: nowUs(),
          pid: process.pid,
          layer: "node",
          scope,
          stage,
          ...(context ?? {}),
          ...fields,
        });
        writeLine(line);
      } catch {
        // Optional diagnostics must never affect runtime behavior.
      }
    },
  });
}

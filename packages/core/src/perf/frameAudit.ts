/**
 * packages/core/src/perf/frameAudit.ts — Optional drawlist frame-audit logging.
 *
 * Purpose:
 * - Provide deterministic fingerprints for drawlist bytes at core submit points.
 * - Emit lightweight NDJSON records only when explicitly enabled.
 *
 * Enable with:
 *   REZI_FRAME_AUDIT=1
 */

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

function envFlag(name: "REZI_FRAME_AUDIT"): boolean {
  try {
    const g = globalThis as {
      process?: { env?: { REZI_FRAME_AUDIT?: string } };
    };
    const raw = g.process?.env?.[name];
    if (raw === undefined) return false;
    const value = raw.trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
  } catch {
    return false;
  }
}

function nowMs(): number {
  try {
    const g = globalThis as { performance?: { now?: () => number } };
    const fn = g.performance?.now;
    if (typeof fn === "function") return fn.call(g.performance);
  } catch {
    // no-op
  }
  return Date.now();
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

export const FRAME_AUDIT_ENABLED = envFlag("REZI_FRAME_AUDIT");

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

type AuditFields = Readonly<Record<string, unknown>>;

export function emitFrameAudit(scope: string, stage: string, fields: AuditFields): void {
  if (!FRAME_AUDIT_ENABLED) return;
  try {
    const g = globalThis as {
      __reziFrameAuditSink?: (line: string) => void;
      __reziFrameAuditContext?: () => Readonly<Record<string, unknown>>;
      process?: { pid?: number; stderr?: { write?: (text: string) => void } };
      console?: { error?: (msg?: unknown) => void };
    };
    const context =
      typeof g.__reziFrameAuditContext === "function" ? g.__reziFrameAuditContext() : null;
    const pid = g.process?.pid;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      tMs: nowMs(),
      pid: typeof pid === "number" && Number.isInteger(pid) ? pid : undefined,
      layer: "core",
      scope,
      stage,
      ...(context ?? {}),
      ...fields,
    });
    if (typeof g.__reziFrameAuditSink === "function") {
      g.__reziFrameAuditSink(line);
      return;
    }
    if (typeof g.process?.stderr?.write === "function") {
      g.process.stderr.write(`${line}\n`);
      return;
    }
    g.console?.error?.(line);
  } catch {
    // Never break rendering due to optional diagnostics.
  }
}

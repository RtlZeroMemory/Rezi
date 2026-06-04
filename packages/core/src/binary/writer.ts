/**
 * packages/core/src/binary/writer.ts — Bounds-checked binary buffer writer.
 *
 * Why: Provides safe, deterministic writing of little-endian binary data with
 * automatic capacity validation. Every write operation validates available space
 * before mutation, preventing buffer overflows and ensuring build failures are
 * caught early with precise offset reporting.
 *
 * Invariants:
 *   - All multi-byte writes use little-endian byte order
 *   - 4-byte alignment enforced for U32/I32 writes
 *   - Padding bytes are explicitly zeroed (not left as garbage)
 *   - ZrBinaryError thrown on any capacity/alignment violation
 *
 * @see docs/protocol/safety.md
 */

import { ZrBinaryError } from "./parseError.js";

const MAX_WRITER_CAPACITY_BYTES = 16 << 20; /* 16 MiB */

/**
 * Bounds-checked binary writer with cursor tracking.
 *
 * Ownership: BinaryWriter owns its internal buffer. The buffer returned by
 * finish() is a subarray view; caller should copy if the writer will be reused.
 */
export class BinaryWriter {
  private readonly buf: Uint8Array;
  private readonly dv: DataView;
  private off = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new ZrBinaryError({
        code: "ZR_LIMIT",
        offset: 0,
        detail: `capacity must be a non-negative integer (got ${String(capacity)})`,
      });
    }
    if (capacity > MAX_WRITER_CAPACITY_BYTES) {
      throw new ZrBinaryError({
        code: "ZR_LIMIT",
        offset: 0,
        detail: `capacity ${String(capacity)} exceeds maximum ${String(MAX_WRITER_CAPACITY_BYTES)}`,
      });
    }
    this.buf = new Uint8Array(capacity);
    this.dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
  }

  get offset(): number {
    return this.off;
  }

  get capacity(): number {
    return this.buf.byteLength;
  }

  /** Write unsigned 8-bit integer, advancing cursor by 1 byte. */
  writeU8(v: number): void {
    this.ensureCanWrite(1);
    this.dv.setUint8(this.off, v & 0xff);
    this.off += 1;
  }

  /**
   * Write unsigned 32-bit integer (little-endian), advancing cursor by 4 bytes.
   * Requires cursor to be 4-byte aligned.
   */
  writeU32(v: number): void {
    this.ensureAligned4(this.off);
    this.ensureCanWrite(4);
    this.dv.setUint32(this.off, v >>> 0, true);
    this.off += 4;
  }

  /**
   * Write signed 32-bit integer (little-endian), advancing cursor by 4 bytes.
   * Requires cursor to be 4-byte aligned.
   */
  writeI32(v: number): void {
    this.ensureAligned4(this.off);
    this.ensureCanWrite(4);
    this.dv.setInt32(this.off, v | 0, true);
    this.off += 4;
  }

  /** Write raw bytes, advancing cursor by bytes.byteLength. */
  writeBytes(bytes: Uint8Array): void {
    this.ensureCanWrite(bytes.byteLength);
    this.buf.set(bytes, this.off);
    this.off += bytes.byteLength;
  }

  /**
   * Pad cursor to next 4-byte boundary with zero bytes.
   * Required before writing U32/I32 values and for format compliance.
   */
  padTo4(): void {
    const aligned = (this.off + 3) & ~3;
    if (aligned === this.off) return;
    const pad = aligned - this.off;
    this.ensureCanWrite(pad);
    this.buf.fill(0x00, this.off, aligned);
    this.off = aligned;
  }

  /**
   * Return the written portion of the buffer as a Uint8Array view.
   * The returned view shares underlying memory with the writer.
   */
  finish(): Uint8Array {
    return this.buf.subarray(0, this.off);
  }

  /** Validate 4-byte alignment; throws ZR_MISALIGNED on violation. */
  private ensureAligned4(offset: number): void {
    if ((offset & 3) !== 0) {
      throw new ZrBinaryError({
        code: "ZR_MISALIGNED",
        offset,
        detail: "offset must be 4-byte aligned",
      });
    }
  }

  /** Validate that n bytes can be written; throws ZR_LIMIT if capacity exceeded. */
  private ensureCanWrite(n: number): void {
    if (this.off + n > this.capacity) {
      throw new ZrBinaryError({
        code: "ZR_LIMIT",
        offset: this.off,
        detail: `write of ${n} byte(s) exceeds capacity ${this.capacity}`,
      });
    }
  }
}

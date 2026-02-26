/**
 * packages/core/src/drawlist/textArena.ts — Per-frame UTF-8 text arena.
 *
 * Why: Keep transient text in one contiguous byte store to avoid per-segment
 * allocations and repeated byte copies.
 */

export type TextArenaSlice = Readonly<{ off: number; len: number }>;

export type TextArenaCounters = Readonly<{
  textEncoderCalls: number;
  textArenaBytes: number;
  textSegments: number;
}>;

export type Utf8EncoderInto = Readonly<{
  encodeInto(input: string, destination: Uint8Array): Readonly<{ read?: number; written?: number }>;
}>;

const DEFAULT_INITIAL_CAPACITY = 1024;

function nextPowerOfTwoAtLeast(current: number, required: number): number {
  let next = current;
  while (next < required) {
    const doubled = next * 2;
    if (!Number.isSafeInteger(doubled) || doubled <= next) return required;
    next = doubled;
  }
  return next;
}

export class FrameTextArena {
  private buf: Uint8Array;
  private len = 0;
  private textEncoderCalls = 0;
  private textSegments = 0;

  constructor(
    initialCapacity = DEFAULT_INITIAL_CAPACITY,
    private readonly encoder: Utf8EncoderInto,
  ) {
    const cap =
      Number.isFinite(initialCapacity) && Number.isInteger(initialCapacity) && initialCapacity > 0
        ? initialCapacity
        : DEFAULT_INITIAL_CAPACITY;
    this.buf = new Uint8Array(cap);
  }

  reset(): void {
    this.len = 0;
    this.textEncoderCalls = 0;
    this.textSegments = 0;
  }

  reserve(totalRequiredBytes: number): void {
    if (!Number.isFinite(totalRequiredBytes)) return;
    const required = Math.max(0, Math.trunc(totalRequiredBytes));
    if (required <= this.buf.byteLength) return;

    const nextCap = nextPowerOfTwoAtLeast(this.buf.byteLength, required);
    const next = new Uint8Array(nextCap);
    next.set(this.buf.subarray(0, this.len), 0);
    this.buf = next;
  }

  allocUtf8(text: string): TextArenaSlice {
    const off = this.len;
    this.textSegments += 1;

    if (text.length === 0) {
      return Object.freeze({ off, len: 0 });
    }

    // UTF-8 worst-case is 3 bytes per UTF-16 code unit.
    const worstCase = this.len + text.length * 3;
    this.reserve(worstCase);

    let consumedCodeUnits = 0;
    while (consumedCodeUnits < text.length) {
      const out = this.buf.subarray(this.len);
      const src = consumedCodeUnits === 0 ? text : text.slice(consumedCodeUnits);
      this.textEncoderCalls += 1;
      const result = this.encoder.encodeInto(src, out);
      const read = result.read ?? 0;
      const written = result.written ?? 0;

      if (read === 0 && written === 0) {
        this.reserve(this.buf.byteLength + 1);
        continue;
      }

      consumedCodeUnits += read;
      this.len += written;
    }

    return Object.freeze({ off, len: this.len - off });
  }

  allocBytes(bytes: Uint8Array): TextArenaSlice {
    const off = this.len;
    this.textSegments += 1;

    if (bytes.byteLength === 0) {
      return Object.freeze({ off, len: 0 });
    }

    this.reserve(this.len + bytes.byteLength);
    this.buf.set(bytes, this.len);
    this.len += bytes.byteLength;
    return Object.freeze({ off, len: bytes.byteLength });
  }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }

  byteLength(): number {
    return this.len;
  }

  segmentCount(): number {
    return this.textSegments;
  }

  counters(): TextArenaCounters {
    return Object.freeze({
      textEncoderCalls: this.textEncoderCalls,
      textArenaBytes: this.len,
      textSegments: this.textSegments,
    });
  }
}

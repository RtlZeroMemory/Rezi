export type Rng = Readonly<{
  u32(): number;
  bytes(len: number): Uint8Array;
}>;

export function createRng(seed: number): Rng {
  assertUInt32("seed", seed);
  let state = seed >>> 0;

  function nextU32(): number {
    // xorshift32 (George Marsaglia)
    // Deterministic across platforms/runtimes via 32-bit bitwise ops.
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state >>>= 0;
    return state;
  }

  return {
    u32(): number {
      return nextU32();
    },
    bytes(len: number): Uint8Array {
      if (!Number.isInteger(len) || len < 0) {
        throw new Error(`createRng.bytes: len must be a non-negative integer (got ${String(len)})`);
      }

      const out = new Uint8Array(len);
      let i = 0;
      while (i < out.length) {
        const x = nextU32();
        out[i] = x & 0xff;
        i++;
        if (i >= out.length) break;
        out[i] = (x >>> 8) & 0xff;
        i++;
        if (i >= out.length) break;
        out[i] = (x >>> 16) & 0xff;
        i++;
        if (i >= out.length) break;
        out[i] = (x >>> 24) & 0xff;
        i++;
      }
      return out;
    },
  } as const;
}

function assertUInt32(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${name} must be a uint32 integer (got ${String(value)})`);
  }
}

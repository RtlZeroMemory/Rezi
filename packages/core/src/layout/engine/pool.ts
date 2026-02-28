/* ========== Layout Array Pooling ========== */
// Reusable arrays to reduce GC pressure during layout computation.
// These are cleared and reused rather than allocated fresh each time.

/** Pool of reusable number arrays for layout computation. */
const arrayPool: number[][] = [];
const MAX_POOL_SIZE = 32;

/**
 * Get or create a number array of the specified length, zeroed.
 * Reuses pooled arrays when possible.
 */
export function acquireArray(length: number): number[] {
  // Try to find a pooled array that's large enough
  for (let i = 0; i < arrayPool.length; i++) {
    const arr = arrayPool[i];
    if (arr !== undefined && arr.length >= length) {
      const lastIndex = arrayPool.length - 1;
      if (i !== lastIndex) {
        const last = arrayPool[lastIndex];
        if (last !== undefined) arrayPool[i] = last;
      }
      arrayPool.length = lastIndex;
      // Zero the portion we'll use
      arr.fill(0, 0, length);
      return arr;
    }
  }
  // Create new array
  return new Array<number>(length).fill(0);
}

/**
 * Return an array to the pool for reuse.
 */
export function releaseArray(arr: number[]): void {
  if (arrayPool.length < MAX_POOL_SIZE) {
    arrayPool.push(arr);
  }
}

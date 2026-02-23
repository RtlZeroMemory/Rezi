/**
 * Distribute an integer total across weighted slots deterministically.
 *
 * - Uses floor division for base shares.
 * - Distributes leftover cells by descending fractional part.
 * - Breaks ties by lower slot index.
 */
export function distributeInteger(total: number, weights: readonly number[]): number[] {
  const slotCount = weights.length;
  const out = new Array<number>(slotCount).fill(0);
  if (slotCount === 0) return out;

  const target = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  if (target <= 0) return out;

  const normalizedWeights = new Array<number>(slotCount).fill(0);
  let totalWeight = 0;
  for (let i = 0; i < slotCount; i++) {
    const raw = weights[i];
    const w = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
    normalizedWeights[i] = w;
    totalWeight += w;
  }
  if (totalWeight <= 0) return out;

  const fracs = new Array<number>(slotCount).fill(0);
  let baseSum = 0;
  for (let i = 0; i < slotCount; i++) {
    const w = normalizedWeights[i] ?? 0;
    if (w <= 0) continue;
    const raw = (target * w) / totalWeight;
    const base = Math.floor(raw);
    out[i] = base;
    fracs[i] = raw - base;
    baseSum += base;
  }

  let remainder = target - baseSum;
  if (remainder <= 0) return out;

  const order: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    if ((normalizedWeights[i] ?? 0) > 0) order.push(i);
  }
  order.sort((a, b) => {
    const af = fracs[a] ?? 0;
    const bf = fracs[b] ?? 0;
    if (bf !== af) return bf - af;
    return a - b;
  });

  for (let i = 0; i < order.length && remainder > 0; i++) {
    const slot = order[i] ?? -1;
    if (slot < 0) continue;
    out[slot] = (out[slot] ?? 0) + 1;
    remainder--;
  }

  return out;
}

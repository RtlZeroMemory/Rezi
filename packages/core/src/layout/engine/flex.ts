import { clampNonNegative } from "./bounds.js";
import { acquireArray } from "./pool.js";

export type FlexItem = Readonly<{
  index: number;
  flex: number;
  shrink: number;
  basis: number;
  min: number;
  max: number;
}>;

/** Internal type for flex distribution with slot tracking. */
type ActiveFlexItem = FlexItem & { slot: number };

/** Internal type for ideal allocation calculation. */
type IdealAlloc = { item: ActiveFlexItem; base: number; frac: number };

// Reusable arrays for distributeFlex to avoid per-call allocations
const reuseActiveItems: ActiveFlexItem[] = [];
const reuseIdealAllocs: IdealAlloc[] = [];
const reuseNextActive: ActiveFlexItem[] = [];
const reuseBonusSlots: number[] = [];
const reuseBonusCounts: number[] = [];

export function distributeFlex(remaining: number, items: readonly FlexItem[]): number[] {
  const out = acquireArray(items.length);
  let remainingLeft = remaining;

  // Build active list without .map().filter() - reuse array
  reuseActiveItems.length = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it !== undefined && it.flex > 0 && remainingLeft > 0) {
      reuseActiveItems.push({
        index: it.index,
        flex: it.flex,
        shrink: it.shrink,
        basis: it.basis,
        min: it.min,
        max: it.max,
        slot: i,
      });
    }
  }

  while (reuseActiveItems.length > 0 && remainingLeft > 0) {
    // Calculate total flex without reduce
    let totalFlex = 0;
    for (let i = 0; i < reuseActiveItems.length; i++) {
      const it = reuseActiveItems[i];
      if (!it) continue;
      totalFlex += it.flex;
    }
    if (totalFlex <= 0) break;

    // Build ideal allocations without creating new objects each iteration
    reuseIdealAllocs.length = 0;
    for (let i = 0; i < reuseActiveItems.length; i++) {
      const it = reuseActiveItems[i];
      if (!it) continue;
      const raw = (remainingLeft * it.flex) / totalFlex;
      const base = Math.floor(raw);
      const frac = raw - base;
      reuseIdealAllocs.push({ item: it, base, frac });
    }

    let basesSum = 0;
    for (let i = 0; i < reuseIdealAllocs.length; i++) {
      const x = reuseIdealAllocs[i];
      if (!x) continue;
      basesSum += x.base;
    }
    let remainder = remainingLeft - basesSum;

    // Sort by frac descending, then by index ascending
    reuseIdealAllocs.sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.item.index - b.item.index;
    });

    // Distribute remainder using parallel arrays instead of Map
    reuseBonusSlots.length = 0;
    reuseBonusCounts.length = 0;
    for (let i = 0; i < reuseIdealAllocs.length && remainder > 0; i++) {
      const x = reuseIdealAllocs[i];
      if (!x) continue;
      const slot = x.item.slot;
      const existingIdx = reuseBonusSlots.indexOf(slot);
      if (existingIdx >= 0) {
        reuseBonusCounts[existingIdx] = (reuseBonusCounts[existingIdx] ?? 0) + 1;
      } else {
        reuseBonusSlots.push(slot);
        reuseBonusCounts.push(1);
      }
      remainder--;
    }

    let used = 0;
    reuseNextActive.length = 0;

    for (let i = 0; i < reuseIdealAllocs.length; i++) {
      const x = reuseIdealAllocs[i];
      if (!x) continue;
      const bonusIdx = reuseBonusSlots.indexOf(x.item.slot);
      const bonus = bonusIdx >= 0 ? (reuseBonusCounts[bonusIdx] ?? 0) : 0;
      const proposed = x.base + bonus;

      const cur = out[x.item.slot] ?? 0;
      const remainingCap = x.item.max - cur;
      const capped = Math.min(proposed, Math.max(0, remainingCap));
      const updated = cur + capped;
      out[x.item.slot] = updated;
      used += capped;

      const hitMax = capped < proposed || updated >= x.item.max;
      if (!hitMax) reuseNextActive.push(x.item);
    }

    remainingLeft = clampNonNegative(remainingLeft - used);

    // Swap active with nextActive
    reuseActiveItems.length = 0;
    for (let i = 0; i < reuseNextActive.length; i++) {
      const it = reuseNextActive[i];
      if (it) reuseActiveItems.push(it);
    }
  }

  // If there's space left, try to satisfy mins without exceeding remaining.
  if (remainingLeft > 0) {
    for (let i = 0; i < items.length && remainingLeft > 0; i++) {
      const item = items[i];
      if (!item) continue;
      const cur = out[i] ?? 0;
      if (cur >= item.min) continue;
      const need = item.min - cur;
      const remainingCap = item.max - cur;
      const add = Math.min(need, remainingLeft, Math.max(0, remainingCap));
      if (add <= 0) continue;
      out[i] = cur + add;
      remainingLeft = clampNonNegative(remainingLeft - add);
    }
  }

  return out;
}

/**
 * Shrink items proportionally when their total basis exceeds available space.
 * Matches CSS Flexbox shrink algorithm:
 *   scaledShrink[i] = item.shrink * item.basis
 *   reduction[i] = overflow * scaledShrink[i] / sum(scaledShrink)
 *   Floor each item at item.min.
 *   Iterate if any item hits min floor (redistribute to non-floored items).
 *
 * Returns an array of final sizes (basis - reduction) per item slot.
 * Items with shrink=0 keep their full basis.
 */
export function shrinkFlex(available: number, items: readonly FlexItem[]): number[] {
  const out: number[] = new Array(items.length).fill(0);
  let totalBasis = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const min = Math.max(0, item.min);
    const max = Math.max(min, item.max);
    const basis = item.basis;
    const initial = Math.min(max, Math.max(min, basis));
    out[i] = initial;
    totalBasis += initial;
  }

  let overflow = totalBasis - available;
  if (overflow <= 0) return out;

  const active = new Array(items.length).fill(true);
  while (overflow > 0) {
    let totalScaled = 0;
    let activeCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (!active[i]) continue;
      const it = items[i];
      if (!it || it.shrink <= 0) {
        active[i] = false;
        continue;
      }
      const reducible = Math.max(0, (out[i] ?? 0) - it.min);
      if (reducible <= 0) {
        active[i] = false;
        continue;
      }
      totalScaled += it.shrink * (out[i] ?? 0);
      activeCount++;
    }
    if (totalScaled <= 0 || activeCount === 0) break;

    const baseReductions = new Array<number>(items.length).fill(0);
    const fracs = new Array<number>(items.length).fill(0);
    let distributedBase = 0;
    for (let i = 0; i < items.length; i++) {
      if (!active[i]) continue;
      const it = items[i];
      if (!it) continue;
      const scaled = it.shrink * (out[i] ?? 0);
      const raw = (overflow * scaled) / totalScaled;
      const base = Math.floor(raw);
      const reducible = Math.max(0, (out[i] ?? 0) - it.min);
      const clampedBase = Math.min(base, reducible);
      baseReductions[i] = clampedBase;
      fracs[i] = raw - base;
      distributedBase += clampedBase;
    }

    let remainder = overflow - distributedBase;
    if (remainder > 0) {
      const order: number[] = [];
      for (let i = 0; i < items.length; i++) {
        if (active[i]) order.push(i);
      }
      order.sort((a, b) => {
        if ((fracs[b] ?? 0) !== (fracs[a] ?? 0)) return (fracs[b] ?? 0) - (fracs[a] ?? 0);
        return a - b;
      });

      // Allocate leftover one cell at a time, honoring min floors.
      let cursor = 0;
      while (remainder > 0 && order.length > 0) {
        const idx = order[cursor % order.length] ?? -1;
        if (idx < 0) break;
        const it = items[idx];
        if (!it) break;
        const reducible = Math.max(0, (out[idx] ?? 0) - it.min - (baseReductions[idx] ?? 0));
        if (reducible > 0) {
          baseReductions[idx] = (baseReductions[idx] ?? 0) + 1;
          remainder--;
        }
        cursor++;
        if (cursor > order.length * 4 && remainder > 0) {
          // Rebuild active order when many candidates hit floor.
          const nextOrder = order.filter((slot) => {
            const item = items[slot];
            if (!item) return false;
            const room = (out[slot] ?? 0) - item.min - Math.max(0, baseReductions[slot] ?? 0);
            return room > 0;
          });
          order.length = 0;
          for (let i = 0; i < nextOrder.length; i++) order.push(nextOrder[i] ?? 0);
          cursor = 0;
          if (order.length === 0) break;
        }
      }
    }

    let distributed = 0;
    for (let i = 0; i < items.length; i++) {
      const reduction = baseReductions[i] ?? 0;
      if (reduction <= 0) continue;
      out[i] = Math.max(items[i]?.min ?? 0, (out[i] ?? 0) - reduction);
      distributed += reduction;
      const it = items[i];
      if (it && (out[i] ?? 0) <= it.min) active[i] = false;
    }

    overflow -= distributed;
    if (distributed <= 0) break;
  }

  for (let i = 0; i < items.length; i++) {
    const min = items[i]?.min ?? 0;
    if ((out[i] ?? 0) < min) out[i] = min;
  }

  return out;
}

export type Justify = "start" | "end" | "center" | "between" | "around" | "evenly";

function unitSizeForExtra(extra: number, totalUnits: number, unitIndex: number): number {
  if (totalUnits <= 0) return 0;
  const base = Math.floor(extra / totalUnits);
  const rem = extra - base * totalUnits;
  return base + (unitIndex < rem ? 1 : 0);
}

export function computeJustifyStartOffset(
  justify: Justify,
  extra: number,
  itemCount: number,
): number {
  if (extra <= 0 || itemCount <= 0) return 0;
  if (justify === "end") return extra;
  if (justify === "center") return Math.floor(extra / 2);
  if (justify === "evenly") return unitSizeForExtra(extra, itemCount + 1, 0);
  if (justify === "around") return unitSizeForExtra(extra, itemCount * 2, 0);
  return 0;
}

export function computeJustifyExtraGap(
  justify: Justify,
  extra: number,
  itemCount: number,
  boundary: number,
): number {
  if (extra <= 0) return 0;
  if (itemCount <= 1) return 0;
  if (boundary < 0 || boundary >= itemCount - 1) return 0;

  if (justify === "between") {
    return unitSizeForExtra(extra, itemCount - 1, boundary);
  }
  if (justify === "evenly") {
    return unitSizeForExtra(extra, itemCount + 1, boundary + 1);
  }
  if (justify === "around") {
    const u1 = unitSizeForExtra(extra, itemCount * 2, boundary * 2 + 1);
    const u2 = unitSizeForExtra(extra, itemCount * 2, boundary * 2 + 2);
    return u1 + u2;
  }

  return 0;
}

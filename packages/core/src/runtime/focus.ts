/**
 * packages/core/src/runtime/focus.ts — Focus state management.
 *
 * Why: Manages keyboard focus state for interactive widgets. Tracks the currently
 * focused ID, handles pending focus changes (to defer mid-event-dispatch updates),
 * and computes focus traversal (Tab/Shift+Tab).
 *
 * Focus rules:
 *   - Focusable set: enabled Buttons + Inputs
 *   - Traversal order: depth-first preorder, left-to-right children
 *   - Tab cycles forward through list; Shift+Tab cycles backward
 *   - Focus persists across renders if ID still exists; else jumps to first
 *
 * Zone/Trap support:
 *   - Zones group focusables for TAB navigation between zones
 *   - Traps contain focus within boundaries when active
 *   - Arrow keys navigate within zones (linear or grid mode)
 *
 * @see docs/guide/input-and-focus.md
 */

import type { FocusZoneNavigation } from "../widgets/types.js";
import type { RuntimeInstance } from "./commit.js";
import { collectFocusTraps, collectFocusZones, collectFocusableIds } from "./widgetMeta.js";
import type { CollectedTrap, CollectedZone } from "./widgetMeta.js";

/**
 * Immutable focus state with optional pending change.
 * pendingFocusedId is applied at end of event dispatch turn.
 */
export type FocusState = Readonly<{
  focusedId: string | null;
  /**
   * Pending focus change to be applied at the end of the current event dispatch turn.
   *
   * `undefined` means "no pending change".
   * `null` means "explicitly clear focus".
   */
  pendingFocusedId?: string | null;
}>;

/**
 * Compute the locked focus list for a committed runtime tree.
 *
 * - Order: depth-first preorder traversal
 * - Children: left-to-right in `children[]` order
 * - Focusable set (MVP): enabled Buttons only (docs/10 + docs/11)
 */
export function computeFocusList(committedTree: RuntimeInstance): readonly string[] {
  return collectFocusableIds(committedTree);
}

/** Create initial focus state with no focused element. */
export function createFocusState(): FocusState {
  return Object.freeze({ focusedId: null });
}

/** Request a focus change to be applied at end of event dispatch. */
export function requestPendingFocusChange(
  state: FocusState,
  nextFocusedId: string | null,
): FocusState {
  return Object.freeze({ focusedId: state.focusedId, pendingFocusedId: nextFocusedId });
}

/** Apply pending focus change, returning new state with focusedId updated. */
export function applyPendingFocusChange(state: FocusState): FocusState {
  const pending = state.pendingFocusedId;
  if (pending === undefined) return state;
  return Object.freeze({ focusedId: pending });
}

/** Focus traversal direction. */
export type FocusMove = "next" | "prev";

/**
 * Compute the next/prev focus ID based on current focus and focus list.
 * Wraps around at list boundaries (circular traversal).
 *
 * @param focusList - Ordered list of focusable IDs
 * @param focusedId - Currently focused ID (or null)
 * @param move - Direction to move
 * @param focusIndexMap - Optional pre-built index map for O(1) lookup
 */
export function computeMovedFocusId(
  focusList: readonly string[],
  focusedId: string | null,
  move: FocusMove,
  focusIndexMap?: ReadonlyMap<string, number>,
): string | null {
  const n = focusList.length;
  if (n === 0) return null;

  const first = focusList[0];
  const last = focusList[n - 1];
  if (first === undefined || last === undefined) return null;

  if (focusedId === null) return move === "next" ? first : last;

  // Use O(1) map lookup if available, otherwise O(n) indexOf
  const idx = focusIndexMap?.get(focusedId) ?? focusList.indexOf(focusedId);
  if (idx < 0) return move === "next" ? first : last;

  const nextIdx = move === "next" ? (idx + 1) % n : (idx - 1 + n) % n;
  return focusList[nextIdx] ?? null;
}

/**
 * Build an index map from focus list for O(1) lookups.
 * Useful for repeated focus traversal operations.
 */
export function buildFocusIndexMap(focusList: readonly string[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < focusList.length; i++) {
    const id = focusList[i];
    if (id !== undefined) {
      map.set(id, i);
    }
  }
  return map;
}

/**
 * Finalize focus at the end of an event dispatch turn, applying pending focus changes
 * and enforcing deterministic focus reassignment if the focused id disappears or is
 * no longer focusable in the newly committed tree (docs/10 "Focus").
 */
export function finalizeFocusForCommittedTree(
  state: FocusState,
  committedTree: RuntimeInstance,
): FocusState {
  const focusList = computeFocusList(committedTree);
  const pending = state.pendingFocusedId;

  let nextFocusedId: string | null = state.focusedId;
  if (pending !== undefined) nextFocusedId = pending;

  if (nextFocusedId !== null) {
    // Use Set for O(1) membership test instead of O(n) includes()
    const focusSet = new Set(focusList);
    if (!focusSet.has(nextFocusedId)) {
      nextFocusedId = focusList[0] ?? null;
    }
  }

  return Object.freeze({ focusedId: nextFocusedId });
}

/* ========== Zone/Trap Support ========== */

/** Directional focus movement (extends FocusMove with arrow directions). */
export type FocusDirection = "next" | "prev" | "up" | "down" | "left" | "right";

/** Runtime focus zone with tracking of last focused element. */
export type FocusZone = Readonly<{
  id: string;
  tabIndex: number;
  navigation: FocusZoneNavigation;
  columns: number;
  wrapAround: boolean;
  focusableIds: readonly string[];
  lastFocusedId: string | null;
}>;

/** Extended focus manager state with zone and trap support. */
export type FocusManagerState = Readonly<{
  focusedId: string | null;
  activeZoneId: string | null;
  pendingFocusedId?: string | null;
  zones: ReadonlyMap<string, FocusZone>;
  trapStack: readonly string[];
  lastFocusedByZone: ReadonlyMap<string, string>;
}>;

/** Create initial focus manager state. */
export function createFocusManagerState(): FocusManagerState {
  return Object.freeze({
    focusedId: null,
    activeZoneId: null,
    zones: new Map(),
    trapStack: Object.freeze([]),
    lastFocusedByZone: new Map(),
  });
}

/**
 * Compute grid movement index.
 *
 * @param index Current index in the list
 * @param columns Number of columns in the grid
 * @param total Total number of items
 * @param direction Movement direction
 * @param wrapAround Whether to wrap at boundaries
 * @returns New index or null if movement is blocked
 */
export function computeGridMovement(
  index: number,
  columns: number,
  total: number,
  direction: FocusDirection,
  wrapAround: boolean,
): number | null {
  if (total === 0) return null;
  if (index < 0 || index >= total) return null;

  const row = Math.floor(index / columns);
  const col = index % columns;
  const totalRows = Math.ceil(total / columns);

  let nextIndex: number;

  switch (direction) {
    case "up": {
      if (row === 0) {
        if (!wrapAround) return null;
        // Wrap to last row, same column (or last item if incomplete row)
        const lastRowStart = (totalRows - 1) * columns;
        nextIndex = Math.min(lastRowStart + col, total - 1);
      } else {
        nextIndex = index - columns;
      }
      break;
    }
    case "down": {
      const nextRow = row + 1;
      if (nextRow >= totalRows) {
        if (!wrapAround) return null;
        // Wrap to first row, same column
        nextIndex = col;
      } else {
        nextIndex = Math.min(index + columns, total - 1);
        // If we'd land past the last item, go to last item
        if (nextIndex >= total) nextIndex = total - 1;
      }
      break;
    }
    case "left": {
      if (col === 0) {
        if (!wrapAround) return null;
        // Wrap to end of previous row, or last row if on first row
        if (row === 0) {
          nextIndex = total - 1;
        } else {
          nextIndex = index - 1;
        }
      } else {
        nextIndex = index - 1;
      }
      break;
    }
    case "right": {
      if (index === total - 1) {
        if (!wrapAround) return null;
        nextIndex = 0;
      } else if (col === columns - 1) {
        if (!wrapAround) return null;
        // Wrap to start of next row
        nextIndex = index + 1;
      } else {
        nextIndex = index + 1;
      }
      break;
    }
    case "next": {
      if (index === total - 1) {
        if (!wrapAround) return null;
        nextIndex = 0;
      } else {
        nextIndex = index + 1;
      }
      break;
    }
    case "prev": {
      if (index === 0) {
        if (!wrapAround) return null;
        nextIndex = total - 1;
      } else {
        nextIndex = index - 1;
      }
      break;
    }
  }

  return nextIndex;
}

/**
 * Compute movement within a zone based on navigation mode.
 *
 * @param zone The focus zone
 * @param currentId Currently focused element id
 * @param direction Movement direction
 * @param focusableIndexMap Optional pre-built index map for O(1) lookup
 * @returns New focused id or null if movement is blocked
 */
export function computeZoneMovement(
  zone: FocusZone,
  currentId: string | null,
  direction: FocusDirection,
  focusableIndexMap?: ReadonlyMap<string, number>,
): string | null {
  const { focusableIds, navigation, columns, wrapAround } = zone;
  const n = focusableIds.length;

  if (n === 0) return null;
  if (navigation === "none") return null;

  // Find current index - use O(1) map lookup if available
  let currentIndex = -1;
  if (currentId !== null) {
    currentIndex = focusableIndexMap?.get(currentId) ?? focusableIds.indexOf(currentId);
  }
  if (currentIndex < 0) {
    // Not in zone, return first item
    return focusableIds[0] ?? null;
  }

  if (navigation === "linear") {
    // Linear mode: UP/LEFT = prev, DOWN/RIGHT = next
    let linearDirection: FocusDirection;
    switch (direction) {
      case "up":
      case "left":
      case "prev":
        linearDirection = "prev";
        break;
      case "down":
      case "right":
      case "next":
        linearDirection = "next";
        break;
      default:
        linearDirection = direction;
    }

    const nextIndex = computeGridMovement(currentIndex, 1, n, linearDirection, wrapAround);
    if (nextIndex === null) return null;
    return focusableIds[nextIndex] ?? null;
  }

  // Grid mode
  const nextIndex = computeGridMovement(currentIndex, columns, n, direction, wrapAround);
  if (nextIndex === null) return null;
  return focusableIds[nextIndex] ?? null;
}

/**
 * Find which zone contains a given focusable id.
 * @param zones All focus zones
 * @param focusedId The id to find
 * @param zoneFocusableSets Optional pre-built Sets for O(1) membership test
 */
function findZoneForId(
  zones: ReadonlyMap<string, FocusZone>,
  focusedId: string,
  zoneFocusableSets?: ReadonlyMap<string, ReadonlySet<string>>,
): string | null {
  for (const [zoneId, zone] of zones) {
    // Use O(1) Set lookup if available, otherwise O(n) includes
    const focusableSet = zoneFocusableSets?.get(zoneId);
    if (focusableSet !== undefined) {
      if (focusableSet.has(focusedId)) {
        return zoneId;
      }
    } else {
      if (zone.focusableIds.includes(focusedId)) {
        return zoneId;
      }
    }
  }
  return null;
}

/**
 * Get zones sorted by tabIndex.
 */
function getSortedZones(zones: ReadonlyMap<string, FocusZone>): readonly FocusZone[] {
  const arr = Array.from(zones.values());
  arr.sort((a, b) => {
    if (a.tabIndex !== b.tabIndex) return a.tabIndex - b.tabIndex;
    // Stable sort by id for determinism
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return arr;
}

/**
 * Compute zone-to-zone traversal for TAB/Shift+TAB.
 *
 * @param zones All focus zones
 * @param activeZoneId Currently active zone (may be null)
 * @param move TAB direction (next/prev)
 * @param trapStack Active trap stack (innermost trap is last)
 * @param traps All focus traps
 * @param lastFocusedByZone Optional authoritative map of zone -> last focused id
 * @returns Next zone id and next focused id
 */
export function computeZoneTraversal(
  zones: ReadonlyMap<string, FocusZone>,
  activeZoneId: string | null,
  move: FocusMove,
  trapStack: readonly string[],
  traps: ReadonlyMap<string, CollectedTrap>,
  lastFocusedByZone?: ReadonlyMap<string, string>,
): { nextZoneId: string | null; nextFocusedId: string | null } {
  // If in an active trap, constrain to trap's focusables
  const activeTrapIdMaybe = trapStack.length > 0 ? trapStack[trapStack.length - 1] : undefined;
  const activeTrapId = activeTrapIdMaybe ?? null;
  const activeTrap = activeTrapId !== null ? traps.get(activeTrapId) : undefined;

  if (activeTrap?.active) {
    // TAB cycles within trap focusables
    const trapFocusables = activeTrap.focusableIds;
    if (trapFocusables.length === 0) {
      return { nextZoneId: null, nextFocusedId: null };
    }
    // No zone traversal within trap, just return current zone
    return { nextZoneId: activeZoneId, nextFocusedId: null };
  }

  const sortedZones = getSortedZones(zones);
  if (sortedZones.length === 0) {
    return { nextZoneId: null, nextFocusedId: null };
  }

  // Find current zone index
  let currentZoneIndex = -1;
  if (activeZoneId !== null) {
    currentZoneIndex = sortedZones.findIndex((z) => z.id === activeZoneId);
  }

  // Compute next zone
  let nextZoneIndex: number;
  if (currentZoneIndex < 0) {
    // No active zone, go to first or last
    nextZoneIndex = move === "next" ? 0 : sortedZones.length - 1;
  } else {
    const n = sortedZones.length;
    nextZoneIndex = move === "next" ? (currentZoneIndex + 1) % n : (currentZoneIndex - 1 + n) % n;
  }

  const nextZone = sortedZones[nextZoneIndex];
  if (!nextZone) {
    return { nextZoneId: null, nextFocusedId: null };
  }

  // Get first focusable in next zone (or last if moving prev)
  const zoneFocusables = nextZone.focusableIds;
  if (zoneFocusables.length === 0) {
    return { nextZoneId: nextZone.id, nextFocusedId: null };
  }

  // Prefer authoritative runtime last-focused map when available.
  const lastFocused = lastFocusedByZone?.get(nextZone.id) ?? nextZone.lastFocusedId;
  if (lastFocused !== null) {
    // Use a Set for O(1) membership check instead of O(n) includes.
    const focusableSet = new Set(zoneFocusables);
    if (focusableSet.has(lastFocused)) {
      return { nextZoneId: nextZone.id, nextFocusedId: lastFocused };
    }
  }

  const nextFocusedId =
    move === "next" ? zoneFocusables[0] : zoneFocusables[zoneFocusables.length - 1];

  return { nextZoneId: nextZone.id, nextFocusedId: nextFocusedId ?? null };
}

/**
 * Finalize focus manager state for a committed tree with zone/trap support.
 *
 * @param state Current focus manager state
 * @param committedTree The newly committed runtime tree
 * @returns Updated focus manager state
 */
export function finalizeFocusForCommittedTreeWithZones(
  state: FocusManagerState,
  committedTree: RuntimeInstance,
): FocusManagerState {
  const collectedZones = collectFocusZones(committedTree);
  const collectedTraps = collectFocusTraps(committedTree);
  const focusList = computeFocusList(committedTree);

  return finalizeFocusWithPreCollectedMetadata(state, focusList, collectedZones, collectedTraps);
}

/**
 * Pre-collected focus metadata for single-pass optimization.
 */
export type PreCollectedFocusMetadata = Readonly<{
  focusableIds: readonly string[];
  zones: ReadonlyMap<string, CollectedZone>;
  traps: ReadonlyMap<string, CollectedTrap>;
}>;

/**
 * Finalize focus manager state using pre-collected metadata.
 *
 * This variant accepts pre-collected zones/traps/focusableIds from
 * collectAllWidgetMetadata(), avoiding redundant tree traversals.
 *
 * @param state Current focus manager state
 * @param focusList Pre-collected focusable IDs
 * @param collectedZones Pre-collected zones
 * @param collectedTraps Pre-collected traps
 * @returns Updated focus manager state
 */
export function finalizeFocusWithPreCollectedMetadata(
  state: FocusManagerState,
  focusList: readonly string[],
  collectedZones: ReadonlyMap<string, CollectedZone>,
  collectedTraps: ReadonlyMap<string, CollectedTrap>,
): FocusManagerState {
  // Build Set for O(1) membership tests (avoids O(n) includes() calls)
  const focusSet = new Set(focusList);

  // Convert collected zones to FocusZone with lastFocusedId from state
  const zones = new Map<string, FocusZone>();
  for (const [id, collected] of collectedZones) {
    const lastFocusedId = state.lastFocusedByZone.get(id) ?? null;
    zones.set(
      id,
      Object.freeze({
        id: collected.id,
        tabIndex: collected.tabIndex,
        navigation: collected.navigation,
        columns: collected.columns,
        wrapAround: collected.wrapAround,
        focusableIds: collected.focusableIds,
        lastFocusedId,
      }),
    );
  }

  // Apply pending focus
  let nextFocusedId: string | null = state.focusedId;
  if (state.pendingFocusedId !== undefined) {
    nextFocusedId = state.pendingFocusedId;
  }

  // Validate focused id still exists
  if (nextFocusedId !== null && !focusSet.has(nextFocusedId)) {
    nextFocusedId = focusList[0] ?? null;
  }

  // Update active zone based on focused id
  let activeZoneId = state.activeZoneId;
  if (nextFocusedId !== null) {
    const foundZone = findZoneForId(zones, nextFocusedId);
    if (foundZone !== null) {
      activeZoneId = foundZone;
    }
  }

  // Validate active zone still exists
  if (activeZoneId !== null && !zones.has(activeZoneId)) {
    activeZoneId = null;
  }

  // Update lastFocusedByZone
  const lastFocusedByZone = new Map(state.lastFocusedByZone);
  if (nextFocusedId !== null && activeZoneId !== null) {
    lastFocusedByZone.set(activeZoneId, nextFocusedId);
  }

  // Update trap stack - keep only active traps
  const trapStack: string[] = [];
  for (const trapId of state.trapStack) {
    const trap = collectedTraps.get(trapId);
    if (trap?.active) {
      trapStack.push(trapId);
    }
  }
  // Add any new active traps
  for (const [trapId, trap] of collectedTraps) {
    if (trap.active && !trapStack.includes(trapId)) {
      trapStack.push(trapId);
      // If trap has initialFocus, apply it
      if (trap.initialFocus !== null && focusSet.has(trap.initialFocus)) {
        nextFocusedId = trap.initialFocus;
      } else if (trap.focusableIds.length > 0) {
        // Focus first focusable in trap
        const firstInTrap = trap.focusableIds[0];
        if (firstInTrap !== undefined) {
          nextFocusedId = firstInTrap;
        }
      }
    }
  }

  // Handle trap deactivation - return focus if specified
  for (const [trapId, trap] of collectedTraps) {
    const wasActive = state.trapStack.includes(trapId);
    if (wasActive && !trap.active && trap.returnFocusTo !== null) {
      if (focusSet.has(trap.returnFocusTo)) {
        nextFocusedId = trap.returnFocusTo;
      }
    }
  }

  return Object.freeze({
    focusedId: nextFocusedId,
    activeZoneId,
    zones,
    trapStack: Object.freeze(trapStack),
    lastFocusedByZone,
  });
}

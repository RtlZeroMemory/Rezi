/**
 * packages/core/src/runtime/layers.ts — Layer manager for modal/overlay system.
 *
 * Why: Manages z-ordered layers for modals, dropdowns, and tooltips. Handles
 * layer registry, hit testing with z-order respect, and backdrop blocking for
 * modal layers.
 *
 * Layer concepts:
 *   - Z-order: Higher z-index renders on top and receives input first
 *   - Tie-break: Equal z-index uses registration order (later registration on top)
 *   - Backdrop: Optional overlay that can dim or block lower layers
 *   - Modal: Blocks input to layers below
 *   - Focus trapping: Modal layers trap focus within their bounds
 *
 * @see docs/guide/runtime-and-layout.md (GitHub issue #117)
 */

import type { Rect } from "../layout/types.js";
import type { BackdropStyle } from "../widgets/types.js";

/* ========== Layer Types ========== */

/**
 * Layer entry in the layer registry.
 */
export type Layer = Readonly<{
  /** Unique layer identifier. */
  id: string;
  /** Z-index for ordering (higher = on top). */
  zIndex: number;
  /** Computed layout rect for the layer. */
  rect: Rect;
  /** Backdrop style for this layer. */
  backdrop: BackdropStyle;
  /** Whether this layer is modal (blocks input below). */
  modal: boolean;
  /** Whether this layer should close on ESC. */
  closeOnEscape: boolean;
  /** Callback when layer should close. */
  onClose: (() => void) | undefined;
}>;

/**
 * Mutable layer for internal registry use.
 */
type MutableLayer = {
  id: string;
  zIndex: number;
  registrationOrder: number;
  rect: Rect;
  backdrop: BackdropStyle;
  modal: boolean;
  closeOnEscape: boolean;
  onClose: (() => void) | undefined;
};

/** Input type for registering a layer (onClose is optional). */
export type LayerInput = Readonly<{
  id: string;
  rect: Rect;
  backdrop: BackdropStyle;
  modal: boolean;
  closeOnEscape: boolean;
  zIndex?: number;
  onClose?: () => void;
}>;

/**
 * Layer registry for managing the layer stack.
 */
export type LayerRegistry = Readonly<{
  /** Register a new layer. */
  register: (layer: LayerInput) => void;
  /** Unregister a layer by ID. */
  unregister: (id: string) => void;
  /** Get a layer by ID. */
  get: (id: string) => Layer | undefined;
  /** Get all layers sorted by z-index, then registration order (lowest first). */
  getAll: () => readonly Layer[];
  /** Get the topmost layer. */
  getTopmost: () => Layer | undefined;
  /** Get the topmost modal layer (for input blocking). */
  getTopmostModal: () => Layer | undefined;
  /** Update a layer's rect. */
  updateRect: (id: string, rect: Rect) => void;
  /** Clear all layers. */
  clear: () => void;
}>;

/** Counter for auto-generating z-indices. */
let nextAutoZIndex = 1000;

/**
 * Create a new layer registry.
 */
export function createLayerRegistry(): LayerRegistry {
  const layers = new Map<string, MutableLayer>();
  let nextRegistrationOrder = 0;
  let cacheDirty = true;
  let sortedSnapshot: readonly Layer[] = Object.freeze([]);
  let topmostSnapshot: Layer | undefined;
  let topmostModalSnapshot: Layer | undefined;

  function markDirty(): void {
    cacheDirty = true;
  }

  function refreshSnapshots(): void {
    if (!cacheDirty) return;
    const sorted = Array.from(layers.values()).sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.registrationOrder - b.registrationOrder;
    });
    const nextSorted: Layer[] = [];
    let nextTopmost: Layer | undefined;
    let nextTopmostModal: Layer | undefined;
    for (let i = 0; i < sorted.length; i++) {
      const layer = sorted[i];
      if (!layer) continue;
      const snapshot: Layer = Object.freeze({
        id: layer.id,
        zIndex: layer.zIndex,
        rect: layer.rect,
        backdrop: layer.backdrop,
        modal: layer.modal,
        closeOnEscape: layer.closeOnEscape,
        onClose: layer.onClose,
      });
      nextSorted.push(snapshot);
      nextTopmost = snapshot;
      if (snapshot.modal) nextTopmostModal = snapshot;
    }
    sortedSnapshot = Object.freeze(nextSorted);
    topmostSnapshot = nextTopmost;
    topmostModalSnapshot = nextTopmostModal;
    cacheDirty = false;
  }

  return Object.freeze({
    register(layerInput: LayerInput): void {
      const zIndex = layerInput.zIndex ?? nextAutoZIndex++;
      const layer: MutableLayer = {
        id: layerInput.id,
        zIndex,
        registrationOrder: nextRegistrationOrder++,
        rect: layerInput.rect,
        backdrop: layerInput.backdrop,
        modal: layerInput.modal,
        closeOnEscape: layerInput.closeOnEscape,
        onClose: layerInput.onClose,
      };
      layers.set(layer.id, layer);
      markDirty();
    },

    unregister(id: string): void {
      if (layers.delete(id)) markDirty();
    },

    get(id: string): Layer | undefined {
      const layer = layers.get(id);
      if (!layer) return undefined;
      return Object.freeze({
        id: layer.id,
        zIndex: layer.zIndex,
        rect: layer.rect,
        backdrop: layer.backdrop,
        modal: layer.modal,
        closeOnEscape: layer.closeOnEscape,
        onClose: layer.onClose,
      });
    },

    getAll(): readonly Layer[] {
      refreshSnapshots();
      return sortedSnapshot;
    },

    getTopmost(): Layer | undefined {
      refreshSnapshots();
      return topmostSnapshot;
    },

    getTopmostModal(): Layer | undefined {
      refreshSnapshots();
      return topmostModalSnapshot;
    },

    updateRect(id: string, rect: Rect): void {
      const layer = layers.get(id);
      if (layer) {
        layer.rect = rect;
        markDirty();
      }
    },

    clear(): void {
      if (layers.size > 0) {
        layers.clear();
        markDirty();
      }
    },
  });
}

/* ========== Hit Testing ========== */

/**
 * Check if a point is inside a rect.
 */
function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/**
 * Result of layer hit testing.
 */
export type LayerHitTestResult = Readonly<{
  /** The layer that was hit, or null if no layer contains the point. */
  layer: Layer | null;
  /** Whether the point is blocked by a modal backdrop. */
  blocked: boolean;
  /** The blocking layer, if any. */
  blockingLayer: Layer | null;
}>;

/**
 * Hit test layers to find which layer contains a point.
 * Returns the topmost layer containing the point, respecting modal blocking.
 * Order is deterministic: higher z-index first, then later registration for equal z-index.
 *
 * @param registry - Layer registry
 * @param x - X coordinate to test
 * @param y - Y coordinate to test
 * @returns Hit test result
 */
export function hitTestLayers(registry: LayerRegistry, x: number, y: number): LayerHitTestResult {
  const layers = registry.getAll();

  // Find topmost modal layer for blocking check.
  let topmostModalIndex = -1;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer?.modal) {
      topmostModalIndex = i;
      break;
    }
  }
  const topmostModal = topmostModalIndex >= 0 ? (layers[topmostModalIndex] ?? null) : null;
  let blockingLayer: Layer | null = null;

  // Check from topmost to bottom
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer) continue;

    if (containsPoint(layer.rect, x, y)) {
      // Block if the topmost modal is above this layer in resolved stack order.
      if (topmostModal && topmostModalIndex > i) {
        blockingLayer = topmostModal;
        return Object.freeze({
          layer: null,
          blocked: true,
          blockingLayer,
        });
      }

      return Object.freeze({
        layer,
        blocked: false,
        blockingLayer: null,
      });
    }
  }

  // Point not in any layer - modal layers block ALL input below, regardless of backdrop style
  // The backdrop property controls visual dimming, not input blocking
  if (topmostModal) {
    return Object.freeze({
      layer: null,
      blocked: true,
      blockingLayer: topmostModal,
    });
  }

  return Object.freeze({
    layer: null,
    blocked: false,
    blockingLayer: null,
  });
}

/* ========== Layer State Management ========== */

/**
 * State for tracking active layers and their lifecycle.
 */
export type LayerStackState = Readonly<{
  /** Ordered list of layer IDs (topmost last). */
  stack: readonly string[];
  /** Map of layer ID to onClose callback. */
  closeCallbacks: ReadonlyMap<string, () => void>;
}>;

/**
 * Create initial layer stack state.
 */
export function createLayerStackState(): LayerStackState {
  return Object.freeze({
    stack: Object.freeze([]),
    closeCallbacks: new Map(),
  });
}

/**
 * Push a layer onto the stack.
 */
export function pushLayer(
  state: LayerStackState,
  layerId: string,
  onClose?: () => void,
): LayerStackState {
  const stack = [...state.stack.filter((id) => id !== layerId), layerId];
  const closeCallbacks = new Map(state.closeCallbacks);
  if (onClose) {
    closeCallbacks.set(layerId, onClose);
  } else {
    closeCallbacks.delete(layerId);
  }

  return Object.freeze({
    stack: Object.freeze(stack),
    closeCallbacks,
  });
}

/**
 * Pop a layer from the stack.
 * Returns the new state and the onClose callback if any.
 */
export function popLayer(
  state: LayerStackState,
  layerId: string,
): { state: LayerStackState; onClose: (() => void) | undefined } {
  const onClose = state.closeCallbacks.get(layerId);
  const stack = state.stack.filter((id) => id !== layerId);
  const closeCallbacks = new Map(state.closeCallbacks);
  closeCallbacks.delete(layerId);

  return {
    state: Object.freeze({
      stack: Object.freeze(stack),
      closeCallbacks,
    }),
    onClose,
  };
}

/**
 * Get the topmost layer ID from the stack.
 */
export function getTopmostLayerId(state: LayerStackState): string | null {
  const len = state.stack.length;
  if (len === 0) return null;
  return state.stack[len - 1] ?? null;
}

/**
 * Close the topmost layer.
 * Returns the new state and whether a layer was closed.
 */
export function closeTopmostLayer(state: LayerStackState): {
  state: LayerStackState;
  closed: boolean;
  closedLayerId: string | null;
} {
  const topmostId = getTopmostLayerId(state);
  if (!topmostId) {
    return { state, closed: false, closedLayerId: null };
  }

  const { state: newState, onClose } = popLayer(state, topmostId);

  // Call the onClose callback
  if (onClose) {
    try {
      onClose();
    } catch {
      // Swallow errors from close callbacks
    }
  }

  return {
    state: newState,
    closed: true,
    closedLayerId: topmostId,
  };
}

/* ========== Backdrop Rendering ========== */

/**
 * Backdrop configuration for rendering.
 */
export type BackdropConfig = Readonly<{
  style: BackdropStyle;
  rect: Rect;
  zIndex: number;
}>;

/**
 * Get backdrop configurations for all layers that need them.
 * Returns in render order (lowest z-index first).
 */
export function getBackdrops(registry: LayerRegistry): readonly BackdropConfig[] {
  const layers = registry.getAll();
  const backdrops: BackdropConfig[] = [];

  for (const layer of layers) {
    if (layer.backdrop !== "none") {
      backdrops.push(
        Object.freeze({
          style: layer.backdrop,
          rect: layer.rect,
          zIndex: layer.zIndex,
        }),
      );
    }
  }

  return Object.freeze(backdrops);
}

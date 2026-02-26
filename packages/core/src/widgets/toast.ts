/**
 * packages/core/src/widgets/toast.ts — Toast/Notifications core algorithms.
 *
 * Why: Implements positioning, stacking, and auto-dismiss logic for toast
 * notifications. Toasts are non-blocking feedback messages that stack
 * vertically from a screen edge.
 *
 * @see docs/widgets/toast.md
 */

import { rgb, type Rgb24 } from "./style.js";
import type { Toast, ToastPosition } from "./types.js";

/** Height of a single toast in cells. */
export const TOAST_HEIGHT = 3;

/** Default max visible toasts. */
export const DEFAULT_MAX_VISIBLE = 5;

/** Default auto-dismiss duration in ms. */
export const DEFAULT_DURATION = 3000;

const TOAST_ACTION_ID_PREFIX = "__rezi_toast_action__:";

/** Focus id for a toast action button (used by runtime-local focus routing). */
export function getToastActionFocusId(toastId: string): string {
  return `${TOAST_ACTION_ID_PREFIX}${toastId}`;
}

export function parseToastActionFocusId(id: string): string | null {
  if (!id.startsWith(TOAST_ACTION_ID_PREFIX)) return null;
  const rest = id.slice(TOAST_ACTION_ID_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

/**
 * Compute visible toasts based on max visible limit.
 *
 * @param toasts - All active toasts
 * @param maxVisible - Maximum number of visible toasts
 * @returns Toasts to display (most recent first)
 */
export function getVisibleToasts(
  toasts: readonly Toast[],
  maxVisible: number = DEFAULT_MAX_VISIBLE,
): readonly Toast[] {
  return Object.freeze(toasts.slice(0, maxVisible));
}

/**
 * Compute toast Y position within the container.
 *
 * @param index - Toast index (0 = first)
 * @param position - Container position
 * @param containerHeight - Container height in cells
 * @returns Y offset within container
 */
export function getToastY(index: number, position: ToastPosition, containerHeight: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  if (position.startsWith("top")) {
    return index * TOAST_HEIGHT;
  }
  // Bottom positions: stack upward from bottom
  return Math.max(0, containerHeight - (index + 1) * TOAST_HEIGHT);
}

/**
 * Compute toast X position based on container position.
 *
 * @param position - Container position
 * @param containerWidth - Container width in cells
 * @param toastWidth - Individual toast width in cells
 * @returns X offset for toast
 */
export function getToastX(
  position: ToastPosition,
  containerWidth: number,
  toastWidth: number,
): number {
  const maxX = Math.max(0, containerWidth - toastWidth);
  if (position.endsWith("left")) {
    return 0;
  }
  if (position.endsWith("center")) {
    const x = Math.floor((containerWidth - toastWidth) / 2);
    return Math.max(0, Math.min(x, maxX));
  }
  // Right positions
  return maxX;
}

/**
 * Filter toasts by auto-dismiss status.
 * Returns toasts that should still be visible based on their creation time.
 *
 * @param toasts - All toasts
 * @param now - Current timestamp in ms
 * @param createdAt - Map of toast ID to creation timestamp
 * @returns Toasts that haven't expired
 */
export function filterExpiredToasts(
  toasts: readonly Toast[],
  now: number,
  createdAt: ReadonlyMap<string, number>,
): readonly Toast[] {
  return Object.freeze(
    toasts.filter((t) => {
      const duration = t.duration ?? DEFAULT_DURATION;
      if (duration === 0) return true; // Persistent toast

      const created = createdAt.get(t.id);
      if (created === undefined) return true; // Unknown creation time, keep it

      return now - created < duration;
    }),
  );
}

/**
 * Add a toast to the list, maintaining order (newest first).
 *
 * @param toasts - Existing toasts
 * @param toast - Toast to add
 * @returns Updated toast list
 */
export function addToast(toasts: readonly Toast[], toast: Toast): readonly Toast[] {
  // Remove any existing toast with same ID
  const filtered = toasts.filter((t) => t.id !== toast.id);
  return Object.freeze([toast, ...filtered]);
}

/**
 * Remove a toast by ID.
 *
 * @param toasts - Existing toasts
 * @param id - Toast ID to remove
 * @returns Updated toast list
 */
export function removeToast(toasts: readonly Toast[], id: string): readonly Toast[] {
  return Object.freeze(toasts.filter((t) => t.id !== id));
}

/**
 * Update a toast's progress.
 *
 * @param toasts - Existing toasts
 * @param id - Toast ID to update
 * @param progress - New progress value (0-100)
 * @returns Updated toast list
 */
export function updateToastProgress(
  toasts: readonly Toast[],
  id: string,
  progress: number,
): readonly Toast[] {
  return Object.freeze(
    toasts.map((t) => {
      if (t.id !== id) return t;
      return { ...t, progress: Math.max(0, Math.min(100, progress)) };
    }),
  );
}

/** Icon character for each toast type. */
export const TOAST_ICONS: Record<Toast["type"], string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✗",
};

/** Border color for each toast type (packed RGB24). */
export const TOAST_COLORS: Record<Toast["type"], Rgb24> = {
  info: rgb(50, 150, 255),
  success: rgb(50, 200, 100),
  warning: rgb(255, 200, 50),
  error: rgb(255, 80, 80),
};

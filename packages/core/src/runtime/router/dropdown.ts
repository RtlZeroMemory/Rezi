import type { ZrevEvent } from "../../events.js";
import type { DropdownRoutingCtx, DropdownRoutingResult } from "./types.js";

/* --- Key Codes (locked by engine ABI) --- */
/* MUST match packages/core/src/keybindings/keyCodes.ts */
const ZR_KEY_ESCAPE = 1;
const ZR_KEY_ENTER = 2;
const ZR_KEY_UP = 20;
const ZR_KEY_DOWN = 21;
const ZR_KEY_SPACE = 32; /* Space as ASCII codepoint in ZREV key events */

/**
 * Route keyboard events for dropdown navigation.
 *
 * Navigation:
 *   - ArrowUp/ArrowDown: Move selection
 *   - Enter/Space: Activate selected item
 *   - Escape: Close dropdown
 *
 * @param event - The ZREV event
 * @param ctx - Dropdown routing context
 * @returns Routing result
 */
export function routeDropdownKey(event: ZrevEvent, ctx: DropdownRoutingCtx): DropdownRoutingResult {
  if (event.kind !== "key") return Object.freeze({ consumed: false });
  if (event.action !== "down") return Object.freeze({ consumed: false });

  const { items, selectedIndex, onSelect, onClose } = ctx;
  const selectableIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && !item.divider && !item.disabled) {
      selectableIndices.push(i);
    }
  }
  const selectableCount = selectableIndices.length;

  if (selectableCount === 0) {
    // No selectable items - only handle escape
    if (event.key === ZR_KEY_ESCAPE) {
      if (onClose) {
        try {
          onClose();
        } catch {
          // Swallow
        }
      }
      return Object.freeze({ shouldClose: true, consumed: true });
    }
    return Object.freeze({ consumed: false });
  }

  const selectedIsSelectable = selectableIndices.includes(selectedIndex);
  let currentSelectableIndex = selectedIsSelectable ? selectableIndices.indexOf(selectedIndex) : -1;
  if (currentSelectableIndex < 0) currentSelectableIndex = 0;

  // Handle keys
  switch (event.key) {
    case ZR_KEY_UP: {
      let nextIndex = currentSelectableIndex - 1;
      if (nextIndex < 0) nextIndex = selectableCount - 1;
      const actualIndex = selectableIndices[nextIndex] ?? selectedIndex;
      return Object.freeze({ nextSelectedIndex: actualIndex, consumed: true });
    }
    case ZR_KEY_DOWN: {
      let nextIndex = currentSelectableIndex + 1;
      if (nextIndex >= selectableCount) nextIndex = 0;
      const actualIndex = selectableIndices[nextIndex] ?? selectedIndex;
      return Object.freeze({ nextSelectedIndex: actualIndex, consumed: true });
    }
    case ZR_KEY_ENTER:
    case ZR_KEY_SPACE: {
      const itemIndexToActivate = selectedIsSelectable
        ? selectedIndex
        : (selectableIndices[currentSelectableIndex] ?? -1);
      const itemToActivate =
        itemIndexToActivate >= 0 && itemIndexToActivate < items.length
          ? (items[itemIndexToActivate] ?? null)
          : null;
      if (itemToActivate) {
        if (onSelect) {
          try {
            onSelect(itemToActivate);
          } catch {
            // Swallow
          }
        }
        return Object.freeze({
          activatedItem: itemToActivate,
          shouldClose: true,
          consumed: true,
        });
      }
      return Object.freeze({ consumed: true });
    }
    case ZR_KEY_ESCAPE: {
      if (onClose) {
        try {
          onClose();
        } catch {
          // Swallow
        }
      }
      return Object.freeze({ shouldClose: true, consumed: true });
    }
    default:
      return Object.freeze({ consumed: false });
  }
}

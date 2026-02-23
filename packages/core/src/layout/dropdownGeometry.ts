import type { DropdownProps } from "../widgets/types.js";
import { calculateAnchorPosition } from "./positioning.js";
import { measureTextCells } from "./textMeasure.js";
import type { Rect } from "./types.js";

export function computeDropdownGeometry(
  props: DropdownProps,
  anchorRect: Rect | null,
  viewport: Readonly<{ cols: number; rows: number }>,
): Rect | null {
  if (!anchorRect || viewport.cols <= 0 || viewport.rows <= 0) return null;

  const items = Array.isArray(props.items) ? props.items : [];
  let maxLabelW = 0;
  let maxShortcutW = 0;
  for (const item of items) {
    if (!item || item.divider) continue;
    const labelW = measureTextCells(item.label);
    if (labelW > maxLabelW) maxLabelW = labelW;
    const shortcut = item.shortcut;
    if (shortcut && shortcut.length > 0) {
      const shortcutW = measureTextCells(shortcut);
      if (shortcutW > maxShortcutW) maxShortcutW = shortcutW;
    }
  }

  const gapW = maxShortcutW > 0 ? 1 : 0;
  const contentW = Math.max(1, maxLabelW + gapW + maxShortcutW);
  const totalW = Math.max(2, contentW + 2);
  const totalH = Math.max(2, items.length + 2);

  const pos = calculateAnchorPosition({
    anchor: anchorRect,
    overlaySize: { w: totalW, h: totalH },
    position: props.position ?? "below-start",
    viewport: { x: 0, y: 0, width: viewport.cols, height: viewport.rows },
    gap: 0,
    flip: true,
  });
  return pos.rect;
}

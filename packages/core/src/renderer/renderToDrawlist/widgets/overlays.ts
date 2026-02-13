import type { DrawlistBuilderV1 } from "../../../index.js";
import { calculateAnchorPosition } from "../../../layout/positioning.js";
import { measureTextCells, truncateWithEllipsis } from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { Theme } from "../../../theme/theme.js";
import { computeCommandPaletteWindow } from "../../../widgets/commandPalette.js";
import { TOAST_HEIGHT, TOAST_ICONS, getToastActionFocusId } from "../../../widgets/toast.js";
import type {
  CommandItem,
  CommandPaletteProps,
  DropdownProps,
  ToolApprovalDialogProps,
} from "../../../widgets/types.js";
import { renderBoxBorder } from "../boxBorder.js";
import type { IdRectIndex } from "../indices.js";
import { isVisibleRect } from "../indices.js";
import { clampNonNegative } from "../spacing.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle } from "../textStyle.js";
import type { CursorInfo } from "../types.js";

type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

const EMPTY_TOASTS: readonly unknown[] = Object.freeze([]);
const I32_MAX = 2147483647;

type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type OverlayFrameColors = Readonly<{
  foreground?: ResolvedTextStyle["fg"];
  background?: ResolvedTextStyle["bg"];
  border?: ResolvedTextStyle["fg"];
}>;

function readString(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

function readRgbChannel(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return Math.max(0, Math.min(255, Math.trunc(raw)));
}

function readRgbColor(raw: unknown): ResolvedTextStyle["fg"] | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const color = raw as { r?: unknown; g?: unknown; b?: unknown };
  const r = readRgbChannel(color.r);
  const g = readRgbChannel(color.g);
  const b = readRgbChannel(color.b);
  if (r === null || g === null || b === null) {
    return undefined;
  }
  return { r, g, b };
}

function readOverlayFrameColors(raw: unknown): OverlayFrameColors {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const frame = raw as {
    foreground?: unknown;
    background?: unknown;
    border?: unknown;
  };
  const foreground = readRgbColor(frame.foreground);
  const background = readRgbColor(frame.background);
  const border = readRgbColor(frame.border);
  return {
    ...(foreground !== undefined ? { foreground } : {}),
    ...(background !== undefined ? { background } : {}),
    ...(border !== undefined ? { border } : {}),
  };
}

function toOverlaySurfaceStyle(
  frame: OverlayFrameColors,
): Readonly<{ fg?: ResolvedTextStyle["fg"]; bg?: ResolvedTextStyle["bg"] }> | undefined {
  if (frame.foreground === undefined && frame.background === undefined) {
    return undefined;
  }
  return {
    ...(frame.foreground !== undefined ? { fg: frame.foreground } : {}),
    ...(frame.background !== undefined ? { bg: frame.background } : {}),
  };
}

function readNonNegativeInt(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const truncated = Math.trunc(raw);
  if (truncated < 0) {
    return 0;
  }
  if (truncated > I32_MAX) {
    return I32_MAX;
  }
  return truncated;
}

function readToastPosition(raw: unknown): ToastPosition {
  switch (raw) {
    case "top-left":
    case "top-center":
    case "top-right":
    case "bottom-left":
    case "bottom-center":
    case "bottom-right":
      return raw;
    default:
      return "bottom-right";
  }
}

function readRiskLevel(raw: unknown): "low" | "medium" | "high" {
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "medium";
}

function riskLevelToThemeColor(theme: Theme, riskLevel: "low" | "medium" | "high") {
  switch (riskLevel) {
    case "low":
      return theme.colors.success;
    case "medium":
      return theme.colors.warning;
    case "high":
      return theme.colors.danger;
  }
}

function toastTypeToThemeColor(theme: Theme, type: "info" | "success" | "warning" | "error") {
  switch (type) {
    case "success":
      return theme.colors.success;
    case "warning":
      return theme.colors.warning;
    case "error":
      return theme.colors.danger;
    default:
      return theme.colors.info;
  }
}

export function renderOverlayWidget(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  rect: Rect,
  viewport: Readonly<{ cols: number; rows: number }>,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  idRectIndex: IdRectIndex,
  cursorInfo: CursorInfo | undefined,
  commandPaletteItemsById: ReadonlyMap<string, readonly CommandItem[]> | undefined,
  commandPaletteLoadingById: ReadonlyMap<string, boolean> | undefined,
  toolApprovalFocusedActionById: ReadonlyMap<string, "allow" | "deny" | "allowSession"> | undefined,
  dropdownSelectedIndexById: ReadonlyMap<string, number> | undefined,
): ResolvedCursor | null {
  const vnode = node.vnode;
  let resolvedCursor: ResolvedCursor | null = null;

  switch (vnode.kind) {
    case "dropdown": {
      const props = vnode.props as DropdownProps;
      const anchor = idRectIndex.get(props.anchorId) ?? null;
      if (!anchor) break;
      const frame = readOverlayFrameColors(props.frameStyle);
      const dropdownStyle = mergeTextStyle(parentStyle, toOverlaySurfaceStyle(frame));
      const borderStyle =
        frame.border !== undefined
          ? mergeTextStyle(dropdownStyle, { fg: frame.border })
          : dropdownStyle;

      const items = Array.isArray(props.items) ? props.items : [];
      const selectedIndex = dropdownSelectedIndexById?.get(props.id) ?? 0;
      let maxLabelW = 0;
      let maxShortcutW = 0;
      for (const item of items) {
        if (!item || item.divider) continue;
        const labelW = measureTextCells(readString(item.label));
        if (labelW > maxLabelW) maxLabelW = labelW;
        const shortcut = readString(item.shortcut);
        if (shortcut.length > 0) {
          const shortcutW = measureTextCells(shortcut);
          if (shortcutW > maxShortcutW) maxShortcutW = shortcutW;
        }
      }

      const gapW = maxShortcutW > 0 ? 1 : 0;
      const contentW = Math.max(1, maxLabelW + gapW + maxShortcutW);
      const totalW = Math.max(2, contentW + 2); // +2 for border
      const totalH = Math.max(2, items.length + 2); // +2 for border

      const pos = calculateAnchorPosition({
        anchor,
        overlaySize: { w: totalW, h: totalH },
        position: props.position ?? "below-start",
        viewport: { x: 0, y: 0, width: viewport.cols, height: viewport.rows },
        gap: 0,
        flip: true,
      });

      const dropdownRect = pos.rect;
      if (!isVisibleRect(dropdownRect)) break;

      if (frame.background !== undefined) {
        builder.fillRect(
          dropdownRect.x,
          dropdownRect.y,
          dropdownRect.w,
          dropdownRect.h,
          dropdownStyle,
        );
      }

      // Render dropdown border
      renderBoxBorder(builder, dropdownRect, "single", undefined, "left", borderStyle);

      // Render items
      const cx = dropdownRect.x + 1;
      let cy = dropdownRect.y + 1;
      const cw = clampNonNegative(dropdownRect.w - 2);

      builder.pushClip(cx, dropdownRect.y + 1, cw, clampNonNegative(dropdownRect.h - 2));
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (!item) {
          cy++;
          continue;
        }
        if (item.divider) {
          // Render divider
          builder.drawText(cx, cy, "\u2500".repeat(cw), borderStyle);
        } else {
          const isSelected = index === selectedIndex;
          const disabled = item.disabled === true;
          const label = readString(item.label);
          const shortcut = readString(item.shortcut);
          const shortcutW = shortcut.length > 0 ? measureTextCells(shortcut) : 0;
          const shortcutSlotW = shortcutW > 0 ? shortcutW + 1 : 0;
          const labelW = Math.max(0, cw - shortcutSlotW);
          if (isSelected) {
            builder.fillRect(cx, cy, cw, 1, { bg: theme.colors.secondary });
          }

          const style = disabled
            ? mergeTextStyle(dropdownStyle, { fg: theme.colors.muted })
            : isSelected
              ? mergeTextStyle(dropdownStyle, {
                  fg: frame.background ?? theme.colors.bg,
                  bold: true,
                })
              : dropdownStyle;
          builder.drawText(cx, cy, truncateWithEllipsis(label, labelW > 0 ? labelW : cw), style);
          if (shortcutW > 0 && cw > shortcutW) {
            const shortcutX = cx + cw - shortcutW;
            if (shortcutX > cx) {
              const shortcutStyle =
                isSelected && !disabled
                  ? mergeTextStyle(dropdownStyle, { fg: theme.colors.info })
                  : mergeTextStyle(style, { dim: true });
              builder.drawText(shortcutX, cy, shortcut, shortcutStyle);
            }
          }
        }
        cy++;
      }
      builder.popClip();
      break;
    }
    case "commandPalette": {
      // Command palette: modal overlay with search input and filtered list
      const props = vnode.props as CommandPaletteProps;
      const open = props.open === true;
      const paletteId = readString(props.id);
      if (!open || !isVisibleRect(rect)) break;

      const focused = paletteId.length > 0 && focusState.focusedId === paletteId;
      const maxVisible = readNonNegativeInt(props.maxVisible, 10);

      const items = paletteId.length > 0 ? (commandPaletteItemsById?.get(paletteId) ?? []) : [];
      const internalLoading =
        paletteId.length > 0 ? (commandPaletteLoadingById?.get(paletteId) ?? false) : false;
      const loading = props.loading === true || internalLoading;
      const frame = readOverlayFrameColors(props.frameStyle);

      // Color palette for command palette
      const paletteBg = frame.background ?? theme.colors.bg;
      const paletteBorder = frame.border ?? theme.colors.border;
      const paletteAccent = theme.colors.primary;
      const paletteText = frame.foreground ?? theme.colors.fg;
      const paletteMuted = theme.colors.muted;
      const paletteSelectedBg = theme.colors.secondary;
      const paletteStyle = mergeTextStyle(parentStyle, {
        fg: paletteText,
        bg: paletteBg,
      });
      const paletteBorderStyle = mergeTextStyle(paletteStyle, { fg: paletteBorder });
      const paletteMutedStyle = mergeTextStyle(paletteStyle, { fg: paletteMuted });
      const paletteAccentStyle = mergeTextStyle(paletteStyle, { fg: paletteAccent });

      // Draw background
      builder.fillRect(rect.x, rect.y, rect.w, rect.h, { bg: paletteBg });
      renderBoxBorder(builder, rect, "single", undefined, "left", paletteBorderStyle);

      // Draw search icon and input field
      const inputY = rect.y + 1;
      const placeholder = readString(props.placeholder, "Search commands...");
      const query = readString(props.query);
      builder.drawText(rect.x + 2, inputY, "◈", paletteAccentStyle);
      const displayText = query.length > 0 ? query : placeholder;
      const textStyle = query.length > 0 ? paletteStyle : paletteMutedStyle;
      const inputW = clampNonNegative(rect.w - 6);
      builder.drawText(rect.x + 4, inputY, truncateWithEllipsis(displayText, inputW), textStyle);

      // v2 cursor: show cursor within query input when focused
      if (focused && cursorInfo) {
        const qx = clampNonNegative(measureTextCells(query));
        const maxCursorDx = Math.max(0, inputW - 1);
        if (inputW > 0) {
          resolvedCursor = {
            x: rect.x + 4 + Math.min(qx, maxCursorDx),
            y: inputY,
            shape: cursorInfo.shape,
            blink: cursorInfo.blink,
          };
        }
      }

      // Draw separator with accent highlight
      const separatorW = clampNonNegative(rect.w - 2);
      if (separatorW > 0) {
        builder.drawText(rect.x + 1, rect.y + 2, "─".repeat(separatorW), paletteBorderStyle);
      }

      // Loading indicator
      if (loading && rect.w >= 5) {
        builder.drawText(rect.x + rect.w - 5, inputY, "···", paletteAccentStyle);
      }

      // Items list - explicit bounds calculation with extra safety margin
      const listPadding = 2; // Padding from border on each side
      const listX = rect.x + listPadding;
      const listY = rect.y + 3;
      // Width: total width minus left/right padding, minus 2 for borders, minus 2 for safety
      const listW = clampNonNegative(rect.w - listPadding * 2 - 4);
      const listH = clampNonNegative(rect.h - 4);

      const selectedIndexRaw = readNonNegativeInt(props.selectedIndex, 0);
      const selectedIndex =
        items.length === 0 ? 0 : Math.max(0, Math.min(selectedIndexRaw, items.length - 1));

      builder.pushClip(listX, listY, listW, listH);
      nodeStack.push(null);

      if (items.length === 0) {
        builder.drawText(
          listX,
          listY,
          truncateWithEllipsis("No matching commands", listW),
          paletteMutedStyle,
        );
        break;
      }

      const visibleCount = Math.min(listH, maxVisible, items.length);
      const win = computeCommandPaletteWindow(selectedIndex, items.length, visibleCount);

      for (let i = 0; i < win.count; i++) {
        const absoluteIndex = win.start + i;
        const item = items[absoluteIndex];
        if (!item) continue;
        const y = listY + i;
        const isSelected = absoluteIndex === selectedIndex;
        const disabled = item.disabled === true;

        // Draw selection highlight with padding
        if (isSelected) {
          builder.fillRect(listX, y, listW, 1, { bg: paletteSelectedBg });
        }

        // Calculate available width for label (reserve space for shortcut)
        const shortcut = readString(item.shortcut);
        const shortcutWidth = shortcut ? measureTextCells(shortcut) + 2 : 0;
        const labelMaxWidth = Math.max(0, listW - 1 - shortcutWidth);

        // Draw label
        const iconText = readString(item.icon);
        const icon = iconText.length > 0 ? `${iconText} ` : "";
        const labelStyle = disabled
          ? paletteMutedStyle
          : isSelected
            ? mergeTextStyle(paletteStyle, { fg: frame.background ?? theme.colors.bg, bold: true })
            : paletteStyle;
        const label = `${icon}${readString(item.label)}`;
        const truncatedLabel = truncateWithEllipsis(label, labelMaxWidth);
        builder.drawText(listX, y, truncatedLabel, labelStyle);

        // Draw shortcut right-aligned
        if (shortcut && listW >= 10) {
          const sw = measureTextCells(shortcut);
          const sx = listX + listW - sw;
          if (sx > listX + measureTextCells(truncatedLabel) + 1) {
            const shortcutStyle = isSelected
              ? mergeTextStyle(paletteStyle, { fg: theme.colors.info })
              : paletteMutedStyle;
            builder.drawText(sx, y, shortcut, shortcutStyle);
          }
        }
      }
      break;
    }
    case "toolApprovalDialog": {
      // Tool approval dialog: modal with tool request details
      const props = vnode.props as ToolApprovalDialogProps;
      if (!props.open || !isVisibleRect(rect)) break;
      const request = props.request as {
        toolName?: unknown;
        riskLevel?: unknown;
        command?: unknown;
      };
      const toolName = readString(request.toolName, "unknown");
      const riskLevel = readRiskLevel(request.riskLevel);
      const command = readString(request.command);

      const dialogBg = theme.colors.bg;
      const dialogStyle = mergeTextStyle(parentStyle, { bg: dialogBg });

      // Draw background and border
      builder.fillRect(rect.x, rect.y, rect.w, rect.h, { bg: dialogBg });
      renderBoxBorder(builder, rect, "single", "Tool Approval", "left", parentStyle);

      const riskColor = riskLevelToThemeColor(theme, riskLevel);

      // Tool name
      builder.drawText(
        rect.x + 2,
        rect.y + 2,
        truncateWithEllipsis(`Tool: ${toolName}`, clampNonNegative(rect.w - 4)),
        dialogStyle,
      );

      // Risk level
      builder.drawText(
        rect.x + 2,
        rect.y + 3,
        `Risk: ${riskLevel.toUpperCase()}`,
        mergeTextStyle(dialogStyle, { fg: riskColor }),
      );

      // Command (if present)
      if (command.length > 0) {
        builder.drawText(rect.x + 2, rect.y + 5, "Command:", dialogStyle);
        builder.drawText(
          rect.x + 2,
          rect.y + 6,
          truncateWithEllipsis(command, clampNonNegative(rect.w - 4)),
          {
            fg: theme.colors.muted,
            bg: dialogBg,
          },
        );
      }

      // Buttons
      const buttonY = rect.y + rect.h - 2;
      const focusedAction =
        toolApprovalFocusedActionById?.get(props.id) ?? props.focusedAction ?? "allow";
      const btnOn = mergeTextStyle(dialogStyle, { fg: theme.colors.bg, bg: theme.colors.info });
      const btnOff = mergeTextStyle(dialogStyle, { fg: theme.colors.fg });
      builder.drawText(rect.x + 2, buttonY, "[Allow]", focusedAction === "allow" ? btnOn : btnOff);
      builder.drawText(rect.x + 12, buttonY, "[Deny]", focusedAction === "deny" ? btnOn : btnOff);
      if (props.onAllowForSession) {
        builder.drawText(
          rect.x + 21,
          buttonY,
          "[Allow Session]",
          focusedAction === "allowSession" ? btnOn : btnOff,
        );
      }
      break;
    }
    case "toastContainer": {
      // Toast container: renders stacked toast notifications
      if (!isVisibleRect(rect)) break;

      const props = vnode.props as {
        toasts?: unknown;
        position?: unknown;
        maxVisible?: unknown;
        frameStyle?: unknown;
      };
      const frame = readOverlayFrameColors(props.frameStyle);
      const toastBaseStyle = mergeTextStyle(parentStyle, toOverlaySurfaceStyle(frame));
      const toasts = Array.isArray(props.toasts) ? props.toasts : EMPTY_TOASTS;
      const position = readToastPosition(props.position);
      const maxVisible = readNonNegativeInt(props.maxVisible, 5);
      const maxByHeight = Math.floor(rect.h / TOAST_HEIGHT);
      const visibleCount = Math.min(toasts.length, maxVisible, maxByHeight);

      for (let i = 0; i < visibleCount; i++) {
        const toast = toasts[i];
        if (!toast || typeof toast !== "object") continue;
        const item = toast as {
          id?: unknown;
          message?: unknown;
          type?: unknown;
          action?: unknown;
        };
        const message = readString(item.message);
        const type =
          item.type === "success" || item.type === "warning" || item.type === "error"
            ? item.type
            : "info";

        const toastY = position.startsWith("top")
          ? rect.y + i * TOAST_HEIGHT
          : rect.y + rect.h - (i + 1) * TOAST_HEIGHT;

        const icon = TOAST_ICONS[type];
        const color = frame.border ?? toastTypeToThemeColor(theme, type);

        // Toast background
        builder.fillRect(rect.x, toastY, rect.w, TOAST_HEIGHT, {
          bg: frame.background ?? theme.colors.bg,
        });

        // Border
        const borderStyle = mergeTextStyle(toastBaseStyle, { fg: color });
        if (rect.w === 1) {
          builder.drawText(rect.x, toastY, "┌", borderStyle);
          builder.drawText(rect.x, toastY + 1, "│", borderStyle);
          builder.drawText(rect.x, toastY + 2, "└", borderStyle);
        } else {
          const inner = rect.w > 2 ? "─".repeat(rect.w - 2) : "";
          builder.drawText(rect.x, toastY, `┌${inner}┐`, borderStyle);
          builder.drawText(rect.x, toastY + 1, "│", borderStyle);
          builder.drawText(rect.x + rect.w - 1, toastY + 1, "│", borderStyle);
          builder.drawText(rect.x, toastY + 2, `└${inner}┘`, borderStyle);
        }

        // Icon and message
        builder.drawText(rect.x + 2, toastY + 1, icon, borderStyle);
        const messageMax = Math.max(0, rect.w - 6);
        builder.drawText(
          rect.x + 4,
          toastY + 1,
          truncateWithEllipsis(message, messageMax),
          toastBaseStyle,
        );

        const action =
          item.action && typeof item.action === "object"
            ? (item.action as { label?: unknown })
            : null;
        if (action && rect.w >= 10) {
          const label = `[${readString(action.label)}]`;
          const lw = measureTextCells(label);
          const ax = rect.x + rect.w - 2 - lw;
          if (ax > rect.x + 4) {
            const focused = focusState.focusedId === getToastActionFocusId(readString(item.id));
            builder.drawText(
              ax,
              toastY + 1,
              truncateWithEllipsis(label, Math.max(0, rect.x + rect.w - 1 - ax)),
              focused ? mergeTextStyle(toastBaseStyle, { fg: color, inverse: true }) : borderStyle,
            );
          }
        }
      }
      break;
    }
    default:
      break;
  }

  return resolvedCursor;
}

import type { DrawlistBuilderV1 } from "../../../index.js";
import type { LayoutTree } from "../../../layout/layout.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { Theme } from "../../../theme/theme.js";
import { createShadowConfig, renderShadow } from "../../shadow.js";
import { asTextStyle } from "../../styles.js";
import { readBoxBorder, readTitleAlign, renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { clampNonNegative, resolveSpacingFromProps } from "../spacing.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle, shouldFillForStyleOverride } from "../textStyle.js";

type ClipRect = Readonly<Rect>;

function clipEquals(a: ClipRect | undefined, b: ClipRect): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function rectIntersects(a: Rect, b: Rect): boolean {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findStackChildRange(
  children: readonly LayoutTree[],
  childCount: number,
  direction: "row" | "column",
  damageRect: Rect,
): Readonly<{ start: number; end: number }> | null {
  const damageStart = direction === "column" ? damageRect.y : damageRect.x;
  const damageEnd =
    direction === "column" ? damageRect.y + damageRect.h : damageRect.x + damageRect.w;

  let start = 0;
  while (start < childCount) {
    const child = children[start];
    if (!child) {
      start++;
      continue;
    }
    const childStart = direction === "column" ? child.rect.y : child.rect.x;
    const childSize = direction === "column" ? child.rect.h : child.rect.w;
    const childEnd = childStart + childSize;
    if (childEnd > damageStart) break;
    start++;
  }
  if (start >= childCount) return null;

  let endExclusive = start;
  while (endExclusive < childCount) {
    const child = children[endExclusive];
    if (!child) {
      endExclusive++;
      continue;
    }
    const childStart = direction === "column" ? child.rect.y : child.rect.x;
    if (childStart >= damageEnd) break;
    endExclusive++;
  }
  if (endExclusive <= start) return null;
  return { start, end: endExclusive - 1 };
}

function pushChildrenWithLayout(
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  style: ResolvedTextStyle,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (ClipRect | undefined)[],
  clip: ClipRect | undefined,
  damageRect: Rect | undefined,
  stackDirection: "row" | "column" | undefined = undefined,
): void {
  const childCount = Math.min(node.children.length, layoutNode.children.length);
  if (childCount <= 0) return;

  let rangeStart = 0;
  let rangeEnd = childCount - 1;
  if (damageRect) {
    if (stackDirection) {
      const range = findStackChildRange(
        layoutNode.children,
        childCount,
        stackDirection,
        damageRect,
      );
      if (!range) return;
      rangeStart = range.start;
      rangeEnd = range.end;
    }
  }

  for (let i = rangeEnd; i >= rangeStart; i--) {
    const c = node.children[i];
    const lc = layoutNode.children[i];
    if (c && lc && (!damageRect || rectIntersects(lc.rect, damageRect))) {
      nodeStack.push(c);
      styleStack.push(style);
      layoutStack.push(lc);
      clipStack.push(clip);
    }
  }
}

function readShadowDensity(raw: unknown): "light" | "medium" | "dense" | undefined {
  if (raw === "light" || raw === "medium" || raw === "dense") {
    return raw;
  }
  return undefined;
}

function readShadowOffset(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const value = Math.trunc(raw);
  return value <= 0 ? 0 : value;
}

function resolveBoxShadowConfig(
  shadow: unknown,
  theme: Theme,
): ReturnType<typeof createShadowConfig> | null {
  if (shadow !== true && (shadow === false || shadow === undefined || shadow === null)) {
    return null;
  }

  if (shadow === true) {
    return createShadowConfig({ color: theme.colors.border });
  }

  if (typeof shadow !== "object") {
    return null;
  }

  const config = shadow as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  const offsetX = readShadowOffset(config.offsetX, 1);
  const offsetY = readShadowOffset(config.offsetY, 1);
  const density = readShadowDensity(config.density);
  if (offsetX <= 0 && offsetY <= 0) {
    return null;
  }
  return createShadowConfig({
    color: theme.colors.border,
    offsetX,
    offsetY,
    ...(density !== undefined ? { density } : {}),
  });
}

export function renderContainerWidget(
  builder: DrawlistBuilderV1,
  rect: Rect,
  currentClip: ClipRect | undefined,
  viewport: Readonly<{ cols: number; rows: number }>,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (ClipRect | undefined)[],
  damageRect: Rect | undefined,
): void {
  const vnode = node.vnode;

  switch (vnode.kind) {
    case "row":
    case "column": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        pad?: unknown;
        p?: unknown;
        px?: unknown;
        py?: unknown;
        pt?: unknown;
        pb?: unknown;
        pl?: unknown;
        pr?: unknown;
        style?: unknown;
      };
      const ownStyle = asTextStyle(props.style);
      const style = ownStyle ? mergeTextStyle(parentStyle, ownStyle) : parentStyle;
      if (ownStyle && shouldFillForStyleOverride(ownStyle)) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, style);
      }

      const spacing = resolveSpacingFromProps(props);

      // Fast path: no spacing → childClip equals rect, avoid allocation.
      if (spacing.top === 0 && spacing.right === 0 && spacing.bottom === 0 && spacing.left === 0) {
        if (!clipEquals(currentClip, rect)) {
          builder.pushClip(rect.x, rect.y, rect.w, rect.h);
          nodeStack.push(null);
        }
        pushChildrenWithLayout(
          node,
          layoutNode,
          style,
          nodeStack,
          styleStack,
          layoutStack,
          clipStack,
          rect,
          damageRect,
          vnode.kind,
        );
        break;
      }

      const cx = rect.x + spacing.left;
      const cy = rect.y + spacing.top;
      const cw = clampNonNegative(rect.w - spacing.left - spacing.right);
      const ch = clampNonNegative(rect.h - spacing.top - spacing.bottom);
      const childClip: ClipRect = { x: cx, y: cy, w: cw, h: ch };

      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(cx, cy, cw, ch);
        nodeStack.push(null);
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        style,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
        damageRect,
        vnode.kind,
      );
      break;
    }
    case "box": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        pad?: unknown;
        p?: unknown;
        px?: unknown;
        py?: unknown;
        pt?: unknown;
        pb?: unknown;
        pl?: unknown;
        pr?: unknown;
        border?: unknown;
        borderTop?: unknown;
        borderRight?: unknown;
        borderBottom?: unknown;
        borderLeft?: unknown;
        title?: unknown;
        titleAlign?: unknown;
        shadow?: unknown;
        style?: unknown;
      };
      const spacing = resolveSpacingFromProps(props);
      const border = readBoxBorder(props.border);
      const defaultSide = border !== "none";
      const borderTop = typeof props.borderTop === "boolean" ? props.borderTop : defaultSide;
      const borderRight = typeof props.borderRight === "boolean" ? props.borderRight : defaultSide;
      const borderBottom =
        typeof props.borderBottom === "boolean" ? props.borderBottom : defaultSide;
      const borderLeft = typeof props.borderLeft === "boolean" ? props.borderLeft : defaultSide;
      const title = typeof props.title === "string" ? props.title : undefined;
      const titleAlign = readTitleAlign(props.titleAlign);
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(parentStyle, ownStyle);
      const shadowConfig = resolveBoxShadowConfig(props.shadow, theme);
      if (shadowConfig) {
        renderShadow(builder, rect, shadowConfig, style);
      }
      if (isVisibleRect(rect) && shouldFillForStyleOverride(ownStyle)) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, style);
      }

      renderBoxBorder(builder, rect, border, title, titleAlign, style, {
        top: borderTop,
        right: borderRight,
        bottom: borderBottom,
        left: borderLeft,
      });

      const bt = border === "none" || !borderTop ? 0 : 1;
      const br = border === "none" || !borderRight ? 0 : 1;
      const bb = border === "none" || !borderBottom ? 0 : 1;
      const bl = border === "none" || !borderLeft ? 0 : 1;

      const cx = rect.x + bl + spacing.left;
      const cy = rect.y + bt + spacing.top;
      const cw = clampNonNegative(rect.w - bl - br - spacing.left - spacing.right);
      const ch = clampNonNegative(rect.h - bt - bb - spacing.top - spacing.bottom);
      const childClip: ClipRect = { x: cx, y: cy, w: cw, h: ch };

      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(cx, cy, cw, ch);
        nodeStack.push(null);
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        style,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
        damageRect,
      );
      break;
    }
    case "modal": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { title?: unknown; backdrop?: unknown };
      const title = typeof props.title === "string" ? props.title : undefined;
      const backdrop =
        props.backdrop === "none" ? "none" : props.backdrop === "opaque" ? "opaque" : "dim";

      const fill = currentClip ?? { x: 0, y: 0, w: viewport.cols, h: viewport.rows };
      if (backdrop === "opaque") {
        builder.fillRect(fill.x, fill.y, fill.w, fill.h, { bg: theme.colors.bg });
      } else if (backdrop === "dim") {
        if (fill.w > 0 && fill.h > 0) {
          const line = "░".repeat(fill.w);
          const style: ResolvedTextStyle = { fg: theme.colors.border, bg: theme.colors.bg };
          for (let dy = 0; dy < fill.h; dy++) {
            builder.drawText(fill.x, fill.y + dy, line, style);
          }
        }
      }

      renderBoxBorder(builder, rect, "single", title, "left", parentStyle);

      // Clip modal interior (exclude border)
      const cx = rect.x + 1;
      const cy = rect.y + 1;
      const cw = clampNonNegative(rect.w - 2);
      const ch = clampNonNegative(rect.h - 2);
      const childClip: ClipRect = { x: cx, y: cy, w: cw, h: ch };

      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(cx, cy, cw, ch);
        nodeStack.push(null);
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
        damageRect,
      );
      break;
    }
    case "focusZone":
    case "focusTrap": {
      // Focus zones and traps are transparent - just render children
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        currentClip,
        damageRect,
      );
      break;
    }
    case "layers": {
      // Layers container: render children in order (later = on top)
      // Each child is rendered at the same position
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        currentClip,
        damageRect,
      );
      break;
    }
    case "layer": {
      // Generic layer: transparent container for its content VNode.
      const props = vnode.props as { backdrop?: unknown };
      const backdrop =
        props.backdrop === "dim" || props.backdrop === "opaque" || props.backdrop === "none"
          ? props.backdrop
          : "none";
      if (backdrop !== "none") {
        const fill = currentClip ?? { x: 0, y: 0, w: viewport.cols, h: viewport.rows };
        if (backdrop === "opaque") {
          builder.fillRect(fill.x, fill.y, fill.w, fill.h, { bg: theme.colors.bg });
        } else if (backdrop === "dim") {
          if (fill.w > 0 && fill.h > 0) {
            const line = "░".repeat(fill.w);
            const style: ResolvedTextStyle = { fg: theme.colors.border, bg: theme.colors.bg };
            for (let dy = 0; dy < fill.h; dy++) {
              builder.drawText(fill.x, fill.y + dy, line, style);
            }
          }
        }
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        currentClip,
        damageRect,
      );
      break;
    }
    case "splitPane": {
      // Split pane: renders children with dividers between them
      if (!isVisibleRect(rect)) break;

      const { direction, dividerSize = 1 } = vnode.props;
      const dividerStyle = mergeTextStyle(parentStyle, { fg: theme.colors.border });

      const childClip: ClipRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        nodeStack.push(null);
      }

      // Render children (handled by layout)
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
        damageRect,
      );

      // Render dividers between panels
      const childCount = Math.min(node.children.length, layoutNode.children.length);
      if (direction === "horizontal") {
        for (let i = 0; i < childCount - 1; i++) {
          const nextRect = layoutNode.children[i + 1]?.rect;
          if (!nextRect) continue;

          // Divider starts immediately before the next panel's x.
          const offset = nextRect.x - rect.x - dividerSize;
          if (offset < 0 || offset >= rect.w) continue;

          const width = Math.min(dividerSize, rect.w - offset);
          for (let dx = 0; dx < width; dx++) {
            for (let dy = 0; dy < rect.h; dy++) {
              builder.drawText(rect.x + offset + dx, rect.y + dy, "│", dividerStyle);
            }
          }
        }
      } else {
        for (let i = 0; i < childCount - 1; i++) {
          const nextRect = layoutNode.children[i + 1]?.rect;
          if (!nextRect) continue;

          // Divider starts immediately before the next panel's y.
          const offset = nextRect.y - rect.y - dividerSize;
          if (offset < 0 || offset >= rect.h) continue;

          const line = rect.w > 0 ? "─".repeat(rect.w) : "";
          const height = Math.min(dividerSize, rect.h - offset);
          for (let dy = 0; dy < height; dy++) {
            builder.drawText(rect.x, rect.y + offset + dy, line, dividerStyle);
          }
        }
      }
      break;
    }
    case "panelGroup": {
      // Panel group: similar to splitPane
      if (!isVisibleRect(rect)) break;

      const childClip: ClipRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        nodeStack.push(null);
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
        damageRect,
      );
      break;
    }
    case "resizablePanel": {
      // Resizable panel: renders children
      if (!isVisibleRect(rect)) break;

      const childClip: ClipRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        nodeStack.push(null);
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        parentStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
        damageRect,
      );
      break;
    }
    default:
      break;
  }
}

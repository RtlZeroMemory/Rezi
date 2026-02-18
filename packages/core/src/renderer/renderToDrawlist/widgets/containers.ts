import type { DrawlistBuilderV1 } from "../../../index.js";
import type { LayoutTree } from "../../../layout/layout.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { Theme } from "../../../theme/theme.js";
import {
  SCROLLBAR_CONFIGS,
  renderHorizontalScrollbar,
  renderVerticalScrollbar,
} from "../../scrollbar.js";
import { createShadowConfig, renderShadow } from "../../shadow.js";
import { asTextStyle } from "../../styles.js";
import { readBoxBorder, readTitleAlign, renderBoxBorder } from "../boxBorder.js";
import { getRuntimeNodeDamageRect } from "../damageBounds.js";
import { isVisibleRect } from "../indices.js";
import { clampNonNegative, resolveSpacingFromProps } from "../spacing.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle, shouldFillForStyleOverride } from "../textStyle.js";

type ClipRect = Readonly<Rect>;
type OverlayFrameColors = Readonly<{
  foreground?: ResolvedTextStyle["fg"];
  background?: ResolvedTextStyle["bg"];
  border?: ResolvedTextStyle["fg"];
}>;

type ModalBackdropConfig = Readonly<{
  variant: "none" | "dim" | "opaque";
  pattern: string;
  foreground?: ResolvedTextStyle["fg"];
  background?: ResolvedTextStyle["bg"];
}>;

type OverflowMode = "visible" | "hidden" | "scroll";
type OverflowMetadata = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

type ScrollViewport = Readonly<{
  viewportRect: Rect;
  showVertical: boolean;
  showHorizontal: boolean;
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
}>;

const SCROLLBAR_RENDER_CONFIG = {
  ...SCROLLBAR_CONFIGS.minimal,
  minThumbSize: 1,
};

function clipEquals(a: ClipRect | undefined, b: ClipRect): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function rectIntersects(a: Rect, b: Rect): boolean {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findStackChildRange(
  runtimeChildren: readonly RuntimeInstance[],
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
    const runtimeChild = runtimeChildren[start];
    const child = children[start];
    if (!runtimeChild || !child) {
      start++;
      continue;
    }
    const childRect = getRuntimeNodeDamageRect(runtimeChild, child.rect);
    const childStart = direction === "column" ? childRect.y : childRect.x;
    const childSize = direction === "column" ? childRect.h : childRect.w;
    const childEnd = childStart + childSize;
    if (childEnd > damageStart) break;
    start++;
  }
  if (start >= childCount) return null;

  let endExclusive = start;
  while (endExclusive < childCount) {
    const runtimeChild = runtimeChildren[endExclusive];
    const child = children[endExclusive];
    if (!runtimeChild || !child) {
      endExclusive++;
      continue;
    }
    const childRect = getRuntimeNodeDamageRect(runtimeChild, child.rect);
    const childStart = direction === "column" ? childRect.y : childRect.x;
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
        node.children,
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
    if (
      c &&
      lc &&
      (!damageRect || rectIntersects(getRuntimeNodeDamageRect(c, lc.rect), damageRect))
    ) {
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

function readRgbChannel(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(255, Math.trunc(raw)));
  return clamped;
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

function readBackdropVariant(
  raw: unknown,
  fallback: ModalBackdropConfig["variant"],
): ModalBackdropConfig["variant"] {
  if (raw === "none" || raw === "dim" || raw === "opaque") {
    return raw;
  }
  return fallback;
}

function readBackdropPattern(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  const first = Array.from(raw)[0];
  if (first === undefined || first.length === 0) {
    return fallback;
  }
  return first;
}

function resolveModalBackdrop(raw: unknown): ModalBackdropConfig {
  if (raw === "none" || raw === "dim" || raw === "opaque") {
    return { variant: raw, pattern: "░" };
  }

  if (typeof raw !== "object" || raw === null) {
    return { variant: "dim", pattern: "░" };
  }

  const config = raw as {
    variant?: unknown;
    style?: unknown;
    pattern?: unknown;
    foreground?: unknown;
    background?: unknown;
    fg?: unknown;
    bg?: unknown;
  };
  const foreground = readRgbColor(config.foreground ?? config.fg);
  const background = readRgbColor(config.background ?? config.bg);
  return {
    variant: readBackdropVariant(config.variant ?? config.style, "dim"),
    pattern: readBackdropPattern(config.pattern, "░"),
    ...(foreground !== undefined ? { foreground } : {}),
    ...(background !== undefined ? { background } : {}),
  };
}

function clampNonNegativeInt(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const n = Math.trunc(raw);
  return n <= 0 ? 0 : n;
}

function readOverflowMode(raw: unknown): OverflowMode {
  if (raw === "hidden" || raw === "scroll") {
    return raw;
  }
  return "visible";
}

function readOverflowMetadata(layoutNode: LayoutTree, contentRect: Rect): OverflowMetadata {
  const meta = layoutNode.meta as
    | {
        scrollX?: unknown;
        scrollY?: unknown;
        contentWidth?: unknown;
        contentHeight?: unknown;
        viewportWidth?: unknown;
        viewportHeight?: unknown;
      }
    | undefined;
  const viewportWidth = clampNonNegativeInt(meta?.viewportWidth) || contentRect.w;
  const viewportHeight = clampNonNegativeInt(meta?.viewportHeight) || contentRect.h;
  const contentWidth = Math.max(clampNonNegativeInt(meta?.contentWidth), viewportWidth);
  const contentHeight = Math.max(clampNonNegativeInt(meta?.contentHeight), viewportHeight);
  const maxScrollX = Math.max(0, contentWidth - viewportWidth);
  const maxScrollY = Math.max(0, contentHeight - viewportHeight);
  return {
    scrollX: Math.min(clampNonNegativeInt(meta?.scrollX), maxScrollX),
    scrollY: Math.min(clampNonNegativeInt(meta?.scrollY), maxScrollY),
    contentWidth,
    contentHeight,
    viewportWidth,
    viewportHeight,
  };
}

function resolveScrollViewport(contentRect: Rect, meta: OverflowMetadata): ScrollViewport {
  let showVertical = meta.contentHeight > contentRect.h;
  let showHorizontal = meta.contentWidth > contentRect.w;

  for (let i = 0; i < 2; i++) {
    const nextViewportW = clampNonNegative(contentRect.w - (showVertical ? 1 : 0));
    const nextViewportH = clampNonNegative(contentRect.h - (showHorizontal ? 1 : 0));
    const nextVertical = meta.contentHeight > nextViewportH;
    const nextHorizontal = meta.contentWidth > nextViewportW;
    if (nextVertical === showVertical && nextHorizontal === showHorizontal) {
      break;
    }
    showVertical = nextVertical;
    showHorizontal = nextHorizontal;
  }

  const viewportW = clampNonNegative(contentRect.w - (showVertical ? 1 : 0));
  const viewportH = clampNonNegative(contentRect.h - (showHorizontal ? 1 : 0));
  const maxScrollX = Math.max(0, meta.contentWidth - viewportW);
  const maxScrollY = Math.max(0, meta.contentHeight - viewportH);

  return {
    viewportRect: {
      x: contentRect.x,
      y: contentRect.y,
      w: viewportW,
      h: viewportH,
    },
    showVertical,
    showHorizontal,
    scrollX: Math.min(meta.scrollX, maxScrollX),
    scrollY: Math.min(meta.scrollY, maxScrollY),
    contentWidth: meta.contentWidth,
    contentHeight: meta.contentHeight,
  };
}

function drawScrollbars(
  builder: DrawlistBuilderV1,
  viewport: ScrollViewport,
  style: ResolvedTextStyle,
  theme: Theme,
): void {
  const scrollbarStyle = mergeTextStyle(style, { fg: theme.colors.border });

  if (viewport.showVertical && viewport.viewportRect.h > 0) {
    const maxScrollY = Math.max(0, viewport.contentHeight - viewport.viewportRect.h);
    const position = maxScrollY > 0 ? viewport.scrollY / maxScrollY : 0;
    const viewportRatio =
      viewport.contentHeight > 0
        ? Math.min(1, viewport.viewportRect.h / viewport.contentHeight)
        : 1;
    const glyphs = renderVerticalScrollbar(
      viewport.viewportRect.h,
      { position, viewportRatio },
      SCROLLBAR_RENDER_CONFIG,
    );
    const x = viewport.viewportRect.x + viewport.viewportRect.w;
    for (let dy = 0; dy < glyphs.length; dy++) {
      const glyph = glyphs[dy];
      if (!glyph) continue;
      builder.drawText(x, viewport.viewportRect.y + dy, glyph, scrollbarStyle);
    }
  }

  if (viewport.showHorizontal && viewport.viewportRect.w > 0) {
    const maxScrollX = Math.max(0, viewport.contentWidth - viewport.viewportRect.w);
    const position = maxScrollX > 0 ? viewport.scrollX / maxScrollX : 0;
    const viewportRatio =
      viewport.contentWidth > 0 ? Math.min(1, viewport.viewportRect.w / viewport.contentWidth) : 1;
    const glyphs = renderHorizontalScrollbar(
      viewport.viewportRect.w,
      { position, viewportRatio },
      SCROLLBAR_RENDER_CONFIG,
    );
    const y = viewport.viewportRect.y + viewport.viewportRect.h;
    for (let dx = 0; dx < glyphs.length; dx++) {
      const glyph = glyphs[dx];
      if (!glyph) continue;
      builder.drawText(viewport.viewportRect.x + dx, y, glyph, scrollbarStyle);
    }
  }

  if (viewport.showVertical && viewport.showHorizontal) {
    const x = viewport.viewportRect.x + viewport.viewportRect.w;
    const y = viewport.viewportRect.y + viewport.viewportRect.h;
    const corner = SCROLLBAR_RENDER_CONFIG.glyphs?.track ?? " ";
    builder.drawText(x, y, corner, scrollbarStyle);
  }
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
    case "column":
    case "grid": {
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
        overflow?: unknown;
        style?: unknown;
      };
      const ownStyle = asTextStyle(props.style);
      const style = ownStyle ? mergeTextStyle(parentStyle, ownStyle) : parentStyle;
      if (ownStyle && shouldFillForStyleOverride(ownStyle)) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, style);
      }

      const spacing = resolveSpacingFromProps(props);
      const cx = rect.x + spacing.left;
      const cy = rect.y + spacing.top;
      const cw = clampNonNegative(rect.w - spacing.left - spacing.right);
      const ch = clampNonNegative(rect.h - spacing.top - spacing.bottom);
      const contentRect: ClipRect = { x: cx, y: cy, w: cw, h: ch };
      const overflowMode = readOverflowMode(props.overflow);

      let childClip: ClipRect = contentRect;
      if (overflowMode === "scroll") {
        const meta = readOverflowMetadata(layoutNode, contentRect);
        const viewportWithScrollbars = resolveScrollViewport(contentRect, meta);
        drawScrollbars(builder, viewportWithScrollbars, style, theme);
        childClip = viewportWithScrollbars.viewportRect;
      }

      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(childClip.x, childClip.y, childClip.w, childClip.h);
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
        vnode.kind === "row" || vnode.kind === "column" ? vnode.kind : undefined,
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
        overflow?: unknown;
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
      const contentRect: ClipRect = { x: cx, y: cy, w: cw, h: ch };
      const overflowMode = readOverflowMode(props.overflow);
      let childClip: ClipRect = contentRect;

      if (overflowMode === "scroll") {
        const meta = readOverflowMetadata(layoutNode, contentRect);
        const viewportWithScrollbars = resolveScrollViewport(contentRect, meta);
        drawScrollbars(builder, viewportWithScrollbars, style, theme);
        childClip = viewportWithScrollbars.viewportRect;
      }

      if (!clipEquals(currentClip, childClip)) {
        builder.pushClip(childClip.x, childClip.y, childClip.w, childClip.h);
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
      const props = vnode.props as { title?: unknown; backdrop?: unknown; frameStyle?: unknown };
      const title = typeof props.title === "string" ? props.title : undefined;
      const frame = readOverlayFrameColors(props.frameStyle);
      const surfaceStyle = mergeTextStyle(parentStyle, toOverlaySurfaceStyle(frame));
      const borderStyle =
        frame.border !== undefined
          ? mergeTextStyle(surfaceStyle, { fg: frame.border })
          : surfaceStyle;
      const backdrop = resolveModalBackdrop(props.backdrop);

      const fill = currentClip ?? { x: 0, y: 0, w: viewport.cols, h: viewport.rows };
      if (backdrop.variant === "opaque") {
        builder.fillRect(fill.x, fill.y, fill.w, fill.h, {
          bg: backdrop.background ?? theme.colors.bg,
        });
      } else if (backdrop.variant === "dim") {
        if (fill.w > 0 && fill.h > 0) {
          const line = backdrop.pattern.repeat(fill.w);
          const style: ResolvedTextStyle = {
            fg: backdrop.foreground ?? theme.colors.border,
            bg: backdrop.background ?? theme.colors.bg,
          };
          for (let dy = 0; dy < fill.h; dy++) {
            builder.drawText(fill.x, fill.y + dy, line, style);
          }
        }
      }

      if (frame.background !== undefined) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, surfaceStyle);
      }

      renderBoxBorder(builder, rect, "single", title, "left", borderStyle);

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
        surfaceStyle,
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
      const props = vnode.props as { backdrop?: unknown; frameStyle?: unknown };
      const frame = readOverlayFrameColors(props.frameStyle);
      const layerStyle = mergeTextStyle(parentStyle, toOverlaySurfaceStyle(frame));
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
      if (frame.background !== undefined) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, layerStyle);
      }
      if (frame.border !== undefined) {
        const borderStyle = mergeTextStyle(layerStyle, { fg: frame.border });
        renderBoxBorder(builder, rect, "single", undefined, "left", borderStyle);
      }
      const borderInset = frame.border !== undefined ? 1 : 0;
      const childClip: ClipRect | undefined =
        borderInset > 0
          ? {
              x: rect.x + borderInset,
              y: rect.y + borderInset,
              w: clampNonNegative(rect.w - borderInset * 2),
              h: clampNonNegative(rect.h - borderInset * 2),
            }
          : currentClip;
      if (childClip && !clipEquals(currentClip, childClip)) {
        builder.pushClip(childClip.x, childClip.y, childClip.w, childClip.h);
        nodeStack.push(null);
      }
      pushChildrenWithLayout(
        node,
        layoutNode,
        layerStyle,
        nodeStack,
        styleStack,
        layoutStack,
        clipStack,
        childClip,
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

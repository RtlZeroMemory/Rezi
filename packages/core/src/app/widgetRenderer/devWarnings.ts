import type { LayoutTree } from "../../layout/layout.js";

export type DevWarningsViewport = Readonly<{ cols: number; rows: number }>;

type WarnLayoutIssueContext = Readonly<{
  devMode: boolean;
  warnedLayoutIssues: Set<string>;
  warn: (message: string) => void;
}>;

type WarnShortcutIssueContext = Readonly<{
  devMode: boolean;
  warnedShortcutIssues: Set<string>;
  warn: (message: string) => void;
}>;

type EmitDevLayoutWarningsContext = WarnLayoutIssueContext &
  Readonly<{
    pooledLayoutStack: LayoutTree[];
  }>;

const ZERO_RECT_DRAWABLE_KINDS = new Set<string>([
  "canvas",
  "image",
  "lineChart",
  "barChart",
  "scatter",
  "heatmap",
  "sparkline",
  "gauge",
  "miniChart",
]);

export function describeLayoutNode(node: LayoutTree): string {
  const props = node.vnode.props as { id?: unknown } | undefined;
  const id = typeof props?.id === "string" && props.id.length > 0 ? `#${props.id}` : "";
  return `${node.vnode.kind}${id}`;
}

export function warnLayoutIssue(ctx: WarnLayoutIssueContext, key: string, detail: string): void {
  if (!ctx.devMode) return;
  if (ctx.warnedLayoutIssues.has(key)) return;
  ctx.warnedLayoutIssues.add(key);
  ctx.warn(`[rezi][layout] ${detail}`);
}

export function warnShortcutIssue(
  ctx: WarnShortcutIssueContext,
  key: string,
  detail: string,
): void {
  if (!ctx.devMode) return;
  if (ctx.warnedShortcutIssues.has(key)) return;
  ctx.warnedShortcutIssues.add(key);
  ctx.warn(`[rezi][shortcuts] ${detail}`);
}

export function emitDevLayoutWarnings(
  ctx: EmitDevLayoutWarningsContext,
  root: LayoutTree,
  viewport: DevWarningsViewport,
): void {
  if (!ctx.devMode) return;

  ctx.pooledLayoutStack.length = 0;
  ctx.pooledLayoutStack.push(root);

  while (ctx.pooledLayoutStack.length > 0) {
    const node = ctx.pooledLayoutStack.pop();
    if (!node) continue;

    const desc = describeLayoutNode(node);
    const nodeProps = node.vnode.props as
      | Readonly<{
          id?: unknown;
          items?: unknown;
          data?: unknown;
        }>
      | undefined;
    if (
      (node.vnode.kind === "button" ||
        node.vnode.kind === "input" ||
        node.vnode.kind === "select" ||
        node.vnode.kind === "checkbox") &&
      (typeof nodeProps?.id !== "string" || nodeProps.id.length === 0)
    ) {
      warnLayoutIssue(
        ctx,
        `missingInteractiveId:${node.vnode.kind}:${node.rect.x}:${node.rect.y}`,
        `<${node.vnode.kind}> is interactive but missing an id. Hint: Provide a stable id (use ctx.id() in defineWidget for dynamic items).`,
      );
    }
    if (
      node.vnode.kind === "virtualList" &&
      Array.isArray(nodeProps?.items) &&
      nodeProps.items.length === 0
    ) {
      warnLayoutIssue(
        ctx,
        `emptyVirtualList:${desc}`,
        `${desc} rendered with 0 items. Hint: Ensure your data is loaded before rendering virtualList.`,
      );
    }
    if (
      node.vnode.kind === "table" &&
      Array.isArray(nodeProps?.data) &&
      nodeProps.data.length === 0
    ) {
      warnLayoutIssue(
        ctx,
        `emptyTable:${desc}`,
        `${desc} rendered with 0 rows. Hint: Ensure your data is loaded before rendering table.`,
      );
    }

    const props = node.vnode.props as
      | Readonly<{
          minWidth?: unknown;
          minHeight?: unknown;
        }>
      | undefined;
    const minWidth = typeof props?.minWidth === "number" ? Math.trunc(props.minWidth) : null;
    const minHeight = typeof props?.minHeight === "number" ? Math.trunc(props.minHeight) : null;

    if (minWidth !== null && Number.isFinite(minWidth) && minWidth > viewport.cols) {
      warnLayoutIssue(
        ctx,
        `minWidth:${desc}:${minWidth}`,
        `${desc} minWidth=${String(minWidth)} exceeds viewport width=${String(viewport.cols)}.`,
      );
    }
    if (minHeight !== null && Number.isFinite(minHeight) && minHeight > viewport.rows) {
      warnLayoutIssue(
        ctx,
        `minHeight:${desc}:${minHeight}`,
        `${desc} minHeight=${String(minHeight)} exceeds viewport height=${String(viewport.rows)}.`,
      );
    }

    if (node.rect.w <= 0 || node.rect.h <= 0) {
      if (ZERO_RECT_DRAWABLE_KINDS.has(node.vnode.kind)) {
        warnLayoutIssue(
          ctx,
          `zeroDrawableRect:${desc}:${node.rect.w}x${node.rect.h}`,
          `${desc} resolved to ${String(node.rect.w)}x${String(node.rect.h)}. Drawable widgets with zero-size rects never draw. Hint: ensure non-zero width/height or flex/min constraints.`,
        );
      } else {
        warnLayoutIssue(
          ctx,
          `zeroRect:${desc}:${node.rect.w}x${node.rect.h}`,
          `${desc} resolved to zero-size rect ${String(node.rect.w)}x${String(node.rect.h)} and may be invisible.`,
        );
      }
    }

    if (node.meta && node.meta.viewportWidth <= 0 && node.meta.viewportHeight <= 0) {
      warnLayoutIssue(ctx, `scrollViewport:${desc}`, `${desc} overflow viewport collapsed to 0x0.`);
    }

    for (let i = 0; i < node.children.length; i++) {
      ctx.pooledLayoutStack.push(node.children[i] as LayoutTree);
    }
  }
}

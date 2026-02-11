import { type RichTextSpan, type VNode, ui } from "@rezi-ui/core";
import { InkCompatError } from "../errors.js";
import { mapBoxProps } from "../props.js";
import type { BoxProps } from "../types.js";
import { convertText, sanitizeTextForTerminal, splitSpansByNewline } from "./textUtils.js";
import type { HostElement, HostNode, HostRoot } from "./types.js";

type ConvertCtx = Readonly<{ staticVNodes: VNode[] }>;

type ConvertedChild = Readonly<{ vnode: VNode; estimatedHeight: number }>;
type LayoutSizingProps = Readonly<{
  padding?: unknown;
  paddingY?: unknown;
  paddingTop?: unknown;
  paddingBottom?: unknown;
  borderStyle?: unknown;
  border?: unknown;
  borderTop?: unknown;
  borderBottom?: unknown;
}>;

function coerceNonNegativeNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function resolveVerticalInsets(props: LayoutSizingProps): number {
  const padding = coerceNonNegativeNumber(props.padding) ?? 0;
  const paddingY = coerceNonNegativeNumber(props.paddingY) ?? padding;
  const paddingTop = coerceNonNegativeNumber(props.paddingTop) ?? paddingY;
  const paddingBottom = coerceNonNegativeNumber(props.paddingBottom) ?? paddingY;

  const hasAnyBorder = props.borderStyle !== undefined || props.border !== undefined;
  const borderStyle = props.borderStyle ?? props.border;
  const hasBorder = hasAnyBorder && borderStyle !== "none";
  const borderTop = typeof props.borderTop === "boolean" ? props.borderTop : hasBorder;
  const borderBottom = typeof props.borderBottom === "boolean" ? props.borderBottom : hasBorder;

  return paddingTop + paddingBottom + (borderTop ? 1 : 0) + (borderBottom ? 1 : 0);
}

function estimateTextLines(node: HostElement): number {
  let lines = 0;
  for (const child of node.children) {
    if (child.kind !== "text") continue;
    lines += Math.max(1, sanitizeTextForTerminal(child.text).split("\n").length);
  }
  return Math.max(1, lines);
}

function estimateNodeHeight(node: HostNode): number {
  if (node.kind === "text") {
    return Math.max(1, sanitizeTextForTerminal(node.text).split("\n").length);
  }

  const explicitHeight = coerceNonNegativeNumber((node.props as { height?: unknown }).height);
  if (explicitHeight !== undefined) return explicitHeight;

  if (node.type === "ink-spacer") return 1;
  if (node.type === "ink-text" || node.type === "ink-virtual-text") return estimateTextLines(node);

  const direction = (node.props as { flexDirection?: unknown }).flexDirection;
  const isColumn = direction === "column" || direction === "column-reverse";
  const insets = resolveVerticalInsets(node.props as LayoutSizingProps);

  if (node.children.length === 0) return insets;

  if (isColumn) {
    let total = insets;
    for (const child of node.children) {
      total += estimateNodeHeight(child);
    }
    return total;
  }

  let max = 0;
  for (const child of node.children) {
    const next = estimateNodeHeight(child);
    if (next > max) max = next;
  }
  return insets + max;
}

function applyVerticalScroll(children: readonly ConvertedChild[], scrollTop: number): VNode[] {
  if (children.length === 0 || scrollTop <= 0) return children.map((c) => c.vnode);

  let offset = scrollTop;
  let start = 0;
  while (start < children.length) {
    const child = children[start];
    if (!child) break;
    const h = Math.max(1, Math.round(child.estimatedHeight));
    if (offset < h) break;
    offset -= h;
    start++;
  }

  return children.slice(start).map((c) => c.vnode);
}

function convertNode(node: HostNode, ctx: ConvertCtx): VNode | null {
  if (node.kind === "text") {
    // Strings are only valid inside <Text>. The reconciler enforces this already.
    const text = sanitizeTextForTerminal(node.text);
    if (text.length === 0) return null;
    const spans: RichTextSpan[] = [{ text }];
    if (text.includes("\n")) {
      const lines = splitSpansByNewline(spans);
      const children: VNode[] = lines.map((line) =>
        line.length === 0 ? ui.text("") : ui.text(line[0]?.text ?? ""),
      );
      return children.length === 1 ? (children[0] ?? ui.text("")) : ui.column({}, children);
    }
    return ui.text(text);
  }

  switch (node.type) {
    case "ink-box": {
      const isStatic = (node.props as { internal_static?: unknown }).internal_static === true;
      const mapped = mapBoxProps(node.props as unknown as BoxProps);
      if (mapped.hidden) return null;

      const childVNodes: ConvertedChild[] = [];
      for (const c of node.children) {
        const v = convertNode(c, ctx);
        if (!v) continue;
        childVNodes.push({ vnode: v, estimatedHeight: estimateNodeHeight(c) });
      }
      if (isStatic && childVNodes.length === 0) return null;
      if (mapped.reverseChildren) childVNodes.reverse();
      const visibleChildren =
        mapped.overflowY === "scroll"
          ? applyVerticalScroll(childVNodes, mapped.scrollTop)
          : childVNodes.map((c) => c.vnode);

      const measuredId = node.internal_id;
      const stackPropsWithId = mapped.wrapper
        ? mapped.stackProps
        : { ...mapped.stackProps, id: measuredId };
      const stack =
        mapped.stackKind === "row"
          ? ui.row(stackPropsWithId, visibleChildren)
          : ui.column(stackPropsWithId, visibleChildren);

      const wrapperWithId = mapped.wrapper ? { ...mapped.wrapper, id: measuredId } : null;
      const vnode = wrapperWithId ? ui.box(wrapperWithId, [stack]) : stack;

      if (isStatic) {
        ctx.staticVNodes.push(vnode);
        return null;
      }

      return vnode;
    }
    case "ink-text":
    case "ink-virtual-text":
      return convertText(node);
    case "ink-spacer":
      return ui.spacer({ flex: 1 });
    default:
      throw new InkCompatError("INK_COMPAT_UNSUPPORTED", `Unsupported host type: ${String(node)}`);
  }
}

export function convertRoot(root: HostRoot): VNode {
  const out: VNode[] = [];
  const ctx: ConvertCtx = { staticVNodes: root.staticVNodes };
  for (const c of root.children) {
    const v = convertNode(c, ctx);
    if (v) out.push(v);
  }

  const all = [...root.staticVNodes, ...out];
  if (all.length === 0) return ui.text("");
  if (all.length === 1) return all[0] ?? ui.text("");
  return ui.column({}, all);
}

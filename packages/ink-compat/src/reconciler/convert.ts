import { type RichTextSpan, type VNode, ui } from "@rezi-ui/core";
import { InkCompatError } from "../errors.js";
import { mapBoxProps } from "../props.js";
import type { BoxProps } from "../types.js";
import { convertText, sanitizeTextForTerminal, splitSpansByNewline } from "./textUtils.js";
import type { HostElement, HostNode, HostRoot } from "./types.js";

type ConvertCtx = Readonly<{
  staticByOwner: Map<string, VNode[]>;
  seenStaticOwners: Set<string>;
  terminalWidth?: number;
}>;

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

type InternalTransform = (children: string, index: number) => string;

type ScreenReaderRenderOptions = Readonly<{
  parentRole?: string | undefined;
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

function getInternalTransform(node: HostElement): InternalTransform | null {
  return typeof node.internal_transform === "function" ? (node.internal_transform as InternalTransform) : null;
}

function applyTransformPerLine(text: string, transform: InternalTransform): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    lines[i] = transform(lines[i] ?? "", i);
  }
  return lines.join("\n");
}

function truthyStateKeys(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  return Object.entries(state as Record<string, unknown>)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function applyAccessibilityPrefix(
  text: string,
  node: HostElement,
  parentRole: string | undefined,
): string {
  let out = text;
  const accessibility = node.internal_accessibility;
  if (!accessibility) return out;

  const states = truthyStateKeys(accessibility.state);
  if (states.length > 0) {
    out = `(${states.join(", ")}) ${out}`;
  }

  const role = accessibility.role;
  if (role && role !== parentRole) {
    out = `${role}: ${out}`;
  }

  return out;
}

function flattenTextForScreenReader(node: HostElement): string {
  let out = "";
  for (const child of node.children) {
    if (child.kind === "text") {
      out += sanitizeTextForTerminal(child.text);
      continue;
    }

    if (child.type === "ink-text" || child.type === "ink-virtual-text") {
      out += flattenTextForScreenReader(child);
    }
  }

  const transform = getInternalTransform(node);
  if (transform) {
    out = applyTransformPerLine(out, transform);
  }

  return sanitizeTextForTerminal(out);
}

function renderNodeToScreenReaderOutput(node: HostNode, options: ScreenReaderRenderOptions = {}): string {
  if (node.kind === "text") {
    return sanitizeTextForTerminal(node.text);
  }

  if (node.type === "ink-spacer") {
    return "";
  }

  if (node.type === "ink-text" || node.type === "ink-virtual-text") {
    const out = flattenTextForScreenReader(node);
    return applyAccessibilityPrefix(out, node, options.parentRole);
  }

  const rawDirection =
    (node.style as { flexDirection?: unknown }).flexDirection ??
    (node.props as { flexDirection?: unknown }).flexDirection;
  const direction =
    rawDirection === "row" || rawDirection === "row-reverse" || rawDirection === "column-reverse"
      ? rawDirection
      : "column";

  const childNodes =
    direction === "row-reverse" || direction === "column-reverse"
      ? [...node.children].reverse()
      : node.children;
  const separator = direction === "row" || direction === "row-reverse" ? " " : "\n";

  const out = childNodes
    .map((child) =>
      renderNodeToScreenReaderOutput(child, {
        parentRole: node.internal_accessibility?.role,
      }),
    )
    .filter(Boolean)
    .join(separator);

  return applyAccessibilityPrefix(out, node, options.parentRole);
}

function wrapScreenReaderOutput(text: string, columns: number): string {
  if (columns <= 0 || !Number.isFinite(columns)) return text;
  if (text.length === 0) return text;

  const out: string[] = [];
  const lines = text.split("\n");
  for (const rawLine of lines) {
    let line = rawLine;
    if (line.length === 0) {
      out.push("");
      continue;
    }

    while (line.length > columns) {
      out.push(line.slice(0, columns));
      line = line.slice(columns);
    }
    out.push(line);
  }
  return out.join("\n");
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

      // Ink's <Static> renders its children once and then re-renders with no children
      // (via a layout effect). The static owner remains mounted, so we must keep any
      // previously recorded static output even when there is no new content to append.
      if (isStatic) {
        ctx.seenStaticOwners.add(node.internal_id);
      }

      const childVNodes: ConvertedChild[] = [];
      for (const c of node.children) {
        const v = convertNode(c, ctx);
        if (!v) continue;
        childVNodes.push({ vnode: v, estimatedHeight: estimateNodeHeight(c) });
      }
      if (isStatic && childVNodes.length === 0) return null;
      if (mapped.reverseChildren) childVNodes.reverse();
      const visibleChildren = childVNodes.map((c) => c.vnode);

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
        const owned = ctx.staticByOwner.get(node.internal_id) ?? [];
        owned.push(vnode);
        ctx.staticByOwner.set(node.internal_id, owned);
        return null;
      }

      return vnode;
    }
    case "ink-text":
    case "ink-virtual-text": {
      const terminalWidth = ctx.terminalWidth;
      return terminalWidth === undefined ? convertText(node) : convertText(node, { terminalWidth });
    }
    case "ink-spacer":
      return ui.spacer({ flex: 1 });
    default:
      throw new InkCompatError("INK_COMPAT_UNSUPPORTED", `Unsupported host type: ${String(node)}`);
  }
}

export function convertRoot(root: HostRoot): VNode {
  if (root.internal_isScreenReaderEnabled === true) {
    const staticByOwner = root.internal_screenReaderStaticByOwner ?? new Map<string, string[]>();
    root.internal_screenReaderStaticByOwner = staticByOwner;
    const seenStaticOwners = new Set<string>();

    const out: string[] = [];
    for (const child of root.children) {
      if (child.kind === "element" && child.type === "ink-box") {
        const isStatic = (child.props as { internal_static?: unknown }).internal_static === true;
        if (isStatic) {
          seenStaticOwners.add(child.internal_id);
          const text = renderNodeToScreenReaderOutput(child);
          if (text.length > 0) {
            const owned = staticByOwner.get(child.internal_id) ?? [];
            owned.push(text);
            staticByOwner.set(child.internal_id, owned);
          }
          continue;
        }
      }

      const text = renderNodeToScreenReaderOutput(child);
      if (text.length > 0) out.push(text);
    }

    for (const ownerId of staticByOwner.keys()) {
      if (!seenStaticOwners.has(ownerId)) {
        staticByOwner.delete(ownerId);
      }
    }

    const staticText = Array.from(staticByOwner.values()).flat().filter(Boolean);
    const screenReaderOutput = [...staticText, ...out].join("\n");
    const cols = coerceNonNegativeNumber(root.internal_terminalWidth) ?? 80;
    return ui.text(wrapScreenReaderOutput(screenReaderOutput, Math.max(1, Math.floor(cols))));
  }

  const staticByOwner = root.internal_staticByOwner ?? new Map<string, VNode[]>();
  root.internal_staticByOwner = staticByOwner;
  const seenStaticOwners = new Set<string>();

  const out: VNode[] = [];
  const terminalWidth = coerceNonNegativeNumber(root.internal_terminalWidth);
  const ctx: ConvertCtx = {
    staticByOwner,
    seenStaticOwners,
    ...(terminalWidth !== undefined ? { terminalWidth } : {}),
  };
  for (const c of root.children) {
    const v = convertNode(c, ctx);
    if (v) out.push(v);
  }

  // Drop static owners that are no longer mounted to avoid replaying stale
  // static chunks after keyed remounts (e.g. terminal resize refresh paths).
  for (const ownerId of staticByOwner.keys()) {
    if (!seenStaticOwners.has(ownerId)) {
      staticByOwner.delete(ownerId);
    }
  }

  root.staticVNodes = Array.from(staticByOwner.values()).flat();

  const all = [...root.staticVNodes, ...out];
  if (all.length === 0) return ui.text("");
  if (all.length === 1) return all[0] ?? ui.text("");
  return ui.column({}, all);
}

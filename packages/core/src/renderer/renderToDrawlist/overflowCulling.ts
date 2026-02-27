import type { RuntimeInstance } from "../../runtime/commit.js";

type OverflowProps = Readonly<{
  overflow?: unknown;
  shadow?: unknown;
}>;

function readShadowOffset(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const value = Math.trunc(raw);
  return value <= 0 ? 0 : value;
}

function hasBoxShadowOverflow(node: RuntimeInstance): boolean {
  if (node.vnode.kind !== "box") {
    return false;
  }
  const shadow = (node.vnode.props as OverflowProps).shadow;
  if (shadow === true) {
    return true;
  }
  if (shadow === false || shadow === undefined || shadow === null) {
    return false;
  }
  if (typeof shadow !== "object") {
    return false;
  }
  const config = shadow as Readonly<{ offsetX?: unknown; offsetY?: unknown }>;
  const offsetX = readShadowOffset(config.offsetX, 1);
  const offsetY = readShadowOffset(config.offsetY, 1);
  return offsetX > 0 || offsetY > 0;
}

function hasVisibleOverflow(node: RuntimeInstance): boolean {
  const kind = node.vnode.kind;
  if (kind !== "row" && kind !== "column" && kind !== "grid" && kind !== "box") {
    return false;
  }
  if (node.children.length === 0) {
    return false;
  }
  const props = node.vnode.props as OverflowProps;
  return props.overflow !== "hidden" && props.overflow !== "scroll";
}

function isTransparentOverflowWrapper(node: RuntimeInstance): boolean {
  const kind = node.vnode.kind;
  return kind === "themed" || kind === "focusZone" || kind === "focusTrap";
}

export function subtreeCanOverflowBounds(node: RuntimeInstance): boolean {
  const stack: RuntimeInstance[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (hasVisibleOverflow(current) || hasBoxShadowOverflow(current)) {
      return true;
    }
    if (!isTransparentOverflowWrapper(current)) {
      continue;
    }
    for (let i = current.children.length - 1; i >= 0; i--) {
      const child = current.children[i];
      if (child) {
        stack.push(child);
      }
    }
  }
  return false;
}

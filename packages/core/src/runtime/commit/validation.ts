import { getWidgetProtocol, kindRequiresId } from "../../widgets/protocol.js";
import type { VNode } from "../../widgets/types.js";
import type { InstanceId } from "../instance.js";
import {
  type CommitFatal,
  DEV_MODE,
  type FocusContainerKind,
  MAX_INTERACTIVE_ID_LENGTH,
} from "./shared.js";

export function warnDev(message: string): void {
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

export function widgetPathEntry(vnode: VNode): string {
  const props = vnode.props as { id?: unknown; key?: unknown } | undefined;
  const id = typeof props?.id === "string" && props.id.length > 0 ? `#${props.id}` : "";
  const key =
    typeof props?.key === "string" || typeof props?.key === "number"
      ? `[key=${String(props.key)}]`
      : "";
  return `${vnode.kind}${id}${key}`;
}

export function formatWidgetPath(depth: number, tailPath: readonly string[]): string {
  if (tailPath.length === 0) return "(root)";
  const path = tailPath.join(" -> ");
  return depth > tailPath.length ? `... -> ${path}` : path;
}

function isInteractiveVNode(v: VNode): boolean {
  const proto = getWidgetProtocol(v.kind);
  return proto.requiresId || proto.focusable || proto.pressable;
}

export function ensureInteractiveId(
  seen: Map<string, string>,
  instanceId: InstanceId,
  vnode: VNode,
): CommitFatal | null {
  if (!isInteractiveVNode(vnode)) return null;

  const id = (vnode as { props: { id?: unknown } }).props.id;
  if (typeof id !== "string" || id.length === 0) {
    if (!kindRequiresId(vnode.kind)) return null;
    return {
      code: "ZRUI_INVALID_PROPS",
      detail: `interactive node missing required id (kind=${vnode.kind}, instanceId=${String(instanceId)})`,
    };
  }
  if (id.trim().length === 0) {
    return {
      code: "ZRUI_INVALID_PROPS",
      detail: `interactive node id must contain non-whitespace characters (kind=${vnode.kind}, instanceId=${String(instanceId)})`,
    };
  }

  const existing = seen.get(id);
  if (existing !== undefined) {
    return {
      code: "ZRUI_DUPLICATE_ID",
      detail: `Duplicate interactive widget id "${id}". First: <${existing}>, second: <${vnode.kind}>. Hint: Use ctx.id() inside defineWidget to generate unique IDs for list items.`,
    };
  }
  if (DEV_MODE && id.length > MAX_INTERACTIVE_ID_LENGTH) {
    warnDev(
      `[rezi][commit] interactive widget id exceeds ${String(MAX_INTERACTIVE_ID_LENGTH)} chars (kind=${vnode.kind}, id length=${String(id.length)}). Consider using shorter IDs.`,
    );
  }
  seen.set(id, vnode.kind);
  return null;
}

export function isFocusContainerVNode(vnode: VNode): vnode is VNode & { kind: FocusContainerKind } {
  return vnode.kind === "focusZone" || vnode.kind === "focusTrap" || vnode.kind === "modal";
}

export function ensureFocusContainerId(
  seen: Map<string, FocusContainerKind>,
  instanceId: InstanceId,
  vnode: VNode,
): CommitFatal | null {
  if (!isFocusContainerVNode(vnode)) return null;

  const id = (vnode as { props: { id?: unknown } }).props.id;
  if (typeof id !== "string" || id.length === 0) {
    return {
      code: "ZRUI_INVALID_PROPS",
      detail: `focus container missing required id (kind=${vnode.kind}, instanceId=${String(instanceId)})`,
    };
  }
  if (id.trim().length === 0) {
    return {
      code: "ZRUI_INVALID_PROPS",
      detail: `focus container id must contain non-whitespace characters (kind=${vnode.kind}, instanceId=${String(instanceId)})`,
    };
  }

  const existing = seen.get(id);
  if (existing !== undefined) {
    return {
      code: "ZRUI_DUPLICATE_ID",
      detail: `Duplicate focus container id "${id}". First: <${existing}>, second: <${vnode.kind}>. Hint: focusZone, focusTrap, and modal ids must be unique across the tree.`,
    };
  }

  seen.set(id, vnode.kind);
  return null;
}

export function isVNode(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "kind" in v;
}

export function commitChildrenForVNode(vnode: VNode): readonly VNode[] {
  if (
    vnode.kind === "fragment" ||
    vnode.kind === "box" ||
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "themed" ||
    vnode.kind === "grid" ||
    vnode.kind === "focusZone" ||
    vnode.kind === "focusTrap" ||
    vnode.kind === "layers" ||
    vnode.kind === "tabs" ||
    vnode.kind === "accordion" ||
    vnode.kind === "breadcrumb" ||
    vnode.kind === "pagination" ||
    vnode.kind === "splitPane" ||
    vnode.kind === "panelGroup"
  ) {
    return vnode.children;
  }

  if (vnode.kind === "field" || vnode.kind === "resizablePanel") {
    const child = vnode.children[0];
    return child ? [child] : [];
  }

  if (vnode.kind === "layer") {
    const content = (vnode.props as { content?: unknown }).content;
    return isVNode(content) ? [content] : [];
  }

  if (vnode.kind === "modal") {
    const props = vnode.props as { content?: unknown; actions?: unknown };
    const content = isVNode(props.content) ? props.content : null;

    const actionsRaw = Array.isArray(props.actions) ? props.actions : [];
    const actions: VNode[] = [];
    for (const a of actionsRaw) {
      if (isVNode(a)) actions.push(a);
    }

    const children: VNode[] = [];
    if (content) children.push(content);
    children.push(...actions);
    return children;
  }

  return [];
}

export function readVNodeKey(vnode: VNode): string | undefined {
  const props = vnode.props as Readonly<{ key?: unknown }> | undefined;
  const key = props?.key;
  return typeof key === "string" ? key : undefined;
}

export function isContainerVNode(vnode: VNode): boolean {
  return (
    vnode.kind === "fragment" ||
    vnode.kind === "box" ||
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "themed" ||
    vnode.kind === "grid" ||
    vnode.kind === "focusZone" ||
    vnode.kind === "focusTrap" ||
    vnode.kind === "layers" ||
    vnode.kind === "field" ||
    vnode.kind === "tabs" ||
    vnode.kind === "accordion" ||
    vnode.kind === "breadcrumb" ||
    vnode.kind === "pagination" ||
    vnode.kind === "splitPane" ||
    vnode.kind === "panelGroup" ||
    vnode.kind === "resizablePanel" ||
    vnode.kind === "modal" ||
    vnode.kind === "layer"
  );
}

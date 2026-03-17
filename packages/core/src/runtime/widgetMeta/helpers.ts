import { getWidgetProtocol, kindIsFocusable, kindIsPressable } from "../../widgets/protocol.js";
import type { RuntimeInstance } from "../commit.js";
import type { InstanceId } from "../instance.js";

/** Extract interactive widget ID from a node with a valid `id` prop. */
export function readInteractiveId(v: RuntimeInstance["vnode"]): string | null {
  const proto = getWidgetProtocol(v.kind);
  if (!proto.requiresId && !proto.focusable && !proto.pressable) return null;
  const id = (v.props as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

export function isFocusableInteractive(v: RuntimeInstance["vnode"]): boolean {
  const focusable = (v.props as { focusable?: unknown }).focusable;
  if (focusable === false) return false;

  // Note: Some interactive widgets require an id for routing (e.g. SplitPane dividers),
  // but are explicitly NOT focusable (PLAN.md).
  return kindIsFocusable(v.kind);
}

export function isEnabledInteractive(v: RuntimeInstance["vnode"]): string | null {
  const id = readInteractiveId(v);
  if (id === null) return null;

  const proto = getWidgetProtocol(v.kind);
  if (proto.disableable) {
    const disabled = (v.props as { disabled?: unknown }).disabled;
    if (disabled === true) return null;
  }

  if (proto.openGated) {
    const open = (v.props as { open?: unknown }).open;
    if (open !== true) return null;
  }

  return id;
}

export function readNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Metadata for an Input widget instance. */
export type InputMeta = Readonly<{
  instanceId: InstanceId;
  value: string;
  disabled: boolean;
  readOnly: boolean;
  multiline: boolean;
  rows: number;
  wordWrap: boolean;
  onInput?: (value: string, cursor: number) => void;
  onBlur?: () => void;
}>;

/**
 * Collect focusable ids from a committed runtime tree.
 *
 * - Order: depth-first preorder
 * - Children: left-to-right
 * - Focusable set: enabled focusable interactive widgets
 */
export function collectFocusableIds(tree: RuntimeInstance): readonly string[] {
  const out: string[] = [];

  const stack: RuntimeInstance[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    const id = isFocusableInteractive(node.vnode) ? isEnabledInteractive(node.vnode) : null;
    if (id !== null) out.push(id);

    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (c) stack.push(c);
    }
  }

  return Object.freeze(out);
}

/**
 * Collect a deterministic enabled map (interactive id -> enabled) from a committed runtime tree.
 *
 * Interactive widgets are always included when their `id` is a non-empty string;
 * enabled is `true` iff `disabled !== true`.
 */
export function collectEnabledMap(tree: RuntimeInstance): ReadonlyMap<string, boolean> {
  const m = new Map<string, boolean>();

  const stack: RuntimeInstance[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    const id = readInteractiveId(node.vnode);
    if (id !== null && !m.has(id)) {
      let enabled = true;
      const proto = getWidgetProtocol(node.vnode.kind);
      if (proto.disableable) {
        const disabled = (node.vnode.props as { disabled?: unknown }).disabled;
        enabled = disabled !== true;
      }
      if (proto.openGated) {
        const open = (node.vnode.props as { open?: unknown }).open;
        enabled = open === true;
      }
      m.set(id, enabled);
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (c) stack.push(c);
    }
  }

  return m;
}

/**
 * Collect ids that can produce a "press" action (Buttons).
 *
 * Includes Buttons with a non-empty string id, regardless of disabled state.
 */
export function collectPressableIds(tree: RuntimeInstance): ReadonlySet<string> {
  const s = new Set<string>();

  const stack: RuntimeInstance[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (kindIsPressable(node.vnode.kind)) {
      const id = (node.vnode.props as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) s.add(id);
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (c) stack.push(c);
    }
  }

  return s;
}

/**
 * Collect a deterministic map of Input id -> { instanceId, value, disabled } from a committed runtime tree.
 *
 * Inputs are included when their `id` is a non-empty string and `value` is a string.
 */
export function collectInputMetaById(tree: RuntimeInstance): ReadonlyMap<string, InputMeta> {
  const m = new Map<string, InputMeta>();

  const stack: RuntimeInstance[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.vnode.kind === "input") {
      const props = node.vnode.props as {
        id?: unknown;
        value?: unknown;
        disabled?: unknown;
        readOnly?: unknown;
        multiline?: unknown;
        rows?: unknown;
        wordWrap?: unknown;
        onInput?: unknown;
        onBlur?: unknown;
      };
      const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;
      const value = typeof props.value === "string" ? props.value : null;
      if (id !== null && value !== null && !m.has(id)) {
        const disabled = props.disabled === true;
        const readOnly = props.readOnly === true;
        const multiline = props.multiline === true;
        const rowsRaw =
          typeof props.rows === "number" && Number.isFinite(props.rows) ? props.rows : 3;
        const rows = multiline ? Math.max(1, Math.trunc(rowsRaw)) : 1;
        const wordWrap = multiline ? props.wordWrap !== false : false;
        const onInput =
          typeof props.onInput === "function"
            ? (props.onInput as (v: string, c: number) => void)
            : undefined;
        const onBlur =
          typeof props.onBlur === "function" ? (props.onBlur as () => void) : undefined;
        const metaBase: InputMeta = {
          instanceId: node.instanceId,
          value,
          disabled,
          readOnly,
          multiline,
          rows,
          wordWrap,
        };
        const meta: InputMeta =
          onInput || onBlur
            ? Object.freeze({
                ...metaBase,
                ...(onInput ? { onInput } : {}),
                ...(onBlur ? { onBlur } : {}),
              })
            : Object.freeze(metaBase);
        m.set(id, meta);
      }
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (c) stack.push(c);
    }
  }

  return m;
}

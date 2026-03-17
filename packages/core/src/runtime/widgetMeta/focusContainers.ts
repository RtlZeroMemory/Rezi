import { ZrUiError } from "../../abi.js";
import type { FocusZoneNavigation } from "../../widgets/types.js";
import type { RuntimeInstance } from "../commit.js";
import { isEnabledInteractive, isFocusableInteractive } from "./helpers.js";

export type FocusContainerKind = "focusZone" | "focusTrap" | "modal";

export type ContainerInfo = { kind: "zone" | "trap"; id: string };

function duplicateFocusContainerDetail(
  id: string,
  firstKind: FocusContainerKind,
  secondKind: FocusContainerKind,
): string {
  return `Duplicate focus container id "${id}". First: <${firstKind}>, second: <${secondKind}>. Hint: focusZone, focusTrap, and modal ids must be unique across the tree.`;
}

export function recordFocusContainerId(
  seen: Map<string, FocusContainerKind>,
  id: string,
  kind: FocusContainerKind,
): void {
  const existing = seen.get(id);
  if (existing !== undefined) {
    throw new ZrUiError("ZRUI_DUPLICATE_ID", duplicateFocusContainerDetail(id, existing, kind));
  }
  seen.set(id, kind);
}

/** Collected focus zone metadata. */
export type CollectedZone = Readonly<{
  id: string;
  tabIndex: number;
  navigation: FocusZoneNavigation;
  columns: number;
  wrapAround: boolean;
  focusableIds: readonly string[];
  parentZoneId?: string;
  onEnter?: () => void;
  onExit?: () => void;
}>;

/** Collected focus trap metadata. */
export type CollectedTrap = Readonly<{
  id: string;
  kind?: "focusTrap" | "modal";
  active: boolean;
  returnFocusTo: string | null;
  initialFocus: string | null;
  focusableIds: readonly string[];
}>;

/**
 * Collect focusable ids from a subtree (not traversing into nested zones/traps/modals).
 */
function collectFocusableIdsInSubtree(node: RuntimeInstance): readonly string[] {
  const out: string[] = [];
  const stack: RuntimeInstance[] = [node];

  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;

    // Don't traverse into nested zones or traps.
    if (
      cur.vnode.kind === "focusZone" ||
      cur.vnode.kind === "focusTrap" ||
      cur.vnode.kind === "modal"
    ) {
      continue;
    }

    const id = isFocusableInteractive(cur.vnode) ? isEnabledInteractive(cur.vnode) : null;
    if (id !== null) out.push(id);

    for (let i = cur.children.length - 1; i >= 0; i--) {
      const c = cur.children[i];
      if (c) stack.push(c);
    }
  }

  return Object.freeze(out);
}

function collectFocusableIdsInTrapSubtree(node: RuntimeInstance): readonly string[] {
  const out: string[] = [];
  const stack: RuntimeInstance[] = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.vnode.kind === "focusTrap" || current.vnode.kind === "modal") {
      continue;
    }

    const id = isFocusableInteractive(current.vnode) ? isEnabledInteractive(current.vnode) : null;
    if (id !== null) out.push(id);

    for (let i = current.children.length - 1; i >= 0; i--) {
      const child = current.children[i];
      if (child) stack.push(child);
    }
  }

  return Object.freeze(out);
}

/**
 * Collect all focus zones from a committed runtime tree.
 *
 * - Order: depth-first preorder
 * - Each zone contains only the focusable ids directly within it (not in nested zones/traps)
 */
export function collectFocusZones(tree: RuntimeInstance): ReadonlyMap<string, CollectedZone> {
  const m = new Map<string, CollectedZone>();
  const seen = new Map<string, FocusContainerKind>();

  const stack: Array<{ node: RuntimeInstance; parentZoneId: string | null }> = [
    { node: tree, parentZoneId: null },
  ];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) continue;
    const node = item.node;

    if (node.vnode.kind === "focusZone") {
      const props = node.vnode.props as {
        id?: unknown;
        tabIndex?: unknown;
        navigation?: unknown;
        columns?: unknown;
        wrapAround?: unknown;
        onEnter?: unknown;
        onExit?: unknown;
      };
      const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;

      if (id !== null) {
        recordFocusContainerId(seen, id, "focusZone");
        const tabIndex = typeof props.tabIndex === "number" ? props.tabIndex : 0;
        const navigation =
          props.navigation === "linear" ||
          props.navigation === "grid" ||
          props.navigation === "none"
            ? props.navigation
            : "linear";
        const columns = typeof props.columns === "number" && props.columns > 0 ? props.columns : 1;
        const wrapAround = props.wrapAround !== false;
        const onEnter =
          typeof props.onEnter === "function" ? (props.onEnter as () => void) : undefined;
        const onExit =
          typeof props.onExit === "function" ? (props.onExit as () => void) : undefined;

        // Collect focusable ids from zone children (not traversing into nested zones/traps)
        const focusableIds: string[] = [];
        for (const child of node.children) {
          if (
            child.vnode.kind === "focusZone" ||
            child.vnode.kind === "focusTrap" ||
            child.vnode.kind === "modal"
          ) {
            continue;
          }
          const childFocusables = collectFocusableIdsInSubtree(child);
          focusableIds.push(...childFocusables);
        }

        const zone: CollectedZone = {
          id,
          tabIndex,
          navigation,
          columns,
          wrapAround,
          focusableIds: Object.freeze(focusableIds),
        };
        if (item.parentZoneId !== null) {
          (zone as { parentZoneId?: string }).parentZoneId = item.parentZoneId;
        }
        if (onEnter !== undefined) {
          (zone as { onEnter?: () => void }).onEnter = onEnter;
        }
        if (onExit !== undefined) {
          (zone as { onExit?: () => void }).onExit = onExit;
        }
        m.set(id, Object.freeze(zone));
      }
    }

    // Continue traversing children for nested zones
    let childParentZoneId = item.parentZoneId;
    if (node.vnode.kind === "focusZone") {
      const zoneId = (node.vnode.props as { id?: unknown }).id;
      if (typeof zoneId === "string" && zoneId.length > 0) {
        childParentZoneId = zoneId;
      }
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (c) stack.push({ node: c, parentZoneId: childParentZoneId ?? null });
    }
  }

  return m;
}

/**
 * Collect all focus traps from a committed runtime tree.
 *
 * - Order: depth-first preorder
 * - Each trap contains only the focusable ids directly within it (not in nested zones/traps)
 */
export function collectFocusTraps(tree: RuntimeInstance): ReadonlyMap<string, CollectedTrap> {
  const m = new Map<string, CollectedTrap>();
  const seen = new Map<string, FocusContainerKind>();

  const stack: RuntimeInstance[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.vnode.kind === "focusTrap" || node.vnode.kind === "modal") {
      const props = node.vnode.props as {
        id?: unknown;
        active?: unknown;
        returnFocusTo?: unknown;
        initialFocus?: unknown;
      };
      const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;

      if (id !== null) {
        recordFocusContainerId(seen, id, node.vnode.kind);
        const active = node.vnode.kind === "modal" ? true : props.active === true;
        const returnFocusTo = typeof props.returnFocusTo === "string" ? props.returnFocusTo : null;
        const initialFocus = typeof props.initialFocus === "string" ? props.initialFocus : null;

        // Collect focusable ids from trap children, including nested zones but
        // excluding nested traps/modals which manage their own focus scope.
        const focusableIds: string[] = [];
        for (const child of node.children) {
          if (child.vnode.kind === "focusTrap" || child.vnode.kind === "modal") continue;
          const childFocusables = collectFocusableIdsInTrapSubtree(child);
          focusableIds.push(...childFocusables);
        }

        m.set(
          id,
          Object.freeze({
            id,
            kind: node.vnode.kind,
            active,
            returnFocusTo,
            initialFocus,
            focusableIds: Object.freeze(focusableIds),
          }),
        );
      }
    }

    // Continue traversing children for nested traps
    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (c) stack.push(c);
    }
  }

  return m;
}

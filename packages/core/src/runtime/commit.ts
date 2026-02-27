/**
 * packages/core/src/runtime/commit.ts — VNode tree commitment.
 *
 * Why: Transforms a VNode tree into a RuntimeInstance tree with stable instance
 * IDs, validating interactive widget uniqueness and managing instance lifecycle.
 * The committed tree is the authoritative representation used for layout, focus,
 * and rendering.
 *
 * Commit responsibilities:
 *   - Reconcile VNode tree against previous committed tree
 *   - Allocate instance IDs for new nodes
 *   - Validate interactive widget ID uniqueness (no duplicate IDs)
 *   - Track mounted/reused/unmounted instance lifecycle
 *   - Clean up local state for unmounted instances
 *
 * @see docs/guide/runtime-and-layout.md
 */

import { resolveEasing } from "../animation/easing.js";
import { normalizeDurationMs } from "../animation/interpolate.js";
import type { ResponsiveViewportSnapshot } from "../layout/responsive.js";
import { mergeThemeOverride } from "../theme/interop.js";
import type { Theme } from "../theme/theme.js";
import type { ColorTokens } from "../theme/tokens.js";
import {
  type CompositeWidgetMeta,
  type WidgetContext,
  getCompositeMeta,
  scopedId,
} from "../widgets/composition.js";
import { getWidgetProtocol, kindRequiresId } from "../widgets/protocol.js";
import type { ExitAnimationState, TransitionSpec, VNode } from "../widgets/types.js";
import type { InstanceId, InstanceIdAllocator } from "./instance.js";
import {
  type AppStateSelection,
  type CompositeInstanceRegistry,
  type EffectCleanup,
  type EffectState,
  createHookContext,
} from "./instances.js";
import type { RuntimeLocalStateStore } from "./localState.js";
import { type ReconcileFatal, reconcileChildren } from "./reconcile.js";
import type { RenderPacket } from "./renderPacket.js";

/**
 * Committed runtime instance with stable ID and children.
 * Mirrors VNode structure but with lifecycle tracking.
 */
export type RuntimeInstance = {
  instanceId: InstanceId;
  vnode: VNode;
  children: readonly RuntimeInstance[];
  dirty: boolean;
  selfDirty: boolean;
  renderPacketKey: number;
  renderPacket: RenderPacket | null;
};

/** Shared frozen empty array for leaf RuntimeInstance children. Avoids per-node allocation. */
const EMPTY_CHILDREN: readonly RuntimeInstance[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Commit Diagnostics — zero-overhead when disabled
// ---------------------------------------------------------------------------

/** Structured commit diagnostic entry. */
export type CommitDiagEntry = {
  id: number;
  kind: string;
  reason: "leaf-reuse" | "fast-reuse" | "new-mount" | "new-instance";
  /** Explains why reuse failed, or "was-dirty" if reused but was previously dirty. */
  detail?:
    | "props-changed"
    | "children-changed"
    | "props+children"
    | "general-path"
    | "no-prev"
    | "leaf-kind-mismatch"
    | "leaf-content-changed"
    | "kind-changed"
    | "was-dirty"
    | undefined;
  /** Specific failing prop (only for props-changed containers). */
  failingProp?: string | undefined;
  childDiffs?: number | undefined; // how many children refs differ
  prevChildren?: number | undefined;
  nextChildren?: number | undefined;
};

/** Global commit diagnostics buffer. */
export const __commitDiag = {
  enabled: false,
  entries: [] as CommitDiagEntry[],
  reset(): void {
    this.entries.length = 0;
  },
  push(e: CommitDiagEntry): void {
    this.entries.push(e);
  },
};

/** Fast equality for packed color values. */
function colorEqual(a: unknown, b: unknown): boolean {
  return a === b;
}

/**
 * Fast shallow equality for text style objects.
 * Returns true if both styles produce identical render output.
 */
function textStyleEqual(
  a:
    | {
        bold?: boolean;
        dim?: boolean;
        italic?: boolean;
        underline?: boolean;
        inverse?: boolean;
        strikethrough?: boolean;
        overline?: boolean;
        blink?: boolean;
        fg?: unknown;
        bg?: unknown;
      }
    | undefined,
  b:
    | {
        bold?: boolean;
        dim?: boolean;
        italic?: boolean;
        underline?: boolean;
        inverse?: boolean;
        strikethrough?: boolean;
        overline?: boolean;
        blink?: boolean;
        fg?: unknown;
        bg?: unknown;
      }
    | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strikethrough === b.strikethrough &&
    a.overline === b.overline &&
    a.blink === b.blink &&
    colorEqual(a.fg, b.fg) &&
    colorEqual(a.bg, b.bg)
  );
}

/**
 * Check if two leaf VNodes are semantically equal (same render output).
 * Used to skip allocating new RuntimeInstance objects for unchanged leaves.
 * Only covers common leaf kinds; returns false for unknown kinds (safe fallback).
 */
function leafVNodeEqual(a: VNode, b: VNode): boolean {
  switch (a.kind) {
    case "text": {
      if (b.kind !== "text") return false;
      if (a.text !== b.text) return false;
      if (a.props === b.props) return true;
      const ap = a.props as {
        id?: unknown;
        style?: unknown;
        textOverflow?: unknown;
        variant?: unknown;
        maxWidth?: unknown;
      };
      const bp = b.props as {
        id?: unknown;
        style?: unknown;
        textOverflow?: unknown;
        variant?: unknown;
        maxWidth?: unknown;
      };
      // Even when render output is identical, `id` changes must re-commit so downstream
      // id-based lookups (layout rect indexing, anchors, etc) don't observe stale ids.
      if (ap.id !== bp.id) return false;
      if (ap.textOverflow !== bp.textOverflow) return false;
      if (ap.variant !== bp.variant) return false;
      if (ap.maxWidth !== bp.maxWidth) return false;
      return textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      );
    }
    case "spacer": {
      if (b.kind !== "spacer") return false;
      const ap = a.props as { size?: number; flex?: number };
      const bp = b.props as { size?: number; flex?: number };
      return ap.size === bp.size && ap.flex === bp.flex;
    }
    case "divider": {
      if (b.kind !== "divider") return false;
      const ap = a.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      const bp = b.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      return (
        ap.direction === bp.direction &&
        ap.char === bp.char &&
        ap.label === bp.label &&
        ap.color === bp.color
      );
    }
    case "richText": {
      if (b.kind !== "richText") return false;
      const ap = a.props as { spans?: readonly { text: string; style?: unknown }[] };
      const bp = b.props as { spans?: readonly { text: string; style?: unknown }[] };
      const as = ap.spans;
      const bs = bp.spans;
      if (as === bs) return true;
      if (!as || !bs || as.length !== bs.length) return false;
      for (let i = 0; i < as.length; i++) {
        const sa = as[i];
        const sb = bs[i];
        if (!sa || !sb) return false;
        if (sa.text !== sb.text) return false;
        if (
          !textStyleEqual(
            sa.style as Parameters<typeof textStyleEqual>[0],
            sb.style as Parameters<typeof textStyleEqual>[0],
          )
        )
          return false;
      }
      return true;
    }
    default:
      return false;
  }
}

function boxShadowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ao = a as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  const bo = b as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  return ao.offsetX === bo.offsetX && ao.offsetY === bo.offsetY && ao.density === bo.density;
}

function transitionPropertiesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a === "all" || b === "all") return a === b;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function transitionSpecEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ao = a as { duration?: unknown; easing?: unknown; properties?: unknown };
  const bo = b as typeof ao;
  return (
    ao.duration === bo.duration &&
    ao.easing === bo.easing &&
    transitionPropertiesEqual(ao.properties, bo.properties)
  );
}

function layoutConstraintsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    width?: unknown;
    height?: unknown;
    minWidth?: unknown;
    maxWidth?: unknown;
    minHeight?: unknown;
    maxHeight?: unknown;
    flex?: unknown;
    aspectRatio?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.width === bo.width &&
    ao.height === bo.height &&
    ao.minWidth === bo.minWidth &&
    ao.maxWidth === bo.maxWidth &&
    ao.minHeight === bo.minHeight &&
    ao.maxHeight === bo.maxHeight &&
    ao.flex === bo.flex &&
    ao.aspectRatio === bo.aspectRatio
  );
}

function shallowRecordEqual(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in b)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

function compositePropsEqual(prev: unknown, next: unknown): boolean {
  if (Object.is(prev, next)) return true;
  if (typeof prev !== "object" || prev === null) return false;
  if (typeof next !== "object" || next === null) return false;
  return shallowRecordEqual(
    prev as Readonly<Record<string, unknown>>,
    next as Readonly<Record<string, unknown>>,
  );
}

function evaluateAppStateSelections(
  selections: readonly AppStateSelection[],
  appState: unknown,
): { changed: boolean; threw: unknown | null } {
  for (const selection of selections) {
    try {
      const nextValue = selection.selector(appState);
      if (!Object.is(nextValue, selection.value)) {
        return { changed: true, threw: null };
      }
    } catch (e: unknown) {
      return { changed: true, threw: e };
    }
  }
  return { changed: false, threw: null };
}

function spacingPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.p === bo.p &&
    ao.px === bo.px &&
    ao.py === bo.py &&
    ao.pt === bo.pt &&
    ao.pb === bo.pb &&
    ao.pl === bo.pl &&
    ao.pr === bo.pr &&
    ao.m === bo.m &&
    ao.mx === bo.mx &&
    ao.my === bo.my &&
    ao.mt === bo.mt &&
    ao.mr === bo.mr &&
    ao.mb === bo.mb &&
    ao.ml === bo.ml
  );
}

function boxPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    title?: unknown;
    titleAlign?: unknown;
    pad?: unknown;
    border?: unknown;
    borderTop?: unknown;
    borderRight?: unknown;
    borderBottom?: unknown;
    borderLeft?: unknown;
    shadow?: unknown;
    style?: unknown;
    inheritStyle?: unknown;
    opacity?: unknown;
    transition?: unknown;
    exitTransition?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.title === bo.title &&
    ao.titleAlign === bo.titleAlign &&
    ao.pad === bo.pad &&
    ao.border === bo.border &&
    ao.borderTop === bo.borderTop &&
    ao.borderRight === bo.borderRight &&
    ao.borderBottom === bo.borderBottom &&
    ao.borderLeft === bo.borderLeft &&
    boxShadowEqual(ao.shadow, bo.shadow) &&
    textStyleEqual(
      ao.style as Parameters<typeof textStyleEqual>[0],
      bo.style as Parameters<typeof textStyleEqual>[0],
    ) &&
    textStyleEqual(
      ao.inheritStyle as Parameters<typeof textStyleEqual>[0],
      bo.inheritStyle as Parameters<typeof textStyleEqual>[0],
    ) &&
    ao.opacity === bo.opacity &&
    transitionSpecEqual(ao.transition, bo.transition) &&
    transitionSpecEqual(ao.exitTransition, bo.exitTransition) &&
    spacingPropsEqual(ao, bo) &&
    layoutConstraintsEqual(ao, bo)
  );
}

function stackPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    pad?: unknown;
    gap?: unknown;
    align?: unknown;
    justify?: unknown;
    items?: unknown;
    style?: unknown;
    inheritStyle?: unknown;
    transition?: unknown;
    exitTransition?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.pad === bo.pad &&
    ao.gap === bo.gap &&
    ao.align === bo.align &&
    ao.justify === bo.justify &&
    ao.items === bo.items &&
    textStyleEqual(
      ao.style as Parameters<typeof textStyleEqual>[0],
      bo.style as Parameters<typeof textStyleEqual>[0],
    ) &&
    textStyleEqual(
      ao.inheritStyle as Parameters<typeof textStyleEqual>[0],
      bo.inheritStyle as Parameters<typeof textStyleEqual>[0],
    ) &&
    transitionSpecEqual(ao.transition, bo.transition) &&
    transitionSpecEqual(ao.exitTransition, bo.exitTransition) &&
    spacingPropsEqual(ao, bo) &&
    layoutConstraintsEqual(ao, bo)
  );
}

function focusZonePropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    id?: unknown;
    tabIndex?: unknown;
    navigation?: unknown;
    columns?: unknown;
    wrapAround?: unknown;
    onEnter?: unknown;
    onExit?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.id === bo.id &&
    ao.tabIndex === bo.tabIndex &&
    ao.navigation === bo.navigation &&
    ao.columns === bo.columns &&
    ao.wrapAround === bo.wrapAround &&
    ao.onEnter === bo.onEnter &&
    ao.onExit === bo.onExit
  );
}

function focusTrapPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    id?: unknown;
    active?: unknown;
    returnFocusTo?: unknown;
    initialFocus?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.id === bo.id &&
    ao.active === bo.active &&
    ao.returnFocusTo === bo.returnFocusTo &&
    ao.initialFocus === bo.initialFocus
  );
}

function deepEqualUnknown(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualUnknown(a[i], b[i])) return false;
    }
    return true;
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false;
    if (!deepEqualUnknown(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

function themedPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    theme?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return deepEqualUnknown(ao.theme, bo.theme);
}

function canFastReuseContainerSelf(prev: VNode, next: VNode): boolean {
  if (prev.kind !== next.kind) return false;
  switch (prev.kind) {
    case "box":
      return boxPropsEqual(prev.props, (next as typeof prev).props);
    case "row":
    case "column":
      return stackPropsEqual(prev.props, (next as typeof prev).props);
    case "focusZone":
      return focusZonePropsEqual(prev.props, (next as typeof prev).props);
    case "focusTrap":
      return focusTrapPropsEqual(prev.props, (next as typeof prev).props);
    case "themed":
      return themedPropsEqual(prev.props, (next as typeof prev).props);
    default:
      return false;
  }
}

/**
 * Diagnostic: identify which specific prop fails for container reuse.
 * Only called when __commitDiag.enabled is true.
 */
function diagWhichPropFails(prev: VNode, next: VNode): string | undefined {
  if (prev.kind !== next.kind) return "kind";
  type ReuseDiagProps = {
    style?: unknown;
    inheritStyle?: unknown;
    [key: string]: unknown;
  };
  const ap = (prev.props ?? {}) as ReuseDiagProps;
  const bp = (next.props ?? {}) as ReuseDiagProps;
  if (prev.kind === "row" || prev.kind === "column") {
    for (const k of ["pad", "gap", "align", "justify", "items"] as const) {
      if (ap[k] !== bp[k]) return k;
    }
    if (
      !textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      )
    )
      return "style";
    if (
      !textStyleEqual(
        ap.inheritStyle as Parameters<typeof textStyleEqual>[0],
        bp.inheritStyle as Parameters<typeof textStyleEqual>[0],
      )
    )
      return "inheritStyle";
    // layout constraints
    for (const k of [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "flex",
      "aspectRatio",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
    // spacing
    for (const k of [
      "p",
      "px",
      "py",
      "pt",
      "pb",
      "pl",
      "pr",
      "m",
      "mx",
      "my",
      "mt",
      "mr",
      "mb",
      "ml",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
  }
  if (prev.kind === "box") {
    for (const k of [
      "title",
      "titleAlign",
      "pad",
      "border",
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
      "opacity",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
    if (
      !textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      )
    )
      return "style";
    for (const k of [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "flex",
      "aspectRatio",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
  }
  return "unknown";
}

function runtimeChildrenChanged(
  prevChildren: readonly RuntimeInstance[],
  nextChildren: readonly RuntimeInstance[],
): boolean {
  if (prevChildren.length !== nextChildren.length) return true;
  for (let i = 0; i < prevChildren.length; i++) {
    if (prevChildren[i] !== nextChildren[i]) return true;
  }
  return false;
}

function hasDirtyChild(children: readonly RuntimeInstance[]): boolean {
  for (const child of children) {
    if (child.dirty) return true;
  }
  return false;
}

/** Fatal errors from tree commitment. */
export type CommitFatal =
  | ReconcileFatal
  | Readonly<{ code: "ZRUI_DUPLICATE_ID"; detail: string }>
  | Readonly<{ code: "ZRUI_INVALID_PROPS"; detail: string }>
  | Readonly<{ code: "ZRUI_USER_CODE_THROW"; detail: string }>;

export type PendingExitAnimation = Readonly<{
  instanceId: InstanceId;
  parentInstanceId: InstanceId;
  runtimeRoot: RuntimeInstance;
  vnodeKind: VNode["kind"];
  key: string | undefined;
  exit: ExitAnimationState;
  subtreeInstanceIds: readonly InstanceId[];
  runDeferredLocalStateCleanup: () => void;
}>;

/** Successful commit result with lifecycle instance lists. */
export type CommitOk = Readonly<{
  root: RuntimeInstance;
  mountedInstanceIds: readonly InstanceId[];
  reusedInstanceIds: readonly InstanceId[];
  unmountedInstanceIds: readonly InstanceId[];
  pendingExitAnimations: readonly PendingExitAnimation[];
  /** Pending cleanups from previous effects to run before new effects. */
  pendingCleanups: readonly EffectCleanup[];
  /** Pending effects scheduled by composite widgets during this commit. */
  pendingEffects: readonly EffectState[];
}>;

export type CommitResult =
  | Readonly<{ ok: true; value: CommitOk }>
  | Readonly<{ ok: false; fatal: CommitFatal }>;

type CommitNodeResult =
  | Readonly<{ ok: true; value: Readonly<{ root: RuntimeInstance }> }>
  | Readonly<{ ok: false; fatal: CommitFatal }>;

type MutableLists = {
  mounted: InstanceId[];
  reused: InstanceId[];
  unmounted: InstanceId[];
};

const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
const DEV_MODE = NODE_ENV !== "production";
const LAYOUT_DEPTH_WARN_THRESHOLD = 200;
const MAX_LAYOUT_NESTING_DEPTH = 500;
const MAX_LAYOUT_DEPTH_PATH_SEGMENTS = 32;
const MAX_INTERACTIVE_ID_LENGTH = 256;
const DEFAULT_EXIT_TRANSITION_DURATION_MS = 180;
const LAYOUT_DEPTH_PATH_TRACK_START = Math.max(
  1,
  LAYOUT_DEPTH_WARN_THRESHOLD - MAX_LAYOUT_DEPTH_PATH_SEGMENTS + 2,
);

function warnDev(message: string): void {
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

function widgetPathEntry(vnode: VNode): string {
  const props = vnode.props as { id?: unknown; key?: unknown } | undefined;
  const id = typeof props?.id === "string" && props.id.length > 0 ? `#${props.id}` : "";
  const key =
    typeof props?.key === "string" || typeof props?.key === "number"
      ? `[key=${String(props.key)}]`
      : "";
  return `${vnode.kind}${id}${key}`;
}

function formatWidgetPath(depth: number, tailPath: readonly string[]): string {
  if (tailPath.length === 0) return "(root)";
  const path = tailPath.join(" -> ");
  return depth > tailPath.length ? `... -> ${path}` : path;
}

function isInteractiveVNode(v: VNode): boolean {
  const proto = getWidgetProtocol(v.kind);
  return proto.requiresId || proto.focusable || proto.pressable;
}

function ensureInteractiveId(
  seen: Map<string, string>,
  instanceId: InstanceId,
  vnode: VNode,
): CommitFatal | null {
  if (!isInteractiveVNode(vnode)) return null;

  // Runtime validation (even though most interactive widgets are typed with required ids).
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

function isVNode(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "kind" in v;
}

function commitChildrenForVNode(vnode: VNode): readonly VNode[] {
  if (
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
    // Advanced container widgets (GitHub issue #136)
    vnode.kind === "splitPane" ||
    vnode.kind === "panelGroup" ||
    vnode.kind === "resizablePanel"
  ) {
    return vnode.children;
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

function collectSubtreeInstanceIds(node: RuntimeInstance, out: InstanceId[]): void {
  out.push(node.instanceId);
  for (const c of node.children) collectSubtreeInstanceIds(c, out);
}

function deleteLocalStateForSubtree(
  store: RuntimeLocalStateStore | undefined,
  node: RuntimeInstance,
): void {
  if (!store) return;
  const stack: RuntimeInstance[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    store.delete(cur.instanceId);
    for (const c of cur.children) stack.push(c);
  }
}

function commitNowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = perf?.now;
  if (typeof perfNow === "function") return perfNow.call(perf);
  return Date.now();
}

function readVNodeKey(vnode: VNode): string | undefined {
  const props = vnode.props as Readonly<{ key?: unknown }> | undefined;
  const key = props?.key;
  return typeof key === "string" ? key : undefined;
}

function readExitTransition(vnode: VNode): TransitionSpec | null {
  if (
    vnode.kind !== "box" &&
    vnode.kind !== "row" &&
    vnode.kind !== "column" &&
    vnode.kind !== "grid"
  ) {
    return null;
  }
  const props = vnode.props as Readonly<{ exitTransition?: TransitionSpec }> | undefined;
  return props?.exitTransition ?? null;
}

function resolveExitAnimationState(
  instanceId: InstanceId,
  transition: TransitionSpec,
): ExitAnimationState | null {
  const durationMs = normalizeDurationMs(transition.duration, DEFAULT_EXIT_TRANSITION_DURATION_MS);
  if (durationMs <= 0) return null;
  return Object.freeze({
    instanceId,
    startMs: commitNowMs(),
    durationMs,
    easing: resolveEasing(transition.easing),
    properties: transition.properties ?? "all",
  });
}

function createDeferredLocalStateCleanup(
  localState: RuntimeLocalStateStore | undefined,
  node: RuntimeInstance,
): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    deleteLocalStateForSubtree(localState, node);
  };
}

function tryScheduleExitAnimation(
  ctx: CommitCtx,
  node: RuntimeInstance,
  parentInstanceId: InstanceId,
): boolean {
  const exitTransition = readExitTransition(node.vnode);
  if (!exitTransition) return false;
  const exit = resolveExitAnimationState(node.instanceId, exitTransition);
  if (!exit) return false;

  const subtreeInstanceIds: InstanceId[] = [];
  collectSubtreeInstanceIds(node, subtreeInstanceIds);
  ctx.pendingExitAnimations.push(
    Object.freeze({
      instanceId: node.instanceId,
      parentInstanceId,
      runtimeRoot: node,
      vnodeKind: node.vnode.kind,
      key: readVNodeKey(node.vnode),
      exit,
      subtreeInstanceIds: Object.freeze(subtreeInstanceIds),
      runDeferredLocalStateCleanup: createDeferredLocalStateCleanup(ctx.localState, node),
    }),
  );
  return true;
}

function markCompositeSubtreeStale(
  registry: CompositeInstanceRegistry,
  node: RuntimeInstance,
): void {
  const stack: RuntimeInstance[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    registry.incrementGeneration(cur.instanceId);
    for (const c of cur.children) stack.push(c);
  }
}

function currentCompositeTheme(ctx: CommitCtx): Theme | null {
  if (ctx.compositeThemeStack.length === 0) return null;
  return ctx.compositeThemeStack[ctx.compositeThemeStack.length - 1] ?? null;
}

function resolveCompositeChildTheme(parentTheme: Theme, vnode: VNode): Theme {
  if (vnode.kind === "themed") {
    const props = vnode.props as { theme?: unknown };
    return mergeThemeOverride(parentTheme, props.theme);
  }

  if (
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "grid" ||
    vnode.kind === "box"
  ) {
    const props = vnode.props as { theme?: unknown };
    return mergeThemeOverride(parentTheme, props.theme);
  }

  return parentTheme;
}

function readCompositeColorTokens(ctx: CommitCtx): ColorTokens | null {
  const composite = ctx.composite;
  if (!composite) return null;

  const theme = currentCompositeTheme(ctx);
  if (theme !== null && composite.getColorTokens) {
    return composite.getColorTokens(theme);
  }

  return composite.colorTokens ?? null;
}

type CommitCtx = Readonly<{
  allocator: InstanceIdAllocator;
  localState: RuntimeLocalStateStore | undefined;
  seenInteractiveIds: Map<string, string>;
  prevNodeStack: Array<RuntimeInstance | null>;
  containerChildOverrides: Map<InstanceId, readonly VNode[]>;
  layoutDepthRef: { value: number };
  layoutPathTail: string[];
  emittedWarnings: Set<string>;
  lists: MutableLists;
  collectLifecycleInstanceIds: boolean;
  composite: Readonly<{
    registry: CompositeInstanceRegistry;
    appState: unknown;
    colorTokens?: ColorTokens | null;
    theme?: Theme;
    getColorTokens?: (theme: Theme) => ColorTokens | null;
    viewport?: ResponsiveViewportSnapshot;
    onInvalidate: (instanceId: InstanceId) => void;
    onUseViewport?: () => void;
  }> | null;
  compositeThemeStack: Theme[];
  compositeRenderStack: Array<Readonly<{ widgetKey: string; instanceId: InstanceId }>>;
  pendingExitAnimations: PendingExitAnimation[];
  pendingCleanups: EffectCleanup[];
  pendingEffects: EffectState[];
  errorBoundary: Readonly<{
    errorsByPath: Map<string, CommitErrorBoundaryState>;
    retryRequestedPaths: Set<string>;
    activePaths: Set<string>;
    requestRetry: (path: string) => void;
  }> | null;
}>;

const MAX_COMPOSITE_RENDER_DEPTH = 100;
const DEFAULT_VIEWPORT_SNAPSHOT: ResponsiveViewportSnapshot = Object.freeze({
  width: 0,
  height: 0,
  breakpoint: "sm",
});

type CommitErrorBoundaryState = Readonly<{
  code: "ZRUI_USER_CODE_THROW";
  detail: string;
  message: string;
  stack?: string;
}>;

function captureErrorBoundaryState(detail: string): CommitErrorBoundaryState {
  return Object.freeze({
    code: "ZRUI_USER_CODE_THROW",
    detail,
    message: detail,
  });
}

function commitErrorBoundaryFallback(
  prev: RuntimeInstance | null,
  instanceId: InstanceId,
  boundaryPath: string,
  fallbackPath: string,
  props: Readonly<{ fallback?: unknown }>,
  state: CommitErrorBoundaryState,
  ctx: CommitCtx,
): CommitNodeResult {
  const fallback = props.fallback;
  if (typeof fallback !== "function") {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: "errorBoundary fallback must be a function",
      },
    };
  }

  let fallbackVNode: VNode;
  try {
    fallbackVNode = (
      fallback as (error: {
        code: "ZRUI_USER_CODE_THROW";
        message: string;
        detail: string;
        stack?: string;
        retry: () => void;
      }) => VNode
    )(
      Object.freeze({
        code: state.code,
        message: state.message,
        detail: state.detail,
        ...(state.stack ? { stack: state.stack } : {}),
        retry: () => {
          ctx.errorBoundary?.requestRetry(boundaryPath);
        },
      }),
    );
  } catch (e: unknown) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_USER_CODE_THROW",
        detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      },
    };
  }

  if (!isVNode(fallbackVNode)) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: "errorBoundary fallback must return a VNode",
      },
    };
  }
  return commitNode(prev, instanceId, fallbackVNode, ctx, fallbackPath);
}

function appendNodePath(nodePath: readonly string[], segment: string): string[] {
  return [...nodePath, segment];
}

function formatNodePath(nodePath: readonly string[]): string {
  return nodePath.join("/");
}

function isContainerVNode(vnode: VNode): boolean {
  return (
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
    // Advanced container widgets (GitHub issue #136)
    vnode.kind === "splitPane" ||
    vnode.kind === "panelGroup" ||
    vnode.kind === "resizablePanel" ||
    vnode.kind === "modal" ||
    vnode.kind === "layer"
  );
}

function rewriteCommittedVNode(next: VNode, committedChildren: readonly VNode[]): VNode {
  if (next.kind === "modal") {
    const props = next.props as { content?: unknown; actions?: unknown };
    const contentPresent = isVNode(props.content);
    const nextContent = contentPresent ? (committedChildren[0] ?? props.content) : props.content;
    const actionsStart = contentPresent ? 1 : 0;
    const actions = committedChildren.slice(actionsStart);

    return {
      ...next,
      props: {
        ...(next.props as Record<string, unknown>),
        ...(isVNode(nextContent) ? { content: nextContent } : {}),
        actions: actions.length > 0 ? actions : undefined,
      },
    } as unknown as VNode;
  }

  if (next.kind === "layer") {
    const props = next.props as { content?: unknown };
    const nextContent = committedChildren[0] ?? props.content;
    return {
      ...next,
      props: {
        ...(next.props as Record<string, unknown>),
        ...(isVNode(nextContent) ? { content: nextContent } : {}),
      },
    } as unknown as VNode;
  }

  if (
    next.kind === "box" ||
    next.kind === "row" ||
    next.kind === "column" ||
    next.kind === "themed" ||
    next.kind === "grid" ||
    next.kind === "focusZone" ||
    next.kind === "focusTrap" ||
    next.kind === "layers" ||
    next.kind === "field" ||
    next.kind === "tabs" ||
    next.kind === "accordion" ||
    next.kind === "breadcrumb" ||
    next.kind === "pagination" ||
    // Advanced container widgets (GitHub issue #136)
    next.kind === "splitPane" ||
    next.kind === "panelGroup" ||
    next.kind === "resizablePanel"
  ) {
    return {
      ...next,
      children: committedChildren,
    } as unknown as VNode;
  }

  return next;
}

function commitContainer(
  instanceId: InstanceId,
  vnode: VNode,
  prev: RuntimeInstance | null,
  ctx: CommitCtx,
  nodePath: string[],
  depth: number,
): CommitNodeResult {
  void depth;
  const parentProps = vnode.props as { id?: unknown } | undefined;
  const parentId =
    typeof parentProps?.id === "string" && parentProps.id.length > 0 ? parentProps.id : undefined;

  const prevChildren = prev ? prev.children : [];
  const compositeWrapperChildren = ctx.containerChildOverrides.get(instanceId) ?? null;
  const res = reconcileChildren(
    instanceId,
    prevChildren,
    compositeWrapperChildren ? compositeWrapperChildren : commitChildrenForVNode(vnode),
    ctx.allocator,
    {
      kind: vnode.kind,
      ...(parentId === undefined ? {} : { id: parentId }),
    },
  );
  if (!res.ok) return { ok: false, fatal: res.fatal };

  const byPrevIndex = prevChildren;
  let byPrevInstanceId: Map<InstanceId, RuntimeInstance> | null = null;
  if (res.value.unmountedInstanceIds.length > 0) {
    byPrevInstanceId = new Map<InstanceId, RuntimeInstance>();
    for (const c of prevChildren) byPrevInstanceId.set(c.instanceId, c);
  }

  const parentCompositeTheme = currentCompositeTheme(ctx);
  let pushedCompositeTheme = false;
  if (parentCompositeTheme !== null) {
    const nextCompositeTheme = resolveCompositeChildTheme(parentCompositeTheme, vnode);
    if (nextCompositeTheme !== parentCompositeTheme) {
      ctx.compositeThemeStack.push(nextCompositeTheme);
      pushedCompositeTheme = true;
    }
  }

  try {
    // Container fast path: when reconciliation reuses all children with no
    // additions/removals, commit each child and check if all return the exact
    // same RuntimeInstance reference. If so, reuse the parent's RuntimeInstance,
    // avoiding new arrays, VNode spreads, and RuntimeInstance allocation.
    const canTryFastReuse =
      prev !== null &&
      res.value.newInstanceIds.length === 0 &&
      res.value.unmountedInstanceIds.length === 0 &&
      res.value.nextChildren.length === prevChildren.length;
    let childOrderStable = true;
    if (canTryFastReuse) {
      for (let i = 0; i < res.value.nextChildren.length; i++) {
        const child = res.value.nextChildren[i];
        if (!child || child.prevIndex !== i) {
          childOrderStable = false;
          break;
        }
      }
    }

    // Avoid allocating nextChildren/committedChildVNodes for the common case where
    // everything is reused (e.g., list updates where only a couple rows change).
    let nextChildren: readonly RuntimeInstance[] | null = null;
    let committedChildVNodes: readonly VNode[] | null = null;

    if (canTryFastReuse) {
      let allChildrenSame = true;
      for (let i = 0; i < res.value.nextChildren.length; i++) {
        const child = res.value.nextChildren[i];
        if (!child) continue;
        const prevChild = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        const committed = commitNode(
          prevChild ?? null,
          child.instanceId,
          child.vnode,
          ctx,
          formatNodePath(appendNodePath(nodePath, child.slotId)),
        );
        if (!committed.ok) return committed;

        if (allChildrenSame && committed.value.root !== prevChild) {
          allChildrenSame = false;
          // First mismatch: allocate arrays and backfill prior entries with the prevChild refs
          // we already proved were identical in earlier iterations.
          const len = res.value.nextChildren.length;
          const nextChildrenArr: RuntimeInstance[] = new Array(len);
          const committedChildVNodesArr: VNode[] = new Array(len);
          nextChildren = nextChildrenArr;
          committedChildVNodes = committedChildVNodesArr;
          for (let j = 0; j < i; j++) {
            const plan = res.value.nextChildren[j];
            if (!plan) continue;
            const pc = plan.prevIndex !== null ? byPrevIndex[plan.prevIndex] : null;
            if (!pc) continue;
            nextChildrenArr[j] = pc;
            committedChildVNodesArr[j] = pc.vnode;
          }
        }

        if (!allChildrenSame) {
          // Arrays are allocated after the first mismatch.
          if (!nextChildren || !committedChildVNodes) {
            return {
              ok: false,
              fatal: {
                code: "ZRUI_INVALID_PROPS",
                detail: "commitNode: internal fast-reuse invariant",
              },
            };
          }
          (nextChildren as RuntimeInstance[])[i] = committed.value.root;
          (committedChildVNodes as VNode[])[i] = committed.value.root.vnode;
        }
      }

      if (
        allChildrenSame &&
        prev !== null &&
        childOrderStable &&
        canFastReuseContainerSelf(prev.vnode, vnode)
      ) {
        // Even when child RuntimeInstance references are stable, child VNodes may have
        // been updated via in-place child commits. Keep the parent VNode's committed
        // child wiring in sync so layout traverses the same tree shape as runtime.
        const fastReuseCommittedChildren = prev.children.map((child) => child.vnode);
        (prev as { vnode: VNode }).vnode = rewriteCommittedVNode(vnode, fastReuseCommittedChildren);
        // All children are identical references → reuse parent entirely.
        // Propagate dirty from children: a child may have been mutated in-place
        // with dirty=true even though it returned the same reference.
        if (__commitDiag.enabled) {
          const wasDirty = prev.selfDirty;
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "fast-reuse",
            detail: wasDirty ? "was-dirty" : undefined,
          });
        }
        prev.selfDirty = false;
        prev.dirty = hasDirtyChild(prev.children);
        return { ok: true, value: { root: prev } };
      }

      // Fast-path in-place mutation: children changed but props are identical.
      // Mutate the existing RuntimeInstance to preserve reference identity and
      // prevent parent containers from cascading new-instance creation.
      if (
        !allChildrenSame &&
        prev !== null &&
        nextChildren !== null &&
        committedChildVNodes !== null &&
        canFastReuseContainerSelf(prev.vnode, vnode)
      ) {
        if (__commitDiag.enabled) {
          let childDiffs = 0;
          for (let ci = 0; ci < prevChildren.length; ci++) {
            if (prevChildren[ci] !== (nextChildren as readonly RuntimeInstance[])[ci]) childDiffs++;
          }
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "fast-reuse",
            detail: "children-changed" as "was-dirty" | undefined,
            childDiffs,
            prevChildren: prevChildren.length,
            nextChildren: (nextChildren as readonly RuntimeInstance[]).length,
          });
        }
        (prev as { children: readonly RuntimeInstance[] }).children = nextChildren;
        (prev as { vnode: VNode }).vnode = rewriteCommittedVNode(vnode, committedChildVNodes);
        prev.selfDirty = true;
        prev.dirty = true;
        return { ok: true, value: { root: prev } };
      }

      // Diagnostic: fast-reuse check failed at container level
      if (__commitDiag.enabled && prev !== null && canTryFastReuse) {
        if (!allChildrenSame) {
          // children are different — but WHY? count how many differ
          let childDiffs = 0;
          for (let ci = 0; ci < prevChildren.length; ci++) {
            if (
              nextChildren &&
              prevChildren[ci] !== (nextChildren as readonly RuntimeInstance[])[ci]
            )
              childDiffs++;
          }
          // also check if props would have passed
          const propsOk = canFastReuseContainerSelf(prev.vnode, vnode);
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "new-instance",
            detail: propsOk ? "children-changed" : "props+children",
            failingProp: propsOk ? undefined : diagWhichPropFails(prev.vnode, vnode),
            childDiffs,
            prevChildren: prevChildren.length,
            nextChildren: nextChildren
              ? (nextChildren as readonly RuntimeInstance[]).length
              : res.value.nextChildren.length,
          });
        } else if (!childOrderStable) {
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "new-instance",
            detail: "children-changed",
          });
        } else {
          // allChildrenSame && childOrderStable but canFastReuseContainerSelf failed
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "new-instance",
            detail: "props-changed",
            failingProp: diagWhichPropFails(prev.vnode, vnode),
          });
        }
      }
    } else {
      // General path: commit children and build next arrays.
      const nextChildrenArr: RuntimeInstance[] = [];
      const committedChildVNodesArr: VNode[] = [];
      for (const child of res.value.nextChildren) {
        const prevChild = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        const committed = commitNode(
          prevChild ?? null,
          child.instanceId,
          child.vnode,
          ctx,
          formatNodePath(appendNodePath(nodePath, child.slotId)),
        );
        if (!committed.ok) return committed;
        nextChildrenArr.push(committed.value.root);
        committedChildVNodesArr.push(committed.value.root.vnode);
      }
      nextChildren = nextChildrenArr;
      committedChildVNodes = committedChildVNodesArr;
    }

    for (const unmountedId of res.value.unmountedInstanceIds) {
      const prevNode = byPrevInstanceId?.get(unmountedId);
      if (!prevNode) continue;
      if (tryScheduleExitAnimation(ctx, prevNode, instanceId)) {
        continue;
      }
      if (ctx.composite) {
        markCompositeSubtreeStale(ctx.composite.registry, prevNode);
      }
      deleteLocalStateForSubtree(ctx.localState, prevNode);
      collectSubtreeInstanceIds(prevNode, ctx.lists.unmounted);
    }

    if (!nextChildren || !committedChildVNodes) {
      // All committed children matched existing instances, but we still need to
      // materialize the next order (e.g., keyed reorders) when parent reuse is disallowed.
      const reorderedChildren: RuntimeInstance[] = [];
      const reorderedVNodes: VNode[] = [];
      for (const child of res.value.nextChildren) {
        const reused = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        if (!reused) continue;
        reorderedChildren.push(reused);
        reorderedVNodes.push(reused.vnode);
      }
      nextChildren = reorderedChildren;
      committedChildVNodes = reorderedVNodes;
    }
    if (!committedChildVNodes) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "commit invariant violated: missing committed child VNodes",
        },
      };
    }

    const propsChanged = prev === null || !canFastReuseContainerSelf(prev.vnode, vnode);
    const childrenChanged = prev === null || runtimeChildrenChanged(prevChildren, nextChildren);
    const selfDirty = propsChanged || childrenChanged;

    // Diagnostic: general-path new-instance (only if not already logged by fast-reuse diagnostic)
    if (__commitDiag.enabled && !canTryFastReuse && prev !== null) {
      let cDiffs = 0;
      const minLen = Math.min(prevChildren.length, nextChildren.length);
      for (let ci = 0; ci < minLen; ci++) {
        if (prevChildren[ci] !== nextChildren[ci]) cDiffs++;
      }
      cDiffs += Math.abs(prevChildren.length - nextChildren.length);
      __commitDiag.push({
        id: instanceId as number,
        kind: vnode.kind,
        reason: "new-instance",
        detail:
          propsChanged && childrenChanged
            ? "props+children"
            : propsChanged
              ? "props-changed"
              : childrenChanged
                ? "children-changed"
                : "general-path",
        failingProp: propsChanged ? diagWhichPropFails(prev.vnode, vnode) : undefined,
        childDiffs: cDiffs,
        prevChildren: prevChildren.length,
        nextChildren: nextChildren.length,
      });
    } else if (__commitDiag.enabled && prev === null) {
      __commitDiag.push({
        id: instanceId as number,
        kind: vnode.kind,
        reason: "new-instance",
        detail: "no-prev",
      });
    }

    // In-place mutation: when props are unchanged and only children references
    // changed, mutate the existing RuntimeInstance to preserve reference identity.
    // This prevents parent containers from cascading new-instance creation.
    if (prev !== null && !propsChanged && childrenChanged) {
      (prev as { children: readonly RuntimeInstance[] }).children = nextChildren;
      (prev as { vnode: VNode }).vnode = rewriteCommittedVNode(vnode, committedChildVNodes);
      prev.selfDirty = true;
      prev.dirty = true;
      return { ok: true, value: { root: prev } };
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode: rewriteCommittedVNode(vnode, committedChildVNodes),
          children: nextChildren,
          dirty: selfDirty || childrenChanged || hasDirtyChild(nextChildren),
          selfDirty,
          renderPacketKey: prev?.renderPacketKey ?? 0,
          renderPacket: prev?.renderPacket ?? null,
        },
      },
    };
  } finally {
    if (pushedCompositeTheme) {
      ctx.compositeThemeStack.pop();
    }
  }
}

function executeCompositeRender(
  instanceId: InstanceId,
  vnode: VNode,
  compositeMeta: CompositeWidgetMeta,
  ctx: CommitCtx,
  nodePath: string[],
  depth: number,
): CommitNodeResult {
  const prev =
    ctx.prevNodeStack.length > 0 ? (ctx.prevNodeStack[ctx.prevNodeStack.length - 1] ?? null) : null;
  const compositeRuntime = ctx.composite as NonNullable<CommitCtx["composite"]>;

  let compositeChild: VNode | null = null;
  let popCompositeStack = false;
  try {
    const activeCompositeMeta = compositeMeta;
    const registry = compositeRuntime.registry;
    const existing = registry.get(instanceId);

    if (existing && existing.widgetKey !== compositeMeta.widgetKey) {
      // Same instanceId but different widget type: invalidate stale closures and remount hooks.
      registry.incrementGeneration(instanceId);
      registry.delete(instanceId);
    }

    if (!registry.get(instanceId)) {
      try {
        registry.create(instanceId, compositeMeta.widgetKey);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          },
        };
      }
    }

    const state = registry.get(instanceId);
    if (!state) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: `composite state missing for instanceId=${String(instanceId)}`,
        },
      };
    }

    const invalidateInstance = () => {
      registry.invalidate(instanceId);
      ctx.composite?.onInvalidate(instanceId);
    };

    const prevMeta = prev ? getCompositeMeta(prev.vnode) : null;
    const prevChild = prev?.children[0] ?? null;
    const previousSelections = registry.getAppStateSelections(instanceId);
    const skipRenderEligible =
      !state.needsRender &&
      previousSelections.length > 0 &&
      prevMeta !== null &&
      prevChild !== null &&
      prevMeta.widgetKey === activeCompositeMeta.widgetKey &&
      compositePropsEqual(prevMeta.props, activeCompositeMeta.props);

    let canSkipCompositeRender = false;
    if (skipRenderEligible) {
      const evalRes = evaluateAppStateSelections(previousSelections, compositeRuntime.appState);
      if (evalRes.threw !== null) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail:
              evalRes.threw instanceof Error
                ? `${evalRes.threw.name}: ${evalRes.threw.message}`
                : String(evalRes.threw),
          },
        };
      }
      canSkipCompositeRender = !evalRes.changed;
    }

    if (canSkipCompositeRender && prevChild !== null) {
      compositeChild = prevChild.vnode;
    } else {
      const colorTokens = readCompositeColorTokens(ctx);
      const compositeDepth = ctx.compositeRenderStack.length + 1;
      if (compositeDepth > MAX_COMPOSITE_RENDER_DEPTH) {
        const chain = ctx.compositeRenderStack
          .map((entry) => entry.widgetKey)
          .concat(activeCompositeMeta.widgetKey)
          .join(" -> ");
        return {
          ok: false,
          fatal: {
            code: "ZRUI_INVALID_PROPS",
            detail: `ZRUI_MAX_DEPTH: composite render depth ${String(compositeDepth)} exceeds max ${String(
              MAX_COMPOSITE_RENDER_DEPTH,
            )}. Chain: ${chain}`,
          },
        };
      }
      registry.beginRender(instanceId);
      const hookCtx = createHookContext(state, invalidateInstance);
      const nextSelections: AppStateSelection[] = [];
      const widgetCtx: WidgetContext<unknown> = Object.freeze({
        id: (suffix: string) => scopedId(activeCompositeMeta.widgetKey, instanceId, suffix),
        useState: hookCtx.useState,
        useRef: hookCtx.useRef,
        useEffect: hookCtx.useEffect,
        useMemo: hookCtx.useMemo,
        useCallback: hookCtx.useCallback,
        useAppState: <T>(selector: (s: unknown) => T): T => {
          const selected = selector(compositeRuntime.appState);
          nextSelections.push({
            selector: selector as (state: unknown) => unknown,
            value: selected,
          });
          return selected;
        },
        useTheme: () => colorTokens,
        useViewport: () => {
          compositeRuntime.onUseViewport?.();
          return compositeRuntime.viewport ?? DEFAULT_VIEWPORT_SNAPSHOT;
        },
        invalidate: invalidateInstance,
      });

      ctx.compositeRenderStack.push({
        widgetKey: activeCompositeMeta.widgetKey,
        instanceId,
      });
      popCompositeStack = true;
      try {
        compositeChild = activeCompositeMeta.render(widgetCtx);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          },
        };
      }

      try {
        const pending = registry.endRender(instanceId);
        const pendingCleanups = registry.getPendingCleanups(instanceId);
        for (const cleanup of pendingCleanups) ctx.pendingCleanups.push(cleanup);
        for (const eff of pending) ctx.pendingEffects.push(eff);
        registry.setAppStateSelections(instanceId, nextSelections);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          },
        };
      }
    }

    if (isContainerVNode(vnode)) {
      const childOverride = compositeChild ? ([compositeChild] as const) : null;
      if (childOverride) {
        ctx.containerChildOverrides.set(instanceId, childOverride);
      }
      try {
        return commitContainer(instanceId, vnode, prev, ctx, nodePath, depth);
      } finally {
        if (childOverride) {
          ctx.containerChildOverrides.delete(instanceId);
        }
      }
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode,
          children: EMPTY_CHILDREN,
          dirty: true,
          selfDirty: true,
          renderPacketKey: 0,
          renderPacket: null,
        },
      },
    };
  } finally {
    if (popCompositeStack) {
      ctx.compositeRenderStack.pop();
    }
  }
}

function commitNode(
  prev: RuntimeInstance | null,
  instanceId: InstanceId,
  vnode: VNode,
  ctx: CommitCtx,
  nodePath: string,
): CommitNodeResult {
  ctx.layoutDepthRef.value += 1;
  const layoutDepth = ctx.layoutDepthRef.value;
  const trackPath = layoutDepth >= LAYOUT_DEPTH_PATH_TRACK_START;
  if (trackPath) ctx.layoutPathTail.push(widgetPathEntry(vnode));
  ctx.prevNodeStack.push(prev);
  try {
    if (
      DEV_MODE &&
      layoutDepth > LAYOUT_DEPTH_WARN_THRESHOLD &&
      !ctx.emittedWarnings.has("layout_depth")
    ) {
      ctx.emittedWarnings.add("layout_depth");
      warnDev(
        `[rezi][commit] layout depth ${String(layoutDepth)} exceeds warning threshold ${String(
          LAYOUT_DEPTH_WARN_THRESHOLD,
        )}. Deep trees may fail near depth ${String(
          MAX_LAYOUT_NESTING_DEPTH,
        )}. Path: ${formatWidgetPath(layoutDepth, ctx.layoutPathTail)}`,
      );
    }
    if (layoutDepth > MAX_LAYOUT_NESTING_DEPTH) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: `ZRUI_MAX_DEPTH: layout nesting depth ${String(layoutDepth)} exceeds max ${String(
            MAX_LAYOUT_NESTING_DEPTH,
          )}. Path: ${formatWidgetPath(layoutDepth, ctx.layoutPathTail)}`,
        },
      };
    }

    // Temporary debug: trace commit matching (remove after investigation)
    const commitDebug = globalThis as Record<string, unknown> & {
      __commitDebug?: unknown;
      __commitDebugLog?: string[] | undefined;
    };
    if (commitDebug.__commitDebug) {
      const debugLog = commitDebug.__commitDebugLog;
      if (debugLog) {
        debugLog.push(
          `commitNode(${String(instanceId)}, ${vnode.kind}, prev=${prev ? `${prev.vnode.kind}:${String(prev.instanceId)}` : "null"})`,
        );
      }
    }

    // Leaf nodes — fast path: reuse previous RuntimeInstance when content is unchanged.
    // Do this before any bookkeeping so unchanged leaf-heavy subtrees (lists, tables)
    // don't pay per-node validation overhead.
    if (prev && prev.vnode.kind === vnode.kind && leafVNodeEqual(prev.vnode, vnode)) {
      if (__commitDiag.enabled) {
        const wasDirty = prev.selfDirty;
        __commitDiag.push({
          id: instanceId as number,
          kind: vnode.kind,
          reason: "leaf-reuse",
          detail: wasDirty ? "was-dirty" : undefined,
        });
      }
      if (ctx.collectLifecycleInstanceIds) ctx.lists.reused.push(instanceId);
      prev.dirty = false;
      prev.selfDirty = false;
      return { ok: true, value: { root: prev } };
    }
    // Diagnostic: leaf not reused
    if (__commitDiag.enabled && prev && !isContainerVNode(vnode)) {
      if (prev.vnode.kind !== vnode.kind) {
        __commitDiag.push({
          id: instanceId as number,
          kind: vnode.kind,
          reason: "new-instance",
          detail: "leaf-kind-mismatch",
        });
      } else {
        __commitDiag.push({
          id: instanceId as number,
          kind: vnode.kind,
          reason: "new-instance",
          detail: "leaf-content-changed",
        });
      }
    }

    if (vnode.kind === "errorBoundary") {
      ctx.errorBoundary?.activePaths.add(nodePath);
      const props = vnode.props as Readonly<{
        children?: unknown;
        fallback?: unknown;
      }>;
      const protectedChild = props.children;
      if (!isVNode(protectedChild)) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_INVALID_PROPS",
            detail: "errorBoundary children must be a VNode",
          },
        };
      }

      const protectedPath = `${nodePath}/b:protected`;
      const fallbackPath = `${nodePath}/b:fallback`;

      const retryRequested = ctx.errorBoundary?.retryRequestedPaths.delete(nodePath) === true;
      const existingState = ctx.errorBoundary?.errorsByPath.get(nodePath);

      if (existingState && !retryRequested) {
        return commitErrorBoundaryFallback(
          prev,
          instanceId,
          nodePath,
          fallbackPath,
          props,
          existingState,
          ctx,
        );
      }

      const committedProtected = commitNode(prev, instanceId, protectedChild, ctx, protectedPath);
      if (committedProtected.ok) {
        ctx.errorBoundary?.errorsByPath.delete(nodePath);
        return committedProtected;
      }

      if (committedProtected.fatal.code !== "ZRUI_USER_CODE_THROW") {
        return committedProtected;
      }

      const trappedState = captureErrorBoundaryState(committedProtected.fatal.detail);
      ctx.errorBoundary?.errorsByPath.set(nodePath, trappedState);
      return commitErrorBoundaryFallback(
        prev,
        instanceId,
        nodePath,
        fallbackPath,
        props,
        trappedState,
        ctx,
      );
    }

    const idFatal = ensureInteractiveId(ctx.seenInteractiveIds, instanceId, vnode);
    if (idFatal) return { ok: false, fatal: idFatal };

    if (ctx.collectLifecycleInstanceIds) {
      if (prev) ctx.lists.reused.push(instanceId);
      else {
        ctx.lists.mounted.push(instanceId);
        if (__commitDiag.enabled)
          __commitDiag.push({ id: instanceId as number, kind: vnode.kind, reason: "new-mount" });
      }
    }

    if (ctx.composite) {
      const compositeMeta = getCompositeMeta(vnode);
      if (compositeMeta) {
        return executeCompositeRender(
          instanceId,
          vnode,
          compositeMeta,
          ctx,
          [nodePath],
          layoutDepth,
        );
      }
    }

    if (isContainerVNode(vnode)) {
      return commitContainer(instanceId, vnode, prev, ctx, [nodePath], layoutDepth);
    }

    // Leaf node: when prev exists and kind matches, mutate in-place to preserve
    // reference identity. This prevents parent containers from cascading new-instance
    // creation when only leaf content changed.
    if (prev !== null && prev.vnode.kind === vnode.kind) {
      prev.vnode = vnode;
      prev.selfDirty = true;
      prev.dirty = true;
      return { ok: true, value: { root: prev } };
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode,
          children: EMPTY_CHILDREN,
          dirty: true,
          selfDirty: true,
          renderPacketKey: 0,
          renderPacket: null,
        },
      },
    };
  } finally {
    ctx.prevNodeStack.pop();
    if (trackPath) ctx.layoutPathTail.pop();
    ctx.layoutDepthRef.value -= 1;
  }
}

/**
 * Deterministically commit a VNode tree into a runtime instance tree, applying
 * locked reconciliation rules (docs/10) and enforcing interactive id uniqueness.
 *
 * Notes:
 * - Uses an implicit root parent instanceId=0 for reconciliation of the returned root VNode.
 * - Does not perform layout, focus, routing, or drawlist building.
 */
export function commitVNodeTree(
  prevRoot: RuntimeInstance | null,
  nextRootVNode: VNode,
  opts: Readonly<{
    allocator: InstanceIdAllocator;
    localState?: RuntimeLocalStateStore;
    /** Skip mounted/reused instanceId tracking (unmounted tracking remains). */
    collectLifecycleInstanceIds?: boolean;
    /**
     * Optional reusable map for interactive id uniqueness checks.
     * Cleared at the start of each commit cycle.
     */
    interactiveIdIndex?: Map<string, string>;
    composite?: Readonly<{
      registry: CompositeInstanceRegistry;
      appState: unknown;
      colorTokens?: ColorTokens | null;
      theme?: Theme;
      getColorTokens?: (theme: Theme) => ColorTokens | null;
      viewport?: ResponsiveViewportSnapshot;
      onInvalidate: (instanceId: InstanceId) => void;
      onUseViewport?: () => void;
    }>;
    errorBoundary?: Readonly<{
      errorsByPath: Map<string, CommitErrorBoundaryState>;
      retryRequestedPaths: Set<string>;
      activePaths: Set<string>;
      requestRetry: (path: string) => void;
    }>;
  }>,
): CommitResult {
  const collectLifecycleInstanceIds = opts.collectLifecycleInstanceIds !== false;
  const interactiveIdIndex = opts.interactiveIdIndex ?? new Map<string, string>();
  interactiveIdIndex.clear();
  const ctx: CommitCtx = {
    allocator: opts.allocator,
    localState: opts.localState,
    seenInteractiveIds: interactiveIdIndex,
    prevNodeStack: [],
    containerChildOverrides: new Map<InstanceId, readonly VNode[]>(),
    layoutDepthRef: { value: 0 },
    layoutPathTail: [],
    emittedWarnings: new Set<string>(),
    lists: { mounted: [], reused: [], unmounted: [] },
    collectLifecycleInstanceIds,
    composite: opts.composite ?? null,
    compositeThemeStack: opts.composite?.theme ? [opts.composite.theme] : [],
    compositeRenderStack: [],
    pendingExitAnimations: [],
    pendingCleanups: [],
    pendingEffects: [],
    errorBoundary: opts.errorBoundary ?? null,
  };

  const prevChildren = prevRoot ? [{ instanceId: prevRoot.instanceId, vnode: prevRoot.vnode }] : [];
  const res = reconcileChildren(0, prevChildren, [nextRootVNode], opts.allocator, {
    kind: "root",
  });
  if (!res.ok) return { ok: false, fatal: res.fatal };

  const rootPlan = res.value.nextChildren[0];
  if (!rootPlan) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "commitVNodeTree: missing root vnode" },
    };
  }

  if (prevRoot && rootPlan.prevIndex === null) {
    // Root was replaced; unmount the entire previous tree before committing the new one so
    // the returned lists include the unmount lifecycle deterministically.
    if (!tryScheduleExitAnimation(ctx, prevRoot, 0)) {
      deleteLocalStateForSubtree(opts.localState, prevRoot);
      collectSubtreeInstanceIds(prevRoot, ctx.lists.unmounted);
    }
  }

  const prevMatch = rootPlan.prevIndex === 0 ? prevRoot : null;
  const committedRoot = commitNode(prevMatch, rootPlan.instanceId, rootPlan.vnode, ctx, "root");
  if (!committedRoot.ok) return committedRoot;

  return {
    ok: true,
    value: {
      root: committedRoot.value.root,
      mountedInstanceIds: ctx.lists.mounted,
      reusedInstanceIds: ctx.lists.reused,
      unmountedInstanceIds: ctx.lists.unmounted,
      pendingExitAnimations: ctx.pendingExitAnimations,
      pendingCleanups: ctx.pendingCleanups,
      pendingEffects: ctx.pendingEffects,
    },
  };
}

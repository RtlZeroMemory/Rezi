/**
 * packages/core/src/runtime/widgetMeta.ts — Widget metadata collection.
 *
 * Why: Extracts structured metadata from the committed runtime tree for use in
 * focus management, event routing, and input handling. These functions provide
 * deterministic traversal-order collections of widget properties.
 *
 * Collections:
 *   - focusableIds: enabled focusable widgets in traversal order
 *   - enabledMap: all interactive widgets mapped to enabled state
 *   - pressableIds: Buttons that can produce "press" actions
 *   - inputMetaById: Input widget metadata (value, cursor, etc.)
 *   - focusZones: zone metadata with their contained focusable ids
 *   - focusTraps: trap metadata with their contained focusable ids
 *
 * @see docs/guide/runtime-and-layout.md
 */

import { getWidgetProtocol, kindIsFocusable, kindIsPressable } from "../widgets/protocol.js";
import type { FocusZoneNavigation } from "../widgets/types.js";
import type { RuntimeInstance } from "./commit.js";
import type { InstanceId } from "./instance.js";

/** Extract interactive widget ID from a node with a valid `id` prop. */
function readInteractiveId(v: RuntimeInstance["vnode"]): string | null {
  const proto = getWidgetProtocol(v.kind);
  if (!proto.requiresId && !proto.focusable && !proto.pressable) return null;
  const id = (v.props as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

function isFocusableInteractive(v: RuntimeInstance["vnode"]): boolean {
  const focusable = (v.props as { focusable?: unknown }).focusable;
  if (focusable === false) return false;

  // Note: Some interactive widgets require an id for routing (e.g. SplitPane dividers),
  // but are explicitly NOT focusable (PLAN.md).
  return kindIsFocusable(v.kind);
}

function isEnabledInteractive(v: RuntimeInstance["vnode"]): string | null {
  const id = readInteractiveId(v);
  if (id === null) return null;

  // Disabled applies only to a subset of interactive widgets.
  if (
    v.kind === "button" ||
    v.kind === "link" ||
    v.kind === "input" ||
    v.kind === "slider" ||
    v.kind === "select" ||
    v.kind === "checkbox" ||
    v.kind === "radioGroup"
  ) {
    const disabled = (v.props as { disabled?: unknown }).disabled;
    if (disabled === true) return null;
  }

  // For advanced widgets, check the 'open' prop for modal widgets
  if (v.kind === "commandPalette" || v.kind === "toolApprovalDialog") {
    const open = (v.props as { open?: unknown }).open;
    if (open !== true) return null;
  }

  return id;
}

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
      if (
        node.vnode.kind === "button" ||
        node.vnode.kind === "input" ||
        node.vnode.kind === "slider" ||
        node.vnode.kind === "select" ||
        node.vnode.kind === "checkbox" ||
        node.vnode.kind === "radioGroup"
      ) {
        const disabled = (node.vnode.props as { disabled?: unknown }).disabled;
        enabled = disabled !== true;
      }
      // For modal widgets, enabled depends on 'open' prop
      if (node.vnode.kind === "commandPalette" || node.vnode.kind === "toolApprovalDialog") {
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

/** Metadata for an Input widget instance. */
export type InputMeta = Readonly<{
  instanceId: InstanceId;
  value: string;
  disabled: boolean;
  multiline: boolean;
  rows: number;
  wordWrap: boolean;
  onInput?: (value: string, cursor: number) => void;
  onBlur?: () => void;
}>;

/** Structured accessibility/focus semantics for a focusable widget. */
export type FocusInfo = Readonly<{
  id: string | null;
  kind: RuntimeInstance["vnode"]["kind"] | null;
  accessibleLabel: string | null;
  visibleLabel: string | null;
  required: boolean;
  errors: readonly string[];
  announcement: string | null;
}>;

type FieldContext = Readonly<{
  label: string | null;
  required: boolean;
  error: string | null;
}>;

const EMPTY_ERRORS: readonly string[] = Object.freeze([]);

function readNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFocusableVisibleLabel(vnode: RuntimeInstance["vnode"]): string | null {
  switch (vnode.kind) {
    case "button":
      return readNonEmptyString((vnode.props as { label?: unknown }).label);
    case "link": {
      const props = vnode.props as { label?: unknown; url?: unknown };
      return readNonEmptyString(props.label) ?? readNonEmptyString(props.url);
    }
    case "slider":
      return readNonEmptyString((vnode.props as { label?: unknown }).label);
    case "checkbox":
      return readNonEmptyString((vnode.props as { label?: unknown }).label);
    case "select": {
      const props = vnode.props as {
        value?: unknown;
        options?: unknown;
        placeholder?: unknown;
      };
      const value = typeof props.value === "string" ? props.value : "";
      const options = Array.isArray(props.options)
        ? (props.options as readonly { value?: unknown; label?: unknown }[])
        : [];
      for (const option of options) {
        if (
          typeof option?.value === "string" &&
          option.value === value &&
          typeof option.label === "string"
        ) {
          return readNonEmptyString(option.label);
        }
      }
      return readNonEmptyString(props.placeholder);
    }
    case "radioGroup": {
      const props = vnode.props as { value?: unknown; options?: unknown };
      const value = typeof props.value === "string" ? props.value : "";
      const options = Array.isArray(props.options)
        ? (props.options as readonly { value?: unknown; label?: unknown }[])
        : [];
      for (const option of options) {
        if (
          typeof option?.value === "string" &&
          option.value === value &&
          typeof option.label === "string"
        ) {
          return readNonEmptyString(option.label);
        }
      }
      return null;
    }
    case "commandPalette":
      return readNonEmptyString((vnode.props as { placeholder?: unknown }).placeholder);
    case "filePicker":
      return readNonEmptyString((vnode.props as { rootPath?: unknown }).rootPath);
    case "diffViewer": {
      const diff = (vnode.props as { diff?: { newPath?: unknown; oldPath?: unknown } }).diff;
      if (diff && typeof diff === "object") {
        return readNonEmptyString(diff.newPath) ?? readNonEmptyString(diff.oldPath);
      }
      return null;
    }
    case "toolApprovalDialog": {
      const request = (vnode.props as { request?: { toolName?: unknown } }).request;
      if (request && typeof request === "object") {
        return readNonEmptyString(request.toolName);
      }
      return null;
    }
    default:
      return null;
  }
}

function kindToAnnouncementPrefix(kind: RuntimeInstance["vnode"]["kind"]): string {
  switch (kind) {
    case "button":
      return "Button";
    case "link":
      return "Link";
    case "input":
      return "Input";
    case "slider":
      return "Slider";
    case "virtualList":
      return "List";
    case "table":
      return "Table";
    case "tree":
      return "Tree";
    case "select":
      return "Select";
    case "checkbox":
      return "Checkbox";
    case "radioGroup":
      return "Radio group";
    case "commandPalette":
      return "Command palette";
    case "filePicker":
      return "File picker";
    case "fileTreeExplorer":
      return "File tree explorer";
    case "codeEditor":
      return "Code editor";
    case "diffViewer":
      return "Diff viewer";
    case "toolApprovalDialog":
      return "Tool approval dialog";
    case "logsConsole":
      return "Logs console";
    default:
      return "Widget";
  }
}

function readFieldContext(vnode: RuntimeInstance["vnode"]): FieldContext | null {
  if (vnode.kind !== "field") return null;
  const props = vnode.props as { label?: unknown; required?: unknown; error?: unknown };
  return Object.freeze({
    label: readNonEmptyString(props.label),
    required: props.required === true,
    error: readNonEmptyString(props.error),
  });
}

function resolveFieldLabel(fieldStack: readonly FieldContext[]): string | null {
  for (let i = fieldStack.length - 1; i >= 0; i--) {
    const label = fieldStack[i]?.label;
    if (label) return label;
  }
  return null;
}

function resolveFieldRequired(fieldStack: readonly FieldContext[]): boolean {
  for (let i = fieldStack.length - 1; i >= 0; i--) {
    if (fieldStack[i]?.required === true) return true;
  }
  return false;
}

function resolveFieldErrors(fieldStack: readonly FieldContext[]): readonly string[] {
  if (fieldStack.length === 0) return EMPTY_ERRORS;
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = fieldStack.length - 1; i >= 0; i--) {
    const error = fieldStack[i]?.error;
    if (!error || seen.has(error)) continue;
    seen.add(error);
    out.push(error);
  }
  return out.length > 0 ? Object.freeze(out) : EMPTY_ERRORS;
}

function buildFocusAnnouncement(
  primary: string,
  required: boolean,
  errors: readonly string[],
): string {
  const parts: string[] = [primary];
  if (required) parts.push("Required");
  if (errors.length === 1) {
    const first = errors[0];
    if (first) parts.push(first);
  } else if (errors.length > 1) {
    parts.push(`${String(errors.length)} validation errors`);
  }
  return parts.join(" — ");
}

function buildFocusInfo(
  vnode: RuntimeInstance["vnode"],
  id: string,
  fieldStack: readonly FieldContext[],
): FocusInfo {
  const accessibleLabel = readNonEmptyString(
    (vnode.props as { accessibleLabel?: unknown }).accessibleLabel,
  );
  const widgetLabel = readFocusableVisibleLabel(vnode);
  const fieldLabel = resolveFieldLabel(fieldStack);
  const visibleLabel = widgetLabel ?? fieldLabel;
  const required = resolveFieldRequired(fieldStack);
  const errors = resolveFieldErrors(fieldStack);
  const primary =
    accessibleLabel ?? visibleLabel ?? `${kindToAnnouncementPrefix(vnode.kind)} ${id}`;
  return Object.freeze({
    id,
    kind: vnode.kind,
    accessibleLabel,
    visibleLabel,
    required,
    errors,
    announcement: buildFocusAnnouncement(primary, required, errors),
  });
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

/**
 * Collect all focus zones from a committed runtime tree.
 *
 * - Order: depth-first preorder
 * - Each zone contains only the focusable ids directly within it (not in nested zones/traps)
 */
export function collectFocusZones(tree: RuntimeInstance): ReadonlyMap<string, CollectedZone> {
  const m = new Map<string, CollectedZone>();

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

      if (id !== null && !m.has(id)) {
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

      if (id !== null && !m.has(id)) {
        const active = node.vnode.kind === "modal" ? true : props.active === true;
        const returnFocusTo = typeof props.returnFocusTo === "string" ? props.returnFocusTo : null;
        const initialFocus = typeof props.initialFocus === "string" ? props.initialFocus : null;

        // Collect focusable ids from trap children (not traversing into nested zones/traps)
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

        m.set(
          id,
          Object.freeze({
            id,
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

// ---------------------------------------------------------------------------
// Single-Pass Metadata Collector
// ---------------------------------------------------------------------------

/**
 * All widget metadata collected in a single tree traversal.
 *
 * Replaces 6+ separate O(n) traversals with one O(n) pass.
 */
export type CollectedWidgetMetadata = Readonly<{
  focusableIds: readonly string[];
  focusInfoById: ReadonlyMap<string, FocusInfo>;
  enabledById: ReadonlyMap<string, boolean>;
  pressableIds: ReadonlySet<string>;
  inputById: ReadonlyMap<string, InputMeta>;
  zones: ReadonlyMap<string, CollectedZone>;
  traps: ReadonlyMap<string, CollectedTrap>;
  /**
   * True when the tree contains widget kinds that require the routing-rebuild pass.
   * Allows renderer fast-paths to skip an extra traversal for static/non-interactive trees.
   */
  hasRoutingWidgets: boolean;
}>;

type ContainerKind = "zone" | "trap";
type ContainerInfo = { kind: ContainerKind; id: string };

/** Stack item for single-pass traversal with exit markers. */
type TraversalItem =
  | { type: "node"; node: RuntimeInstance }
  | { type: "containerExit"; container: ContainerInfo }
  | { type: "fieldExit" };

function requiresRoutingRebuild(vnode: RuntimeInstance["vnode"]): boolean {
  return getWidgetProtocol(vnode.kind).requiresRoutingRebuild;
}

/**
 * Reusable metadata collector that pools internal data structures.
 *
 * Instead of allocating new Maps/Sets/arrays on every frame, this class
 * clears and reuses its internal collections, reducing GC pressure.
 *
 * Usage:
 *   const collector = createWidgetMetadataCollector();
 *   // Each frame:
 *   const metadata = collector.collect(committedRoot);
 */
export class WidgetMetadataCollector {
  // Output collections (reused)
  private readonly _focusableIds: string[] = [];
  private readonly _focusInfoById = new Map<string, FocusInfo>();
  private readonly _enabledById = new Map<string, boolean>();
  private readonly _pressableIds = new Set<string>();
  private readonly _inputById = new Map<string, InputMeta>();

  // Zone/trap intermediate data (reused)
  private readonly _zoneDataById = new Map<
    string,
    Omit<CollectedZone, "focusableIds"> & {
      parentZoneId?: string;
      onEnter?: () => void;
      onExit?: () => void;
    }
  >();
  private readonly _trapDataById = new Map<string, Omit<CollectedTrap, "focusableIds">>();
  private readonly _zoneFocusables = new Map<string, string[]>();
  private readonly _trapFocusables = new Map<string, string[]>();

  // Container stack for tracking current zone/trap nesting (reused)
  private readonly _containerStack: ContainerInfo[] = [];
  private readonly _fieldStack: FieldContext[] = [];

  // Traversal stack (reused)
  private readonly _stack: TraversalItem[] = [];

  // Final output maps (reused)
  private readonly _zones = new Map<string, CollectedZone>();
  private readonly _traps = new Map<string, CollectedTrap>();

  /**
   * Collect all widget metadata in a single tree traversal.
   *
   * Internal collections are cleared and reused to avoid allocations.
   */
  collect(tree: RuntimeInstance): CollectedWidgetMetadata {
    // Clear all reusable collections
    this._focusableIds.length = 0;
    this._focusInfoById.clear();
    this._enabledById.clear();
    this._pressableIds.clear();
    this._inputById.clear();
    this._zoneDataById.clear();
    this._trapDataById.clear();
    this._zoneFocusables.clear();
    this._trapFocusables.clear();
    this._containerStack.length = 0;
    this._fieldStack.length = 0;
    this._stack.length = 0;
    this._zones.clear();
    this._traps.clear();

    let hasRoutingWidgets = false;

    this._stack.push({ type: "node", node: tree });

    while (this._stack.length > 0) {
      const item = this._stack.pop();
      if (!item) continue;

      // Handle exit markers.
      if (item.type === "containerExit") {
        this._containerStack.pop();
        continue;
      }
      if (item.type === "fieldExit") {
        this._fieldStack.pop();
        continue;
      }

      const node = item.node;
      const vnode = node.vnode;
      if (!hasRoutingWidgets && requiresRoutingRebuild(vnode)) {
        hasRoutingWidgets = true;
      }

      const fieldContext = readFieldContext(vnode);
      if (fieldContext !== null) {
        this._fieldStack.push(fieldContext);
        this._stack.push({ type: "fieldExit" });
      }

      // --- Collect focusable IDs ---
      const focusableId = isFocusableInteractive(vnode) ? isEnabledInteractive(vnode) : null;
      if (focusableId !== null) {
        this._focusableIds.push(focusableId);
        if (!this._focusInfoById.has(focusableId)) {
          this._focusInfoById.set(
            focusableId,
            buildFocusInfo(vnode, focusableId, this._fieldStack),
          );
        }
        // Attribute to current container (innermost zone/trap)
        if (this._containerStack.length > 0) {
          const container = this._containerStack[this._containerStack.length - 1];
          if (container) {
            if (container.kind === "zone") {
              this._zoneFocusables.get(container.id)?.push(focusableId);
            } else {
              this._trapFocusables.get(container.id)?.push(focusableId);
            }
          }
        }
      }

      // --- Collect enabled map ---
      const interactiveId = readInteractiveId(vnode);
      if (interactiveId !== null && !this._enabledById.has(interactiveId)) {
        let enabled = true;
        if (
          vnode.kind === "button" ||
          vnode.kind === "link" ||
          vnode.kind === "input" ||
          vnode.kind === "slider" ||
          vnode.kind === "select" ||
          vnode.kind === "checkbox" ||
          vnode.kind === "radioGroup"
        ) {
          const disabled = (vnode.props as { disabled?: unknown }).disabled;
          enabled = disabled !== true;
        }
        if (vnode.kind === "commandPalette" || vnode.kind === "toolApprovalDialog") {
          const open = (vnode.props as { open?: unknown }).open;
          enabled = open === true;
        }
        this._enabledById.set(interactiveId, enabled);
      }

      // --- Collect pressable IDs ---
      if (vnode.kind === "button" || vnode.kind === "link") {
        const id = (vnode.props as { id?: unknown }).id;
        if (typeof id === "string" && id.length > 0) {
          this._pressableIds.add(id);
        }
      }

      // --- Collect input metadata ---
      if (vnode.kind === "input") {
        const props = vnode.props as {
          id?: unknown;
          value?: unknown;
          disabled?: unknown;
          multiline?: unknown;
          rows?: unknown;
          wordWrap?: unknown;
          onInput?: unknown;
          onBlur?: unknown;
        };
        const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;
        const value = typeof props.value === "string" ? props.value : null;
        if (id !== null && value !== null && !this._inputById.has(id)) {
          const disabled = props.disabled === true;
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
          this._inputById.set(id, meta);
        }
      }

      // --- Collect focus zones ---
      if (vnode.kind === "focusZone") {
        const props = vnode.props as {
          id?: unknown;
          tabIndex?: unknown;
          navigation?: unknown;
          columns?: unknown;
          wrapAround?: unknown;
          onEnter?: unknown;
          onExit?: unknown;
        };
        const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;

        if (id !== null && !this._zoneDataById.has(id)) {
          const tabIndex = typeof props.tabIndex === "number" ? props.tabIndex : 0;
          const navigation =
            props.navigation === "linear" ||
            props.navigation === "grid" ||
            props.navigation === "none"
              ? props.navigation
              : "linear";
          const columns =
            typeof props.columns === "number" && props.columns > 0 ? props.columns : 1;
          const wrapAround = props.wrapAround !== false;
          const onEnter =
            typeof props.onEnter === "function" ? (props.onEnter as () => void) : undefined;
          const onExit =
            typeof props.onExit === "function" ? (props.onExit as () => void) : undefined;

          let parentZoneId: string | null = null;
          for (let i = this._containerStack.length - 1; i >= 0; i--) {
            const container = this._containerStack[i];
            if (container?.kind === "zone") {
              parentZoneId = container.id;
              break;
            }
          }

          const zoneData: Omit<CollectedZone, "focusableIds"> & {
            parentZoneId?: string;
            onEnter?: () => void;
            onExit?: () => void;
          } = { id, tabIndex, navigation, columns, wrapAround };
          if (parentZoneId !== null) {
            zoneData.parentZoneId = parentZoneId;
          }
          if (onEnter !== undefined) {
            zoneData.onEnter = onEnter;
          }
          if (onExit !== undefined) {
            zoneData.onExit = onExit;
          }
          this._zoneDataById.set(id, zoneData);
          this._zoneFocusables.set(id, []);

          // Push exit marker and enter container
          const container: ContainerInfo = { kind: "zone", id };
          this._containerStack.push(container);
          this._stack.push({ type: "containerExit", container });
        }
      }

      // --- Collect focus traps ---
      if (vnode.kind === "focusTrap" || vnode.kind === "modal") {
        const props = vnode.props as {
          id?: unknown;
          active?: unknown;
          returnFocusTo?: unknown;
          initialFocus?: unknown;
        };
        const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;

        if (id !== null && !this._trapDataById.has(id)) {
          const active = vnode.kind === "modal" ? true : props.active === true;
          const returnFocusTo =
            typeof props.returnFocusTo === "string" ? props.returnFocusTo : null;
          const initialFocus = typeof props.initialFocus === "string" ? props.initialFocus : null;

          this._trapDataById.set(id, { id, active, returnFocusTo, initialFocus });
          this._trapFocusables.set(id, []);

          // Push exit marker and enter container
          const container: ContainerInfo = { kind: "trap", id };
          this._containerStack.push(container);
          this._stack.push({ type: "containerExit", container });
        }
      }

      // Push children in reverse order for correct traversal order
      for (let i = node.children.length - 1; i >= 0; i--) {
        const c = node.children[i];
        if (c) this._stack.push({ type: "node", node: c });
      }
    }

    // Build final zones with focusableIds
    for (const [id, data] of this._zoneDataById) {
      const focusables = this._zoneFocusables.get(id) ?? [];
      this._zones.set(
        id,
        Object.freeze({
          ...data,
          focusableIds: Object.freeze(focusables),
        }),
      );
    }

    // Build final traps with focusableIds
    for (const [id, data] of this._trapDataById) {
      const focusables = this._trapFocusables.get(id) ?? [];
      this._traps.set(
        id,
        Object.freeze({
          ...data,
          focusableIds: Object.freeze(focusables),
        }),
      );
    }

    return Object.freeze({
      focusableIds: Object.freeze(this._focusableIds.slice()),
      focusInfoById: this._focusInfoById,
      enabledById: this._enabledById,
      pressableIds: this._pressableIds,
      inputById: this._inputById,
      zones: this._zones,
      traps: this._traps,
      hasRoutingWidgets,
    });
  }
}

/** Create a reusable widget metadata collector. */
export function createWidgetMetadataCollector(): WidgetMetadataCollector {
  return new WidgetMetadataCollector();
}

/**
 * Collect all widget metadata in a single tree traversal.
 *
 * This replaces:
 * - collectFocusableIds()
 * - collectEnabledMap()
 * - collectPressableIds()
 * - collectInputMetaById()
 * - collectFocusZones()
 * - collectFocusTraps()
 *
 * Performance: O(n) where n = number of nodes in the tree.
 *
 * Note: This function allocates new collections each call. For hot paths,
 * use createWidgetMetadataCollector() to reuse collections across frames.
 */
export function collectAllWidgetMetadata(tree: RuntimeInstance): CollectedWidgetMetadata {
  // Use a one-shot collector (allocates, but preserves API compatibility)
  const collector = new WidgetMetadataCollector();
  return collector.collect(tree);
}

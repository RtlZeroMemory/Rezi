import { getWidgetProtocol } from "../../widgets/protocol.js";
import type { RuntimeInstance } from "../commit.js";
import type {
  CollectedTrap,
  CollectedZone,
  ContainerInfo,
  FocusContainerKind,
} from "./focusContainers.js";
import { recordFocusContainerId } from "./focusContainers.js";
import type { FieldContext, FocusInfo } from "./focusInfo.js";
import { buildFocusInfo, readFieldContext } from "./focusInfo.js";
import type { InputMeta } from "./helpers.js";
import { isEnabledInteractive, isFocusableInteractive, readInteractiveId } from "./helpers.js";

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
  private readonly _focusContainerKindsById = new Map<string, FocusContainerKind>();
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
    this._focusContainerKindsById.clear();
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
        for (let i = this._containerStack.length - 1; i >= 0; i--) {
          const container = this._containerStack[i];
          if (container?.kind === "trap") {
            break;
          }
          if (container?.kind === "zone") {
            this._zoneFocusables.get(container.id)?.push(focusableId);
            break;
          }
        }
        for (let i = this._containerStack.length - 1; i >= 0; i--) {
          const container = this._containerStack[i];
          if (container?.kind === "trap") {
            this._trapFocusables.get(container.id)?.push(focusableId);
            break;
          }
        }
      }

      // --- Collect enabled map ---
      const interactiveId = readInteractiveId(vnode);
      if (interactiveId !== null && !this._enabledById.has(interactiveId)) {
        let enabled = true;
        const proto = getWidgetProtocol(vnode.kind);
        if (proto.disableable) {
          const disabled = (vnode.props as { disabled?: unknown }).disabled;
          enabled = disabled !== true;
        }
        if (proto.openGated) {
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
          readOnly?: unknown;
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

        if (id !== null) {
          recordFocusContainerId(this._focusContainerKindsById, id, "focusZone");
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

        if (id !== null) {
          recordFocusContainerId(this._focusContainerKindsById, id, vnode.kind);
          const active = vnode.kind === "modal" ? true : props.active === true;
          const returnFocusTo =
            typeof props.returnFocusTo === "string" ? props.returnFocusTo : null;
          const initialFocus = typeof props.initialFocus === "string" ? props.initialFocus : null;

          this._trapDataById.set(id, {
            id,
            active,
            returnFocusTo,
            initialFocus,
          });
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
          focusableIds: Object.freeze(focusables.slice()),
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
          focusableIds: Object.freeze(focusables.slice()),
        }),
      );
    }

    return Object.freeze({
      focusableIds: Object.freeze(this._focusableIds.slice()),
      focusInfoById: new Map(this._focusInfoById),
      enabledById: new Map(this._enabledById),
      pressableIds: new Set(this._pressableIds),
      inputById: new Map(this._inputById),
      zones: new Map(this._zones),
      traps: new Map(this._traps),
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

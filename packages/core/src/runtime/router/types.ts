import type { TableSelectionMode } from "../../widgets/table.js";
import type { FlattenedNode } from "../../widgets/tree.js";
import type { DropdownItem, ItemHeightSpec } from "../../widgets/types.js";
import type { FocusZone } from "../focus.js";
import type { TableLocalState, TreeLocalState, VirtualListLocalState } from "../localState.js";
import type { CollectedTrap } from "../widgetMeta.js";

/** Map of interactive widget ID to enabled state. */
export type EnabledById = ReadonlyMap<string, boolean>;

/**
 * Action produced by event routing.
 *   - press: Button was activated (keyboard or mouse)
 *   - input: Input widget value changed
 */
export type RoutedAction =
  | Readonly<{ id: string; action: "press" }>
  | Readonly<{ id: string; action: "input"; value: string; cursor: number }>;

/**
 * Result of routing an event.
 *   - nextFocusedId: new focus target (undefined = no change)
 *   - nextPressedId: new pressed widget (undefined = no change)
 *   - action: emitted action if widget was activated
 */
export type RoutingResult = Readonly<{
  nextFocusedId?: string | null;
  nextPressedId?: string | null;
  action?: RoutedAction;
}>;

export type KeyRoutingCtx = Readonly<{
  focusedId: string | null;
  focusList: readonly string[];
  enabledById: EnabledById;
  /**
   * Optional set of ids that can produce a "press" action (Buttons).
   * When omitted, routing behaves as in MVP (all enabled focused ids are pressable).
   */
  pressableIds?: ReadonlySet<string>;
}>;

export type MouseRoutingCtx = Readonly<{
  pressedId: string | null;
  /**
   * Hit-test winner id for the mouse point, computed by the layout/hitTest module.
   * This router MUST NOT re-implement hit testing.
   */
  hitTestTargetId: string | null;
  enabledById: EnabledById;
  /**
   * Optional set of ids that can produce a "press" action (Buttons).
   * When omitted, routing behaves as in MVP (all enabled hit targets are pressable).
   */
  pressableIds?: ReadonlySet<string>;
}>;

/** Extended routing result with zone tracking. */
export type RoutingResultWithZones = RoutingResult &
  Readonly<{
    nextZoneId?: string | null;
  }>;

/** Extended key routing context with zone and trap support. */
export type KeyRoutingCtxWithZones = Readonly<{
  focusedId: string | null;
  activeZoneId: string | null;
  focusList: readonly string[];
  zones: ReadonlyMap<string, FocusZone>;
  lastFocusedByZone?: ReadonlyMap<string, string>;
  traps: ReadonlyMap<string, CollectedTrap>;
  trapStack: readonly string[];
  enabledById: EnabledById;
  pressableIds?: ReadonlySet<string>;
}>;

/** Routing context for virtual list keyboard navigation. */
export type VirtualListRoutingCtx<T = unknown> = Readonly<{
  virtualListId: string;
  items: readonly T[];
  itemHeight: ItemHeightSpec<T>;
  state: VirtualListLocalState;
  keyboardNavigation: boolean;
  wrapAround: boolean;
}>;

/** Result of virtual list key routing. */
export type VirtualListRoutingResult = Readonly<{
  nextSelectedIndex?: number;
  nextScrollTop?: number;
  action?: { id: string; action: "select"; index: number };
}>;

/** Routing context for virtual list mouse wheel. */
export type VirtualListWheelCtx = Readonly<{
  scrollTop: number;
  totalHeight: number;
  viewportHeight: number;
}>;

/** Layer routing context. */
export type LayerRoutingCtx = Readonly<{
  /** Stack of active layer IDs (topmost last). */
  layerStack: readonly string[];
  /** Map of layer ID to close-on-escape flag. */
  closeOnEscape: ReadonlyMap<string, boolean>;
  /** Map of layer ID to onClose callback. */
  onClose: ReadonlyMap<string, () => void>;
}>;

/** Layer routing result. */
export type LayerRoutingResult = Readonly<{
  /** Layer that was closed, if any. */
  closedLayerId?: string;
  /** Whether the event was consumed. */
  consumed: boolean;
}>;

/** Dropdown routing context. */
export type DropdownRoutingCtx = Readonly<{
  /** Dropdown ID. */
  dropdownId: string;
  /** Dropdown items. */
  items: readonly DropdownItem[];
  /** Currently selected item index. */
  selectedIndex: number;
  /** Callback when item is selected. */
  onSelect?: (item: DropdownItem) => void;
  /** Callback when dropdown should close. */
  onClose?: () => void;
}>;

/** Dropdown routing result. */
export type DropdownRoutingResult = Readonly<{
  /** New selected index. */
  nextSelectedIndex?: number;
  /** Item that was activated, if any. */
  activatedItem?: DropdownItem;
  /** Whether the dropdown should close. */
  shouldClose?: boolean;
  /** Whether the event was consumed. */
  consumed: boolean;
}>;

/** Routing context for table keyboard navigation. */
export type TableRoutingCtx<T = unknown> = Readonly<{
  tableId: string;
  rowKeys: readonly string[];
  rowKeyToIndex?: ReadonlyMap<string, number>;
  data: readonly T[];
  rowHeight: number;
  state: TableLocalState;
  selection: readonly string[];
  selectionMode: TableSelectionMode;
  keyboardNavigation: boolean;
}>;

/** Result of table key routing. */
export type TableRoutingResult = Readonly<{
  /** New focused row index. */
  nextFocusedRowIndex?: number;
  /** New scroll position. */
  nextScrollTop?: number;
  /** New selection. */
  nextSelection?: readonly string[];
  /** Last clicked key (for shift-select). */
  nextLastClickedKey?: string | null;
  /** Action to emit. */
  action?: { id: string; action: "rowPress"; rowIndex: number };
  /** Whether the event was consumed. */
  consumed: boolean;
}>;

/** Routing context for tree keyboard navigation. */
export type TreeRoutingCtx<T = unknown> = Readonly<{
  treeId: string;
  flatNodes: readonly FlattenedNode<T>[];
  expanded: readonly string[];
  state: TreeLocalState;
  keyboardNavigation: boolean;
}>;

/** Result of tree key routing. */
export type TreeRoutingResult = Readonly<{
  /** New focused node key. */
  nextFocusedKey?: string | null;
  /** New expanded set. */
  nextExpanded?: readonly string[];
  /** Node to select. */
  nodeToSelect?: string;
  /** Node to activate. */
  nodeToActivate?: string;
  /** Node that needs children loaded. */
  nodeToLoad?: string;
  /** New scroll position. */
  nextScrollTop?: number;
  /** Whether the event was consumed. */
  consumed: boolean;
}>;

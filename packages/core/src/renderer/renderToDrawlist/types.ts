import type { CursorShape } from "../../abi.js";
import type { DrawlistBuilderV1 } from "../../drawlist/types.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusState } from "../../runtime/focus.js";
import type { InstanceId } from "../../runtime/instance.js";
import type {
  TableStateStore,
  TreeStateStore,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import type { TerminalProfile } from "../../terminalProfile.js";
import type { Theme } from "../../theme/theme.js";
import type { CommandItem } from "../../widgets/types.js";

type LogsEntryMeta = Readonly<{
  timestamp: string;
  levelLabel: string;
  sourceLabel: string;
  metaSuffix: string;
  lowerMessage: string;
  lowerSource: string;
  lowerDetails: string | null;
}>;

/**
 * Cursor info for native cursor protocol integration.
 * Provides cursor offset per Input instance.
 */
export type CursorInfo = Readonly<{
  /** Cursor offset per Input instance ID */
  cursorByInstanceId: ReadonlyMap<InstanceId, number>;
  /** Default cursor shape for inputs */
  shape: CursorShape;
  /** Whether cursor should blink */
  blink: boolean;
}>;

export type TableRenderCache = Readonly<{
  rowKeys: readonly string[];
  selectionSet: ReadonlySet<string>;
}>;

export type LogsConsoleRenderCache = Readonly<{
  filtered: readonly import("../../widgets/types.js").LogsConsoleProps["entries"][number][];
  entryMetaById: ReadonlyMap<string, LogsEntryMeta>;
}>;

export type DiffRenderCache = Readonly<{
  numWidth: number;
  blankNum: string;
  headerByHunk: readonly string[];
  collapsedByHunk: readonly string[];
  formattedNums: Map<number, string>;
}>;

export type CodeEditorRenderCache = Readonly<{
  lineNumWidth: number;
  lineNums: readonly string[];
}>;

/** Parameters for rendering a committed tree to a drawlist. */
export type RenderToDrawlistParams = Readonly<{
  tree: RuntimeInstance;
  layout: LayoutTree;
  viewport: Readonly<{ cols: number; rows: number }>;
  focusState: FocusState;
  /** Optional currently pressed interactive widget id. */
  pressedId?: string | null | undefined;
  builder: DrawlistBuilderV1;
  /** Optional animation tick/frame index (used by spinners, etc.). */
  tick?: number | undefined;
  /** Optional app theme for themed widgets (e.g., divider). */
  theme?: Theme | undefined;
  /** Optional terminal profile for capability-gated widget rendering decisions. */
  terminalProfile?: TerminalProfile | undefined;
  /** Optional cursor info for native cursor support */
  cursorInfo?: CursorInfo | undefined;
  /** Optional virtual list state store for virtualList widgets */
  virtualListStore?: VirtualListStateStore | undefined;
  /** Optional table state store for table widgets */
  tableStore?: TableStateStore | undefined;
  /** Optional tree state store for tree widgets */
  treeStore?: TreeStateStore | undefined;
  /** Optional loaded-children cache for tree lazy loading (treeId -> nodeKey -> children). */
  loadedTreeChildrenById?: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>> | undefined;
  /** Optional resolved command palette items (per palette id). */
  commandPaletteItemsById?: ReadonlyMap<string, readonly CommandItem[]> | undefined;
  /** Optional command palette loading flags (per palette id). */
  commandPaletteLoadingById?: ReadonlyMap<string, boolean> | undefined;
  /** Optional ToolApprovalDialog focused action (per dialog id). */
  toolApprovalFocusedActionById?:
    | ReadonlyMap<string, "allow" | "deny" | "allowSession">
    | undefined;
  /** Optional Dropdown selected index (per dropdown id). */
  dropdownSelectedIndexById?: ReadonlyMap<string, number> | undefined;
  /** Optional DiffViewer focused hunk index (per viewer id). */
  diffViewerFocusedHunkById?: ReadonlyMap<string, number> | undefined;
  /** Optional DiffViewer expanded hunks (per viewer id). */
  diffViewerExpandedHunksById?: ReadonlyMap<string, ReadonlySet<number>> | undefined;
  /** Optional focus announcement text for `ui.focusAnnouncer()`. */
  focusAnnouncement?: string | null | undefined;
  /** Optional precomputed layout index (instanceId -> rect). */
  layoutIndex?: ReadonlyMap<InstanceId, Rect> | undefined;
  /** Optional precomputed id->rect index. */
  idRectIndex?: ReadonlyMap<string, Rect> | undefined;
  /** Optional animated rect overrides (instanceId -> rect). */
  animatedRectByInstanceId?: ReadonlyMap<InstanceId, Rect> | undefined;
  /** Optional animated opacity overrides (instanceId -> opacity in [0..1]). */
  animatedOpacityByInstanceId?: ReadonlyMap<InstanceId, number> | undefined;
  /** Optional table render caches (per table id). */
  tableRenderCacheById?: ReadonlyMap<string, TableRenderCache> | undefined;
  /** Optional logs console render caches (per console id). */
  logsConsoleRenderCacheById?: ReadonlyMap<string, LogsConsoleRenderCache> | undefined;
  /** Optional diff viewer render caches (per diff id). */
  diffRenderCacheById?: ReadonlyMap<string, DiffRenderCache> | undefined;
  /** Optional code editor render caches (per editor id). */
  codeEditorRenderCacheById?: ReadonlyMap<string, CodeEditorRenderCache> | undefined;
}>;

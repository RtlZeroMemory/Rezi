import type { ResponsiveViewportSnapshot } from "../../layout/responsive.js";
import type { Theme } from "../../theme/theme.js";
import type { ColorTokens } from "../../theme/tokens.js";
import type { ExitAnimationState, VNode } from "../../widgets/types.js";
import type { InstanceId, InstanceIdAllocator } from "../instance.js";
import type { CompositeInstanceRegistry, EffectCleanup, EffectState } from "../instances.js";
import type { RuntimeLocalStateStore } from "../localState.js";
import type { ReconcileFatal } from "../reconcile.js";
import type { RenderPacket } from "../renderPacket.js";

export type RuntimeInstance = {
  instanceId: InstanceId;
  vnode: VNode;
  children: readonly RuntimeInstance[];
  dirty: boolean;
  selfDirty: boolean;
  renderPacketKey: number;
  renderPacket: RenderPacket | null;
};

export const EMPTY_CHILDREN: readonly RuntimeInstance[] = Object.freeze([]);

export type CommitDiagEntry = {
  id: number;
  kind: string;
  reason: "leaf-reuse" | "fast-reuse" | "new-mount" | "new-instance";
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
  failingProp?: string | undefined;
  childDiffs?: number | undefined;
  prevChildren?: number | undefined;
  nextChildren?: number | undefined;
};

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

export type CommitOk = Readonly<{
  root: RuntimeInstance;
  mountedInstanceIds: readonly InstanceId[];
  reusedInstanceIds: readonly InstanceId[];
  unmountedInstanceIds: readonly InstanceId[];
  pendingExitAnimations: readonly PendingExitAnimation[];
  pendingCleanups: readonly EffectCleanup[];
  pendingEffects: readonly EffectState[];
}>;

export type CommitResult =
  | Readonly<{ ok: true; value: CommitOk }>
  | Readonly<{ ok: false; fatal: CommitFatal }>;

export type CommitNodeResult =
  | Readonly<{ ok: true; value: Readonly<{ root: RuntimeInstance }> }>
  | Readonly<{ ok: false; fatal: CommitFatal }>;

export type MutableLists = {
  mounted: InstanceId[];
  reused: InstanceId[];
  unmounted: InstanceId[];
};

export const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
export const DEV_MODE = NODE_ENV !== "production";
export const LAYOUT_DEPTH_WARN_THRESHOLD = 200;
export const MAX_LAYOUT_NESTING_DEPTH = 500;
export const MAX_LAYOUT_DEPTH_PATH_SEGMENTS = 32;
export const MAX_INTERACTIVE_ID_LENGTH = 256;
export const DEFAULT_EXIT_TRANSITION_DURATION_MS = 180;
export const LAYOUT_DEPTH_PATH_TRACK_START = Math.max(
  1,
  LAYOUT_DEPTH_WARN_THRESHOLD - MAX_LAYOUT_DEPTH_PATH_SEGMENTS + 2,
);

export type FocusContainerKind = "focusZone" | "focusTrap" | "modal";

export type CommitErrorBoundaryState = Readonly<{
  code: "ZRUI_USER_CODE_THROW";
  detail: string;
  message: string;
  stack?: string;
}>;

export type CompositeCommitRuntime = Readonly<{
  registry: CompositeInstanceRegistry;
  appState: unknown;
  colorTokens?: ColorTokens;
  theme?: Theme;
  getColorTokens?: (theme: Theme) => ColorTokens;
  viewport?: ResponsiveViewportSnapshot;
  onInvalidate: (instanceId: InstanceId) => void;
  onUseViewport?: () => void;
}>;

export type CommitErrorBoundaryController = Readonly<{
  errorsByPath: Map<string, CommitErrorBoundaryState>;
  retryRequestedPaths: Set<string>;
  activePaths: Set<string>;
  requestRetry: (path: string) => void;
}>;

export type CommitCtx = Readonly<{
  allocator: InstanceIdAllocator;
  localState: RuntimeLocalStateStore | undefined;
  seenInteractiveIds: Map<string, string>;
  seenFocusContainerIds: Map<string, FocusContainerKind>;
  prevNodeStack: Array<RuntimeInstance | null>;
  containerChildOverrides: Map<InstanceId, readonly VNode[]>;
  layoutDepthRef: { value: number };
  layoutPathTail: string[];
  emittedWarnings: Set<string>;
  lists: MutableLists;
  collectLifecycleInstanceIds: boolean;
  composite: CompositeCommitRuntime | null;
  compositeThemeStack: Theme[];
  compositeRenderStack: Array<Readonly<{ widgetKey: string; instanceId: InstanceId }>>;
  pendingExitAnimations: PendingExitAnimation[];
  pendingCleanups: EffectCleanup[];
  pendingEffects: EffectState[];
  errorBoundary: CommitErrorBoundaryController | null;
}>;

export type CommitNodeFn = (
  prev: RuntimeInstance | null,
  instanceId: InstanceId,
  vnode: VNode,
  ctx: CommitCtx,
  nodePath: string,
) => CommitNodeResult;

export type CommitContainerFn = (
  instanceId: InstanceId,
  vnode: VNode,
  prev: RuntimeInstance | null,
  ctx: CommitCtx,
  nodePath: string[],
  depth: number,
) => CommitNodeResult;

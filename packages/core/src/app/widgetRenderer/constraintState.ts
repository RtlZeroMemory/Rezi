import { isConstraintExpr } from "../../constraints/expr.js";
import type {
  ConstraintGraph,
  ConstraintGraphError,
  ConstraintNodeProp,
} from "../../constraints/graph.js";
import type { RefValuesInput, ResolvedConstraintValues } from "../../constraints/resolver.js";
import { measure } from "../../layout/layout.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { VNode } from "../../widgets/types.js";
import type { RuntimeBreadcrumbConstraintsSummary } from "../runtimeBreadcrumbs.js";

export const CONSTRAINT_NODE_PROPS: readonly ConstraintNodeProp[] = Object.freeze([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexBasis",
  "display",
]);

export type ConstraintExprIndex = ReadonlyMap<
  InstanceId,
  readonly Readonly<{ prop: string; source: string }>[]
>;

export type ConstraintResolutionSummary =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "reused" }>
  | Readonly<{ kind: "cacheHit" }>
  | Readonly<{ kind: "computed" }>;

export type ConstraintInputChangeParams = Readonly<{
  graph: ConstraintGraph;
  viewport: Readonly<{ cols: number; rows: number }>;
  rootW: number;
  rootH: number;
  pooledConstraintBaseValues: ReadonlyMap<InstanceId, ResolvedConstraintValues>;
  pooledConstraintParentValues: ReadonlyMap<InstanceId, RefValuesInput>;
  pooledConstraintIntrinsicValues: ReadonlyMap<InstanceId, RefValuesInput>;
  signature: number[];
  valid: boolean;
}>;

export type ConstraintResolutionInputsParams = Readonly<{
  root: RuntimeInstance;
  graph: ConstraintGraph;
  rootW: number;
  rootH: number;
  pooledConstraintBaseValues: Map<InstanceId, ResolvedConstraintValues>;
  pooledConstraintParentValues: Map<InstanceId, RefValuesInput>;
  pooledConstraintIntrinsicValues: Map<InstanceId, RefValuesInput>;
  pooledConstraintParentByInstanceId: Map<InstanceId, InstanceId | null>;
  pooledRectByInstanceId: ReadonlyMap<InstanceId, { w: number; h: number }>;
  pooledConstraintRuntimeStack: RuntimeInstance[];
  pooledConstraintParentStack: Array<InstanceId | null>;
  pooledConstraintAxisStack: Array<"row" | "column">;
}>;

export type ConstraintHiddenStateResult = Readonly<{
  hiddenConstraintInstanceIds: ReadonlySet<InstanceId>;
  hiddenConstraintWidgetIds: ReadonlySet<string>;
}>;

export type ConstraintAffectedPathResult = Readonly<{
  constraintAffectedPathInstanceIds: ReadonlySet<InstanceId>;
  constraintNodesWithAffectedDescendants: ReadonlySet<InstanceId>;
}>;

export type ComputeConstraintBreadcrumbsParams = Readonly<{
  graph: ConstraintGraph | null;
  exprIndexByInstanceId: ConstraintExprIndex | null;
  rebuildConstraintExprIndex: (graph: ConstraintGraph) => ConstraintExprIndex;
  focusedId: string | null;
  resolvedByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null;
  hiddenConstraintInstanceIds: ReadonlySet<InstanceId>;
  lastCacheKey: string | null;
  lastResolution: ConstraintResolutionSummary;
  emptyConstraintBreadcrumbs: RuntimeBreadcrumbConstraintsSummary;
  emptyInstanceIds: readonly InstanceId[];
}>;

type ApplyConstraintOverridesParams = Readonly<{
  runtimeNode: RuntimeInstance;
  valuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null;
  hiddenInstanceIds: ReadonlySet<InstanceId>;
  affectedPathInstanceIds: ReadonlySet<InstanceId>;
  constraintNodesWithAffectedDescendants: ReadonlySet<InstanceId>;
}>;

export function describeConstraintGraphFatal(fatal: ConstraintGraphError): string {
  if (fatal.code === "ZRUI_CIRCULAR_CONSTRAINT") {
    return `Circular constraint dependency: ${fatal.cycle.join(" -> ")}`;
  }
  return fatal.detail;
}

function readWidgetIdFromRuntimeNode(node: RuntimeInstance): string | null {
  const id = (node.vnode.props as Readonly<{ id?: unknown }> | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function hasConstraintSourceDiff(node: RuntimeInstance, graph: ConstraintGraph): boolean {
  const props = (node.vnode.props ?? {}) as Readonly<Record<string, unknown>>;
  for (const prop of CONSTRAINT_NODE_PROPS) {
    const prev = graph.nodeByKey.get(`${String(node.instanceId)}:${prop}`);
    const prevSource = prev?.expr.source ?? null;
    const nextRaw = props[prop];
    const nextSource = isConstraintExpr(nextRaw) ? nextRaw.source : null;
    if (prevSource !== nextSource) return true;
  }
  return false;
}

function hasRuntimeConstraintExpr(node: RuntimeInstance): boolean {
  const props = node.vnode.props as Readonly<Record<string, unknown>> | null | undefined;
  if (props === undefined || props === null) return false;
  for (const prop of CONSTRAINT_NODE_PROPS) {
    if (isConstraintExpr(props[prop])) return true;
  }
  return false;
}

function resolveConstraintChildAxis(
  node: RuntimeInstance,
  parentAxis: "row" | "column",
): "row" | "column" {
  switch (node.vnode.kind) {
    case "row":
      return "row";
    case "column":
    case "box":
      return "column";
    default:
      return parentAxis;
  }
}

function measureConstraintIntrinsicValues(
  node: RuntimeInstance,
  parentW: number,
  parentH: number,
  axis: "row" | "column",
): RefValuesInput | null {
  const measured = measure(node.vnode, parentW, parentH, axis);
  if (!measured.ok) return null;
  const w = Math.max(0, Math.floor(measured.value.w));
  const h = Math.max(0, Math.floor(measured.value.h));
  return {
    w,
    h,
    min_w: w,
    min_h: h,
  };
}

export function shouldRebuildConstraintGraph(
  root: RuntimeInstance,
  prevGraph: ConstraintGraph,
  removedInstanceIds: readonly InstanceId[],
  pooledConstraintRuntimeStack: RuntimeInstance[],
): boolean {
  if (removedInstanceIds.length > 0) {
    for (const instanceId of removedInstanceIds) {
      if (
        prevGraph.constrainedInstanceIds.has(instanceId) ||
        prevGraph.instanceIdToWidgetId.has(instanceId)
      ) {
        return true;
      }
    }
  }

  pooledConstraintRuntimeStack.length = 0;
  pooledConstraintRuntimeStack.push(root);
  while (pooledConstraintRuntimeStack.length > 0) {
    const node = pooledConstraintRuntimeStack.pop();
    if (!node) continue;
    if (!node.dirty) continue;

    if (node.selfDirty) {
      const prevWidgetId = prevGraph.instanceIdToWidgetId.get(node.instanceId) ?? null;
      const nextWidgetId = readWidgetIdFromRuntimeNode(node);
      if (prevWidgetId !== nextWidgetId) {
        return true;
      }
      const hadConstraintExpr = prevGraph.constrainedInstanceIds.has(node.instanceId);
      if (
        (hadConstraintExpr || hasRuntimeConstraintExpr(node)) &&
        hasConstraintSourceDiff(node, prevGraph)
      ) {
        return true;
      }
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (!child) continue;
      if (!child.dirty) continue;
      pooledConstraintRuntimeStack.push(child);
    }
  }
  return false;
}

export function buildConstraintResolutionInputs(
  params: ConstraintResolutionInputsParams,
): Readonly<{ hasStaticHiddenDisplay: boolean }> {
  params.pooledConstraintBaseValues.clear();
  params.pooledConstraintParentValues.clear();
  params.pooledConstraintIntrinsicValues.clear();
  params.pooledConstraintParentByInstanceId.clear();
  params.pooledConstraintRuntimeStack.length = 0;
  params.pooledConstraintParentStack.length = 0;
  params.pooledConstraintAxisStack.length = 0;
  let hasStaticHiddenDisplay = false;
  const requiredInstanceIds = params.graph.requiredRuntimeInstanceIds;
  const intrinsicInstanceIds = params.graph.intrinsicRuntimeInstanceIds;
  let remainingRequiredInstanceCount = requiredInstanceIds.size;

  params.pooledConstraintRuntimeStack.push(params.root);
  params.pooledConstraintParentStack.push(null);
  params.pooledConstraintAxisStack.push("column");
  let head = 0;
  while (head < params.pooledConstraintRuntimeStack.length) {
    const node = params.pooledConstraintRuntimeStack[head];
    const parentInstanceId = params.pooledConstraintParentStack[head] ?? null;
    const axis = params.pooledConstraintAxisStack[head] ?? "column";
    head++;
    if (!node) continue;
    params.pooledConstraintParentByInstanceId.set(node.instanceId, parentInstanceId);

    const needsNodeData = requiredInstanceIds.has(node.instanceId);
    if (needsNodeData) {
      remainingRequiredInstanceCount--;
      const parentRect =
        parentInstanceId === null ? null : params.pooledRectByInstanceId.get(parentInstanceId);
      const parentW = parentRect?.w ?? params.rootW;
      const parentH = parentRect?.h ?? params.rootH;
      const displayRaw = (node.vnode.props as Readonly<{ display?: unknown }> | undefined)?.display;
      if (displayRaw === false) hasStaticHiddenDisplay = true;
      const staticDisplay = displayRaw === false ? 0 : displayRaw === true ? 1 : undefined;

      if (params.graph.constrainedInstanceIds.has(node.instanceId)) {
        params.pooledConstraintParentValues.set(node.instanceId, {
          w: parentW,
          h: parentH,
          min_w: parentW,
          min_h: parentH,
        });
      }

      const rect = params.pooledRectByInstanceId.get(node.instanceId);
      if (rect) {
        const base: {
          width: number;
          height: number;
          minWidth: number;
          minHeight: number;
          display?: number;
        } = {
          width: rect.w,
          height: rect.h,
          minWidth: rect.w,
          minHeight: rect.h,
        };
        if (staticDisplay !== undefined) {
          base.display = staticDisplay;
        }
        params.pooledConstraintBaseValues.set(node.instanceId, {
          ...base,
        });
      } else if (staticDisplay !== undefined) {
        params.pooledConstraintBaseValues.set(node.instanceId, {
          display: staticDisplay,
        });
      }
      if (intrinsicInstanceIds.has(node.instanceId)) {
        const intrinsicValues = measureConstraintIntrinsicValues(node, parentW, parentH, axis);
        if (intrinsicValues !== null) {
          params.pooledConstraintIntrinsicValues.set(node.instanceId, intrinsicValues);
        }
      }
    }

    if (remainingRequiredInstanceCount === 0) break;
    const childAxis = resolveConstraintChildAxis(node, axis);
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      params.pooledConstraintRuntimeStack.push(child);
      params.pooledConstraintParentStack.push(node.instanceId);
      params.pooledConstraintAxisStack.push(childAxis);
    }
  }
  params.pooledConstraintRuntimeStack.length = 0;
  params.pooledConstraintParentStack.length = 0;
  params.pooledConstraintAxisStack.length = 0;

  return Object.freeze({ hasStaticHiddenDisplay });
}

export function rebuildConstraintHiddenState(
  root: RuntimeInstance,
  valuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null,
  pooledConstraintRuntimeStack: RuntimeInstance[],
  pooledConstraintVisibilityStack: boolean[],
  pooledHiddenConstraintInstanceIds: Set<InstanceId>,
  pooledHiddenConstraintWidgetIds: Set<string>,
): ConstraintHiddenStateResult {
  pooledHiddenConstraintInstanceIds.clear();
  pooledHiddenConstraintWidgetIds.clear();
  pooledConstraintRuntimeStack.length = 0;
  pooledConstraintVisibilityStack.length = 0;
  pooledConstraintRuntimeStack.push(root);
  pooledConstraintVisibilityStack.push(false);

  while (pooledConstraintRuntimeStack.length > 0) {
    const node = pooledConstraintRuntimeStack.pop();
    const parentHidden = pooledConstraintVisibilityStack.pop() ?? false;
    if (!node) continue;

    const props = (node.vnode.props ?? {}) as Readonly<{
      id?: unknown;
      display?: unknown;
    }>;
    const displayResolved = valuesByInstanceId?.get(node.instanceId)?.display;
    const hiddenByResolved =
      typeof displayResolved === "number" && Number.isFinite(displayResolved)
        ? displayResolved <= 0
        : false;
    const hiddenByStatic = props.display === false;
    const hidden = parentHidden || hiddenByResolved || hiddenByStatic;

    if (hidden) {
      pooledHiddenConstraintInstanceIds.add(node.instanceId);
      const id = props.id;
      if (typeof id === "string" && id.length > 0) {
        pooledHiddenConstraintWidgetIds.add(id);
      }
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (!child) continue;
      pooledConstraintRuntimeStack.push(child);
      pooledConstraintVisibilityStack.push(hidden);
    }
  }

  return Object.freeze({
    hiddenConstraintInstanceIds: pooledHiddenConstraintInstanceIds,
    hiddenConstraintWidgetIds: pooledHiddenConstraintWidgetIds,
  });
}

export function rebuildConstraintAffectedPathSet(
  graph: ConstraintGraph,
  hiddenInstanceIds: ReadonlySet<InstanceId>,
  pooledConstraintAffectedPathInstanceIds: Set<InstanceId>,
  pooledConstraintNodesWithAffectedDescendants: Set<InstanceId>,
  pooledConstraintParentByInstanceId: ReadonlyMap<InstanceId, InstanceId | null>,
): ConstraintAffectedPathResult {
  pooledConstraintAffectedPathInstanceIds.clear();
  pooledConstraintNodesWithAffectedDescendants.clear();

  const addWithAncestors = (instanceId: InstanceId): void => {
    let cursor: InstanceId | null = instanceId;
    while (cursor !== null) {
      pooledConstraintAffectedPathInstanceIds.add(cursor);
      const parentInstanceId: InstanceId | null =
        pooledConstraintParentByInstanceId.get(cursor) ?? null;
      if (parentInstanceId !== null) {
        pooledConstraintNodesWithAffectedDescendants.add(parentInstanceId);
      }
      cursor = parentInstanceId;
    }
  };

  for (const node of graph.nodes) {
    addWithAncestors(node.instanceId);
  }
  for (const instanceId of hiddenInstanceIds) {
    addWithAncestors(instanceId);
  }

  return Object.freeze({
    constraintAffectedPathInstanceIds: pooledConstraintAffectedPathInstanceIds,
    constraintNodesWithAffectedDescendants: pooledConstraintNodesWithAffectedDescendants,
  });
}

export function hasConstraintInputSignatureChange(
  params: ConstraintInputChangeParams,
): Readonly<{ changed: boolean; valid: boolean }> {
  const signature = params.signature;
  let index = 0;
  let changed = !params.valid;
  const write = (value: number): void => {
    if (!changed && !Object.is(signature[index], value)) changed = true;
    signature[index] = value;
    index++;
  };
  const writeOrNaN = (value: number | undefined): void => {
    write(value === undefined ? Number.NaN : value);
  };

  write(params.graph.fingerprint);
  write(params.viewport.cols);
  write(params.viewport.rows);
  write(params.rootW);
  write(params.rootH);

  for (const instanceId of params.graph.requiredRuntimeInstanceIds) {
    const base = params.pooledConstraintBaseValues.get(instanceId);
    const parent = params.pooledConstraintParentValues.get(instanceId);
    const intrinsic = params.pooledConstraintIntrinsicValues.get(instanceId);
    write(instanceId);
    writeOrNaN(base?.width);
    writeOrNaN(base?.height);
    writeOrNaN(base?.minWidth);
    writeOrNaN(base?.minHeight);
    writeOrNaN(base?.display);
    writeOrNaN(parent?.w);
    writeOrNaN(parent?.h);
    writeOrNaN(parent?.min_w);
    writeOrNaN(parent?.min_h);
    writeOrNaN(intrinsic?.w);
    writeOrNaN(intrinsic?.h);
    writeOrNaN(intrinsic?.min_w);
    writeOrNaN(intrinsic?.min_h);
  }

  if (!changed && signature.length !== index) changed = true;
  signature.length = index;

  return Object.freeze({ changed, valid: true });
}

export function computeConstraintInputKey(
  graph: ConstraintGraph,
  viewport: Readonly<{ cols: number; rows: number }>,
  rootW: number,
  rootH: number,
  pooledConstraintBaseValues: ReadonlyMap<InstanceId, ResolvedConstraintValues>,
  pooledConstraintParentValues: ReadonlyMap<InstanceId, RefValuesInput>,
  pooledConstraintIntrinsicValues: ReadonlyMap<InstanceId, RefValuesInput>,
): string {
  const parts: string[] = [
    String(graph.fingerprint),
    String(viewport.cols),
    String(viewport.rows),
    String(rootW),
    String(rootH),
  ];

  for (const instanceId of graph.requiredRuntimeInstanceIds) {
    const base = pooledConstraintBaseValues.get(instanceId);
    const parent = pooledConstraintParentValues.get(instanceId);
    const intrinsic = pooledConstraintIntrinsicValues.get(instanceId);
    parts.push(
      String(instanceId),
      String(base?.width ?? "u"),
      String(base?.height ?? "u"),
      String(base?.minWidth ?? "u"),
      String(base?.minHeight ?? "u"),
      String(base?.display ?? "u"),
      String(parent?.w ?? rootW),
      String(parent?.h ?? rootH),
      String(parent?.min_w ?? rootW),
      String(parent?.min_h ?? rootH),
      String(intrinsic?.w ?? "u"),
      String(intrinsic?.h ?? "u"),
      String(intrinsic?.min_w ?? "u"),
      String(intrinsic?.min_h ?? "u"),
    );
  }

  return parts.join("|");
}

export function rebuildConstraintExprIndex(graph: ConstraintGraph): ConstraintExprIndex {
  const mutable = new Map<InstanceId, Array<Readonly<{ prop: string; source: string }>>>();
  for (const node of graph.nodes) {
    const entry = Object.freeze({ prop: node.prop, source: node.expr.source });
    const bucket = mutable.get(node.instanceId);
    if (bucket) bucket.push(entry);
    else mutable.set(node.instanceId, [entry]);
  }

  const frozen = new Map<InstanceId, readonly Readonly<{ prop: string; source: string }>[]>();
  for (const [instanceId, list] of mutable.entries()) {
    frozen.set(instanceId, Object.freeze(list.slice()));
  }
  return frozen;
}

export function computeConstraintBreadcrumbs(
  params: ComputeConstraintBreadcrumbsParams,
): RuntimeBreadcrumbConstraintsSummary {
  const graph = params.graph;
  if (graph === null || graph.nodes.length === 0) return params.emptyConstraintBreadcrumbs;

  const exprIndexByInstanceId =
    params.exprIndexByInstanceId ?? params.rebuildConstraintExprIndex(graph);
  const hiddenInstanceCount = params.hiddenConstraintInstanceIds.size;

  let focused: RuntimeBreadcrumbConstraintsSummary["focused"] = null;
  if (params.focusedId) {
    const instances = graph.idToInstances.get(params.focusedId) ?? params.emptyInstanceIds;
    const instanceCount = instances.length;
    const instanceId = instances[0] ?? null;
    const resolved =
      instanceId !== null ? (params.resolvedByInstanceId?.get(instanceId) ?? null) : null;
    const expressions =
      instanceId !== null ? (exprIndexByInstanceId.get(instanceId) ?? null) : null;

    focused = Object.freeze({
      id: params.focusedId,
      instanceCount,
      instanceId,
      resolved: resolved
        ? (() => {
            const out: {
              display?: number;
              width?: number;
              height?: number;
              minWidth?: number;
              maxWidth?: number;
              minHeight?: number;
              maxHeight?: number;
              flexBasis?: number;
            } = {};
            if (typeof resolved.display === "number" && Number.isFinite(resolved.display))
              out.display = resolved.display;
            if (typeof resolved.width === "number" && Number.isFinite(resolved.width))
              out.width = resolved.width;
            if (typeof resolved.height === "number" && Number.isFinite(resolved.height))
              out.height = resolved.height;
            if (typeof resolved.minWidth === "number" && Number.isFinite(resolved.minWidth))
              out.minWidth = resolved.minWidth;
            if (typeof resolved.maxWidth === "number" && Number.isFinite(resolved.maxWidth))
              out.maxWidth = resolved.maxWidth;
            if (typeof resolved.minHeight === "number" && Number.isFinite(resolved.minHeight))
              out.minHeight = resolved.minHeight;
            if (typeof resolved.maxHeight === "number" && Number.isFinite(resolved.maxHeight))
              out.maxHeight = resolved.maxHeight;
            if (typeof resolved.flexBasis === "number" && Number.isFinite(resolved.flexBasis))
              out.flexBasis = resolved.flexBasis;
            return Object.freeze(out);
          })()
        : null,
      expressions,
    });
  }

  return Object.freeze({
    enabled: true,
    graphFingerprint: graph.fingerprint,
    nodeCount: graph.nodes.length,
    cacheKey: params.lastCacheKey,
    resolution: params.lastResolution,
    hiddenInstanceCount,
    focused,
  });
}

function isVNodeLike(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "kind" in v;
}

export function applyConstraintOverridesToVNode(params: ApplyConstraintOverridesParams): VNode {
  const vnode = params.runtimeNode.vnode;
  type MutableConstraintOverrideProps = Record<string, unknown> & {
    display?: boolean;
    width?: number;
    height?: number;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    flex?: number;
    flexBasis?: number;
    content?: unknown;
    actions?: unknown;
  };

  const propsRecord = (vnode.props ?? {}) as Readonly<MutableConstraintOverrideProps>;
  const resolved = params.valuesByInstanceId?.get(params.runtimeNode.instanceId);
  const isHidden = params.hiddenInstanceIds.has(params.runtimeNode.instanceId);
  const shouldTraverseChildren = params.constraintNodesWithAffectedDescendants.has(
    params.runtimeNode.instanceId,
  );
  let propsChanged = false;
  let nextProps = vnode.props;

  let nextPropsMutable: MutableConstraintOverrideProps | null = null;
  const ensureMutableProps = (): MutableConstraintOverrideProps => {
    if (nextPropsMutable === null)
      nextPropsMutable = { ...propsRecord } as MutableConstraintOverrideProps;
    return nextPropsMutable;
  };

  if (resolved) {
    const write = (name: Exclude<keyof ResolvedConstraintValues, "display">): void => {
      const raw = resolved[name];
      if (raw === undefined || !Number.isFinite(raw)) return;
      const nextValue = Math.floor(raw);
      if (propsRecord[name] === nextValue) return;
      ensureMutableProps()[name] = nextValue;
    };

    write("width");
    write("height");
    write("minWidth");
    write("maxWidth");
    write("minHeight");
    write("maxHeight");
    write("flexBasis");

    if (typeof resolved.display === "number" && Number.isFinite(resolved.display)) {
      const displayVisible = resolved.display > 0;
      if (propsRecord.display !== displayVisible) {
        ensureMutableProps().display = displayVisible;
      }
    }
  }

  if (isHidden) {
    const mutable = ensureMutableProps();
    mutable.display = false;
    mutable.width = 0;
    mutable.height = 0;
    mutable.minWidth = 0;
    mutable.maxWidth = 0;
    mutable.minHeight = 0;
    mutable.maxHeight = 0;
    mutable.flex = 0;
    mutable.flexBasis = 0;
  }

  const currentChildren = (vnode as Readonly<{ children?: readonly VNode[] }>).children;
  let childrenChanged = false;
  let nextChildren = currentChildren;
  if (Array.isArray(currentChildren) && currentChildren.length > 0 && shouldTraverseChildren) {
    let rebuiltChildren: VNode[] | null = null;
    for (let i = 0; i < currentChildren.length; i++) {
      const childVNode = currentChildren[i] as VNode;
      const runtimeChild = params.runtimeNode.children[i];
      if (
        !runtimeChild ||
        !childVNode ||
        !params.affectedPathInstanceIds.has(runtimeChild.instanceId)
      ) {
        if (rebuiltChildren !== null) rebuiltChildren[i] = childVNode;
        continue;
      }
      const nextChild = applyConstraintOverridesToVNode({
        runtimeNode: runtimeChild,
        valuesByInstanceId: params.valuesByInstanceId,
        hiddenInstanceIds: params.hiddenInstanceIds,
        affectedPathInstanceIds: params.affectedPathInstanceIds,
        constraintNodesWithAffectedDescendants: params.constraintNodesWithAffectedDescendants,
      });
      if (nextChild !== childVNode) {
        if (rebuiltChildren === null) {
          rebuiltChildren = currentChildren.slice() as VNode[];
        }
        rebuiltChildren[i] = nextChild;
        childrenChanged = true;
      } else if (rebuiltChildren !== null) {
        rebuiltChildren[i] = childVNode;
      }
    }
    if (rebuiltChildren !== null && childrenChanged) {
      nextChildren = Object.freeze(rebuiltChildren);
    }
  }

  if (shouldTraverseChildren && vnode.kind === "layer") {
    const content = (propsRecord as Readonly<{ content?: unknown }>).content;
    const runtimeChild = params.runtimeNode.children[0];
    if (
      runtimeChild &&
      isVNodeLike(content) &&
      params.affectedPathInstanceIds.has(runtimeChild.instanceId)
    ) {
      const nextContent = applyConstraintOverridesToVNode({
        runtimeNode: runtimeChild,
        valuesByInstanceId: params.valuesByInstanceId,
        hiddenInstanceIds: params.hiddenInstanceIds,
        affectedPathInstanceIds: params.affectedPathInstanceIds,
        constraintNodesWithAffectedDescendants: params.constraintNodesWithAffectedDescendants,
      });
      if (nextContent !== content) {
        ensureMutableProps().content = nextContent;
      }
    }
  } else if (shouldTraverseChildren && vnode.kind === "modal") {
    const modalProps = propsRecord as Readonly<{ content?: unknown; actions?: unknown }>;
    let runtimeChildIndex = 0;

    const content = modalProps.content;
    if (isVNodeLike(content)) {
      const runtimeChild = params.runtimeNode.children[runtimeChildIndex];
      runtimeChildIndex++;
      if (runtimeChild && params.affectedPathInstanceIds.has(runtimeChild.instanceId)) {
        const nextContent = applyConstraintOverridesToVNode({
          runtimeNode: runtimeChild,
          valuesByInstanceId: params.valuesByInstanceId,
          hiddenInstanceIds: params.hiddenInstanceIds,
          affectedPathInstanceIds: params.affectedPathInstanceIds,
          constraintNodesWithAffectedDescendants: params.constraintNodesWithAffectedDescendants,
        });
        if (nextContent !== content) {
          ensureMutableProps().content = nextContent;
        }
      }
    }

    const actionsRaw = modalProps.actions;
    if (Array.isArray(actionsRaw) && actionsRaw.length > 0) {
      let nextActions: unknown[] | null = null;
      for (let i = 0; i < actionsRaw.length; i++) {
        const action = actionsRaw[i];
        if (!isVNodeLike(action)) {
          if (nextActions !== null) nextActions[i] = action;
          continue;
        }
        const runtimeChild = params.runtimeNode.children[runtimeChildIndex];
        runtimeChildIndex++;
        if (!runtimeChild || !params.affectedPathInstanceIds.has(runtimeChild.instanceId)) {
          if (nextActions !== null) nextActions[i] = action;
          continue;
        }
        const nextAction = applyConstraintOverridesToVNode({
          runtimeNode: runtimeChild,
          valuesByInstanceId: params.valuesByInstanceId,
          hiddenInstanceIds: params.hiddenInstanceIds,
          affectedPathInstanceIds: params.affectedPathInstanceIds,
          constraintNodesWithAffectedDescendants: params.constraintNodesWithAffectedDescendants,
        });
        if (nextAction !== action) {
          if (nextActions === null) nextActions = actionsRaw.slice();
          nextActions[i] = nextAction;
        } else if (nextActions !== null) {
          nextActions[i] = action;
        }
      }
      if (nextActions !== null) {
        ensureMutableProps().actions = Object.freeze(nextActions);
      }
    }
  }

  if (nextPropsMutable !== null) {
    nextProps = Object.freeze(nextPropsMutable) as typeof vnode.props;
    propsChanged = true;
  }

  if (!propsChanged && !childrenChanged) return vnode;
  return Object.freeze({
    ...vnode,
    ...(propsChanged ? { props: nextProps } : {}),
    ...(childrenChanged ? { children: nextChildren } : {}),
  }) as VNode;
}

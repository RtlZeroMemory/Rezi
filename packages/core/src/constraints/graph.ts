/**
 * packages/core/src/constraints/graph.ts — Constraint dependency graph builder.
 *
 * Why: Builds and validates expression dependencies before evaluation.
 */

import type { RuntimeInstance } from "../runtime/commit.js";
import type { InstanceId } from "../runtime/instance.js";
import { isConstraintExpr } from "./expr.js";
import { collectWidgetRefUsages, findUnknownFunctionName } from "./parser.js";
import type { ConstraintExpr, RefProp } from "./types.js";

export type ConstraintNodeProp =
  | "width"
  | "height"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
  | "flexBasis"
  | "display";

export type ConstraintNode = Readonly<{
  key: string;
  instanceId: InstanceId;
  parentInstanceId: InstanceId | null;
  widgetId: string | null;
  prop: ConstraintNodeProp;
  expr: ConstraintExpr;
}>;

export type CycleError = Readonly<{
  code: "ZRUI_CIRCULAR_CONSTRAINT";
  cycle: readonly string[];
}>;

export type InvalidConstraintError = Readonly<{
  code: "ZRUI_INVALID_CONSTRAINT";
  detail: string;
}>;

export type ConstraintGraphError = CycleError | InvalidConstraintError;

export type ConstraintGraph = Readonly<{
  nodes: readonly ConstraintNode[];
  edges: ReadonlyMap<string, readonly string[]>;
  order: readonly ConstraintNode[];
  fingerprint: number;
  requiresCommitRelayout: boolean;
  hasDisplayConstraints: boolean;
  constrainedInstanceIds: ReadonlySet<InstanceId>;
  requiredRuntimeInstanceIds: ReadonlySet<InstanceId>;
  intrinsicRuntimeInstanceIds: ReadonlySet<InstanceId>;
  nodeByKey: ReadonlyMap<string, ConstraintNode>;
  idToInstances: ReadonlyMap<string, readonly InstanceId[]>;
  instanceIdToWidgetId: ReadonlyMap<InstanceId, string>;
}>;

export type ConstraintGraphResult =
  | Readonly<{ ok: true; value: ConstraintGraph }>
  | Readonly<{ ok: false; fatal: ConstraintGraphError }>;

export type TopologicalSortResult =
  | Readonly<{ ok: true; value: readonly ConstraintNode[] }>
  | Readonly<{ ok: false; fatal: CycleError }>;

const CONSTRAINT_PROPS: readonly ConstraintNodeProp[] = Object.freeze([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexBasis",
  "display",
]);

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const EMPTY_KEYS: readonly string[] = Object.freeze([]);

function invalid(detail: string): Readonly<{ ok: false; fatal: InvalidConstraintError }> {
  return { ok: false, fatal: { code: "ZRUI_INVALID_CONSTRAINT", detail } };
}

function hashU32(hash: number, value: number): number {
  return Math.imul((hash ^ (value >>> 0)) >>> 0, FNV_PRIME) >>> 0;
}

function hashString(hash: number, value: string): number {
  let out = hashU32(hash, value.length);
  for (let i = 0; i < value.length; i++) {
    out = hashU32(out, value.charCodeAt(i));
  }
  return out;
}

function readWidgetId(node: RuntimeInstance): string | null {
  const props = node.vnode.props as Readonly<{ id?: unknown }> | undefined;
  const id = props?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function makeNodeKey(instanceId: InstanceId, prop: ConstraintNodeProp): string {
  return `${String(instanceId)}:${prop}`;
}

function makeInstancePropKey(instanceId: InstanceId, prop: ConstraintNodeProp): string {
  return `${String(instanceId)}:${prop}`;
}

function maybeAddDisplayDependency(
  instanceId: InstanceId,
  currentNodeKey: string,
  deps: Set<string>,
  instancePropToNodeKey: ReadonlyMap<string, string>,
): void {
  const displayKey = instancePropToNodeKey.get(makeInstancePropKey(instanceId, "display"));
  if (displayKey !== undefined && displayKey !== currentNodeKey) deps.add(displayKey);
}

function refPropToConstraintProp(prop: RefProp): ConstraintNodeProp {
  switch (prop) {
    case "w":
      return "width";
    case "h":
      return "height";
    case "min_w":
      return "minWidth";
    case "min_h":
      return "minHeight";
    default:
      return "width";
  }
}

function propLabel(prop: ConstraintNodeProp): string {
  return prop;
}

function labelNode(node: ConstraintNode): string {
  const prop = propLabel(node.prop);
  if (node.widgetId !== null) return `#${node.widgetId}.${prop}`;
  return `#${String(node.instanceId)}.${prop}`;
}

function findCyclePath(
  remaining: ReadonlySet<string>,
  edges: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const visitingStack: string[] = [];
  const visitingIndex = new Map<string, number>();
  const visited = new Set<string>();

  const visit = (key: string): readonly string[] | null => {
    visited.add(key);
    visitingIndex.set(key, visitingStack.length);
    visitingStack.push(key);

    const deps = edges.get(key) ?? EMPTY_KEYS;
    for (const dep of deps) {
      if (!remaining.has(dep)) continue;
      const loopIndex = visitingIndex.get(dep);
      if (loopIndex !== undefined) {
        const cycle = visitingStack.slice(loopIndex);
        cycle.push(dep);
        return cycle;
      }
      if (!visited.has(dep)) {
        const nested = visit(dep);
        if (nested !== null) return nested;
      }
    }

    visitingStack.pop();
    visitingIndex.delete(key);
    return null;
  };

  for (const key of remaining) {
    if (visited.has(key)) continue;
    const cycle = visit(key);
    if (cycle !== null) return cycle;
  }

  return EMPTY_KEYS;
}

function computeFingerprint(nodes: readonly ConstraintNode[]): number {
  let hash = FNV_OFFSET;
  for (const node of nodes) {
    hash = hashU32(hash, node.instanceId);
    hash = hashString(hash, node.prop);
    hash = hashString(hash, node.expr.source);
  }
  return hash >>> 0;
}

export function topologicalSort(
  graph: Readonly<{
    nodes: readonly ConstraintNode[];
    edges: ReadonlyMap<string, readonly string[]>;
    nodeByKey: ReadonlyMap<string, ConstraintNode>;
  }>,
): TopologicalSortResult {
  if (graph.nodes.length === 0) {
    return { ok: true, value: Object.freeze([]) };
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of graph.nodes) {
    const deps = graph.edges.get(node.key) ?? EMPTY_KEYS;
    inDegree.set(node.key, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep);
      if (list === undefined) {
        dependents.set(dep, [node.key]);
      } else {
        list.push(node.key);
      }
    }
  }

  const queue: string[] = [];
  for (const node of graph.nodes) {
    if ((inDegree.get(node.key) ?? 0) === 0) queue.push(node.key);
  }

  const orderedKeys: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const key = queue[head];
    head++;
    if (key === undefined) continue;
    orderedKeys.push(key);
    const nextNodes = dependents.get(key) ?? [];
    for (const next of nextNodes) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (orderedKeys.length !== graph.nodes.length) {
    const remaining = new Set<string>();
    for (const node of graph.nodes) {
      if ((inDegree.get(node.key) ?? 0) > 0) remaining.add(node.key);
    }
    const cycleKeys = findCyclePath(remaining, graph.edges);
    const cycle = cycleKeys.map((key) => {
      const node = graph.nodeByKey.get(key);
      return node === undefined ? key : labelNode(node);
    });
    return {
      ok: false,
      fatal: {
        code: "ZRUI_CIRCULAR_CONSTRAINT",
        cycle: Object.freeze(cycle),
      },
    };
  }

  const order: ConstraintNode[] = [];
  for (const key of orderedKeys) {
    const node = graph.nodeByKey.get(key);
    if (node !== undefined) order.push(node);
  }
  return { ok: true, value: Object.freeze(order) };
}

export function buildConstraintGraph(root: RuntimeInstance): ConstraintGraphResult {
  const collected: ConstraintNode[] = [];
  const idToInstancesMutable = new Map<string, InstanceId[]>();
  const instanceIdToWidgetIdMutable = new Map<InstanceId, string>();
  let requiresCommitRelayout = false;
  let hasDisplayConstraints = false;

  const stack: Array<Readonly<{ node: RuntimeInstance; parent: InstanceId | null }>> = [
    { node: root, parent: null },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const { node, parent } = frame;
    const widgetId = readWidgetId(node);
    if (widgetId !== null) {
      instanceIdToWidgetIdMutable.set(node.instanceId, widgetId);
      const group = idToInstancesMutable.get(widgetId);
      if (group === undefined) {
        idToInstancesMutable.set(widgetId, [node.instanceId]);
      } else {
        group.push(node.instanceId);
      }
    }

    const props = (node.vnode.props ?? {}) as Readonly<Record<string, unknown>>;
    for (const prop of CONSTRAINT_PROPS) {
      const candidate = props[prop];
      if (!isConstraintExpr(candidate)) continue;
      collected.push({
        key: makeNodeKey(node.instanceId, prop),
        instanceId: node.instanceId,
        parentInstanceId: parent,
        widgetId,
        prop,
        expr: candidate,
      });
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child === undefined) continue;
      stack.push({ node: child, parent: node.instanceId });
    }
  }

  const nodeByKey = new Map<string, ConstraintNode>();
  const instancePropToNodeKey = new Map<string, string>();
  for (const node of collected) {
    nodeByKey.set(node.key, node);
    instancePropToNodeKey.set(makeInstancePropKey(node.instanceId, node.prop), node.key);
  }

  const edgesMutable = new Map<string, readonly string[]>();
  const requiredRuntimeInstanceIds = new Set<InstanceId>();
  const intrinsicRuntimeInstanceIds = new Set<InstanceId>();
  for (const node of collected) {
    const unknownFunction = findUnknownFunctionName(node.expr.ast);
    if (unknownFunction !== null) {
      return invalid(
        `Unknown function "${unknownFunction}" in ${labelNode(node)} (${node.expr.source}). Hint: Check the constraint function allowlist (clamp/min/max/floor/ceil/round/abs/if/max_sibling/sum_sibling/steps), or prefer helper constraints for common patterns.`,
      );
    }

    requiredRuntimeInstanceIds.add(node.instanceId);
    if (node.prop === "display" || node.expr.hasIntrinsic || node.expr.hasSiblingAggregation) {
      requiresCommitRelayout = true;
      if (node.prop === "display") hasDisplayConstraints = true;
    }
    if (node.expr.hasIntrinsic) intrinsicRuntimeInstanceIds.add(node.instanceId);
    const deps = new Set<string>();
    const usages = collectWidgetRefUsages(node.expr.ast);
    for (const usage of usages) {
      const instances = idToInstancesMutable.get(usage.id);
      if (instances === undefined || instances.length === 0) {
        return invalid(
          `Unknown widget reference "#${usage.id}.${usage.prop}" in ${labelNode(node)} (${node.expr.source}). Hint: Ensure the referenced id exists in the committed tree (and isn't conditionally omitted via show()/branching).`,
        );
      }

      if (usage.viaAggregation) {
        for (const instanceId of instances) {
          requiredRuntimeInstanceIds.add(instanceId);
          const depProp = refPropToConstraintProp(usage.prop);
          const depKey = instancePropToNodeKey.get(makeInstancePropKey(instanceId, depProp));
          if (depKey !== undefined) deps.add(depKey);
          else intrinsicRuntimeInstanceIds.add(instanceId);
          // Hidden nodes resolve sibling metric refs as zero, so depend on display first when present.
          maybeAddDisplayDependency(instanceId, node.key, deps, instancePropToNodeKey);
        }
        continue;
      }

      if (instances.length !== 1) {
        return invalid(
          `Direct widget reference "#${usage.id}.${usage.prop}" in ${labelNode(node)} is ambiguous. Hint: Use max_sibling()/sum_sibling() (or the groupConstraints helpers) for shared IDs.`,
        );
      }

      const instanceId = instances[0];
      if (instanceId === undefined) continue;
      requiredRuntimeInstanceIds.add(instanceId);
      const depProp = refPropToConstraintProp(usage.prop);
      const depKey = instancePropToNodeKey.get(makeInstancePropKey(instanceId, depProp));
      if (depKey !== undefined) {
        deps.add(depKey);
      } else {
        // Direct ref to an unconstrained metric falls back to baseline layout/intrinsic
        // values and can change on commit even when layout-key props appear stable.
        requiresCommitRelayout = true;
        intrinsicRuntimeInstanceIds.add(instanceId);
      }
      // Hidden nodes resolve sibling metric refs as zero, so depend on display first when present.
      maybeAddDisplayDependency(instanceId, node.key, deps, instancePropToNodeKey);
    }

    edgesMutable.set(node.key, Object.freeze([...deps]));
  }

  const nodes = Object.freeze(collected.slice());
  const constrainedInstanceIds = new Set<InstanceId>();
  for (const node of nodes) {
    constrainedInstanceIds.add(node.instanceId);
  }
  const idToInstances = new Map<string, readonly InstanceId[]>();
  for (const [id, instances] of idToInstancesMutable.entries()) {
    idToInstances.set(id, Object.freeze(instances.slice()));
  }
  const instanceIdToWidgetId = new Map<InstanceId, string>(instanceIdToWidgetIdMutable.entries());
  const edges = new Map<string, readonly string[]>(edgesMutable.entries());
  const fingerprint = computeFingerprint(nodes);

  const sorted = topologicalSort({ nodes, edges, nodeByKey });
  if (!sorted.ok) return sorted;

  return {
    ok: true,
    value: {
      nodes,
      edges,
      order: sorted.value,
      fingerprint,
      requiresCommitRelayout,
      hasDisplayConstraints,
      constrainedInstanceIds: Object.freeze(constrainedInstanceIds),
      requiredRuntimeInstanceIds: Object.freeze(requiredRuntimeInstanceIds),
      intrinsicRuntimeInstanceIds: Object.freeze(intrinsicRuntimeInstanceIds),
      nodeByKey,
      idToInstances,
      instanceIdToWidgetId,
    },
  };
}

import { resolveEasing } from "../../animation/easing.js";
import { normalizeDurationMs } from "../../animation/interpolate.js";
import type { ExitAnimationState, TransitionSpec, VNode } from "../../widgets/types.js";
import type { InstanceId } from "../instance.js";
import type { CompositeInstanceRegistry } from "../instances.js";
import type { RuntimeLocalStateStore } from "../localState.js";
import {
  type CommitCtx,
  DEFAULT_EXIT_TRANSITION_DURATION_MS,
  type RuntimeInstance,
} from "./shared.js";
import { readVNodeKey } from "./validation.js";

export function collectSubtreeInstanceIds(node: RuntimeInstance, out: InstanceId[]): void {
  out.push(node.instanceId);
  for (const c of node.children) collectSubtreeInstanceIds(c, out);
}

export function deleteLocalStateForSubtree(
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

export function tryScheduleExitAnimation(
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

export function markCompositeSubtreeStale(
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

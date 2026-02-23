import { resolveEasing } from "../../animation/easing.js";
import { interpolateNumber, normalizeDurationMs } from "../../animation/interpolate.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import type { PendingExitAnimation, RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { TransitionSpec } from "../../widgets/types.js";

export type PositionTransitionTrack = Readonly<{
  from: Rect;
  to: Rect;
  fromOpacity: number;
  toOpacity: number;
  startMs: number;
  durationMs: number;
  easing: (t: number) => number;
  animatePosition: boolean;
  animateSize: boolean;
  animateOpacity: boolean;
}>;

export type ResolvedPositionTransition = Readonly<{
  durationMs: number;
  easing: (t: number) => number;
  animatePosition: boolean;
  animateSize: boolean;
  animateOpacity: boolean;
}>;

export type ExitTransitionTrack = Readonly<{
  instanceId: InstanceId;
  frozenRect: Rect;
  frozenOpacity: number;
  startMs: number;
  durationMs: number;
  easing: (t: number) => number;
  animateOpacity: boolean;
  animatePosition: boolean;
  animateSize: boolean;
}>;

export type ExitTransitionRenderNode = Readonly<{
  instanceId: InstanceId;
  parentInstanceId: InstanceId;
  runtimeRoot: RuntimeInstance;
  layoutRoot: LayoutTree;
  vnodeKind: RuntimeInstance["vnode"]["kind"];
  key: string | undefined;
  subtreeInstanceIds: readonly InstanceId[];
  runDeferredLocalStateCleanup: () => void;
}>;

type RefreshPositionTransitionTracksParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  layoutRoot: LayoutTree;
  frameNowMs: number;
  pooledVisitedTransitionIds: Set<InstanceId>;
  pooledRuntimeStack: RuntimeInstance[];
  pooledLayoutStack: LayoutTree[];
  positionTransitionTrackByInstanceId: Map<InstanceId, PositionTransitionTrack>;
  animatedRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  animatedOpacityByInstanceId: ReadonlyMap<InstanceId, number>;
  prevFrameRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  prevFrameOpacityByInstanceId: ReadonlyMap<InstanceId, number>;
}>;

type RebuildAnimatedRectOverridesParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  layoutRoot: LayoutTree;
  frameNowMs: number;
  pooledRuntimeStack: RuntimeInstance[];
  pooledLayoutStack: LayoutTree[];
  pooledOffsetXStack: number[];
  pooledOffsetYStack: number[];
  positionTransitionTrackByInstanceId: Map<InstanceId, PositionTransitionTrack>;
  animatedRectByInstanceId: Map<InstanceId, Rect>;
  animatedOpacityByInstanceId: Map<InstanceId, number>;
}>;

type ScheduleExitAnimationsParams = Readonly<{
  pendingExitAnimations: readonly PendingExitAnimation[];
  frameNowMs: number;
  layoutSubtreeByInstanceId: ReadonlyMap<InstanceId, LayoutTree>;
  prevFrameOpacityByInstanceId: ReadonlyMap<InstanceId, number>;
  exitTransitionTrackByInstanceId: Map<InstanceId, ExitTransitionTrack>;
  exitRenderNodeByInstanceId: Map<InstanceId, ExitTransitionRenderNode>;
}>;

type SampleExitAnimationsParams = Readonly<{
  frameNowMs: number;
  exitTransitionTrackByInstanceId: Map<InstanceId, ExitTransitionTrack>;
  exitRenderNodeByInstanceId: Map<InstanceId, ExitTransitionRenderNode>;
  exitAnimatedRectByInstanceId: Map<InstanceId, Rect>;
  exitAnimatedOpacityByInstanceId: Map<InstanceId, number>;
}>;

const DEFAULT_POSITION_TRANSITION_DURATION_MS = 180;
const TRANSITION_CAPABLE_KINDS = new Set(["box", "row", "column", "grid"]);

function transitionSupportsPosition(transition: TransitionSpec): boolean {
  const properties = transition.properties;
  if (properties === undefined || properties === "all") return true;
  if (!Array.isArray(properties)) return false;
  return properties.includes("position");
}

function transitionSupportsSize(transition: TransitionSpec): boolean {
  const properties = transition.properties;
  if (properties === undefined || properties === "all") return true;
  if (!Array.isArray(properties)) return false;
  return properties.includes("size");
}

function transitionSupportsOpacity(transition: TransitionSpec): boolean {
  const properties = transition.properties;
  if (properties === undefined || properties === "all") return true;
  if (!Array.isArray(properties)) return false;
  return properties.includes("opacity");
}

function clampOpacity(opacity: unknown): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) return 1;
  if (opacity <= 0) return 0;
  if (opacity >= 1) return 1;
  return opacity;
}

export function recomputeAnimatedWidgetPresence(
  runtimeRoot: RuntimeInstance,
  pooledRuntimeStack: RuntimeInstance[],
): boolean {
  pooledRuntimeStack.length = 0;
  pooledRuntimeStack.push(runtimeRoot);

  while (pooledRuntimeStack.length > 0) {
    const node = pooledRuntimeStack.pop();
    if (!node) continue;

    if (node.vnode.kind === "spinner") {
      pooledRuntimeStack.length = 0;
      return true;
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) pooledRuntimeStack.push(child);
    }
  }

  return false;
}

export function readContainerOpacity(node: RuntimeInstance): number {
  if (
    node.vnode.kind !== "box" &&
    node.vnode.kind !== "row" &&
    node.vnode.kind !== "column" &&
    node.vnode.kind !== "grid"
  ) {
    return 1;
  }
  if (node.vnode.kind !== "box") return 1;
  const props = node.vnode.props as Readonly<{ opacity?: unknown }> | undefined;
  return clampOpacity(props?.opacity);
}

export function resolvePositionTransition(
  node: RuntimeInstance,
): ResolvedPositionTransition | null {
  if (!TRANSITION_CAPABLE_KINDS.has(node.vnode.kind)) return null;

  const props = node.vnode.props as Readonly<{ transition?: TransitionSpec }> | undefined;
  const transition = props?.transition;
  if (!transition) return null;

  const animatePosition = transitionSupportsPosition(transition);
  const animateSize = transitionSupportsSize(transition);
  const animateOpacity = transitionSupportsOpacity(transition);
  if (!animatePosition && !animateSize && !animateOpacity) return null;

  return Object.freeze({
    durationMs: normalizeDurationMs(transition.duration, DEFAULT_POSITION_TRANSITION_DURATION_MS),
    easing: resolveEasing(transition.easing),
    animatePosition,
    animateSize,
    animateOpacity,
  });
}

export function refreshPositionTransitionTracks(
  params: RefreshPositionTransitionTracksParams,
): void {
  params.pooledVisitedTransitionIds.clear();
  params.pooledRuntimeStack.length = 0;
  params.pooledLayoutStack.length = 0;
  params.pooledRuntimeStack.push(params.runtimeRoot);
  params.pooledLayoutStack.push(params.layoutRoot);

  while (params.pooledRuntimeStack.length > 0 && params.pooledLayoutStack.length > 0) {
    const runtimeNode = params.pooledRuntimeStack.pop();
    const layoutNode = params.pooledLayoutStack.pop();
    if (!runtimeNode || !layoutNode) continue;

    const transition = resolvePositionTransition(runtimeNode);
    if (transition) {
      const instanceId = runtimeNode.instanceId;
      params.pooledVisitedTransitionIds.add(instanceId);

      const nextRect = layoutNode.rect;
      const nextOpacity = readContainerOpacity(runtimeNode);
      const existingTrack = params.positionTransitionTrackByInstanceId.get(instanceId);
      const previousRect = params.prevFrameRectByInstanceId.get(instanceId);
      const previousOpacity = params.prevFrameOpacityByInstanceId.get(instanceId) ?? nextOpacity;

      const targetChanged =
        existingTrack !== undefined &&
        (existingTrack.to.x !== nextRect.x ||
          existingTrack.to.y !== nextRect.y ||
          existingTrack.to.w !== nextRect.w ||
          existingTrack.to.h !== nextRect.h ||
          !Object.is(existingTrack.toOpacity, nextOpacity));

      if (transition.durationMs <= 0) {
        params.positionTransitionTrackByInstanceId.delete(instanceId);
      } else if (existingTrack && targetChanged) {
        const fromRect = params.animatedRectByInstanceId.get(instanceId) ?? existingTrack.to;
        const fromOpacity =
          params.animatedOpacityByInstanceId.get(instanceId) ?? existingTrack.toOpacity;
        const animatePosition =
          transition.animatePosition && (fromRect.x !== nextRect.x || fromRect.y !== nextRect.y);
        const animateSize =
          transition.animateSize && (fromRect.w !== nextRect.w || fromRect.h !== nextRect.h);
        const animateOpacity = transition.animateOpacity && !Object.is(fromOpacity, nextOpacity);
        if (animatePosition || animateSize || animateOpacity) {
          params.positionTransitionTrackByInstanceId.set(
            instanceId,
            Object.freeze({
              from: fromRect,
              to: nextRect,
              fromOpacity,
              toOpacity: nextOpacity,
              startMs: params.frameNowMs,
              durationMs: transition.durationMs,
              easing: transition.easing,
              animatePosition,
              animateSize,
              animateOpacity,
            }),
          );
        } else {
          params.positionTransitionTrackByInstanceId.delete(instanceId);
        }
      } else if (!existingTrack && previousRect) {
        const fromRect = params.animatedRectByInstanceId.get(instanceId) ?? previousRect;
        const fromOpacity = previousOpacity;
        const animatePosition =
          transition.animatePosition && (fromRect.x !== nextRect.x || fromRect.y !== nextRect.y);
        const animateSize =
          transition.animateSize && (fromRect.w !== nextRect.w || fromRect.h !== nextRect.h);
        const animateOpacity = transition.animateOpacity && !Object.is(fromOpacity, nextOpacity);
        if (animatePosition || animateSize || animateOpacity) {
          params.positionTransitionTrackByInstanceId.set(
            instanceId,
            Object.freeze({
              from: fromRect,
              to: nextRect,
              fromOpacity,
              toOpacity: nextOpacity,
              startMs: params.frameNowMs,
              durationMs: transition.durationMs,
              easing: transition.easing,
              animatePosition,
              animateSize,
              animateOpacity,
            }),
          );
        }
      }
    }

    const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
    for (let i = childCount - 1; i >= 0; i--) {
      const runtimeChild = runtimeNode.children[i];
      const layoutChild = layoutNode.children[i];
      if (runtimeChild && layoutChild) {
        params.pooledRuntimeStack.push(runtimeChild);
        params.pooledLayoutStack.push(layoutChild);
      }
    }
  }

  for (const instanceId of params.positionTransitionTrackByInstanceId.keys()) {
    if (!params.pooledVisitedTransitionIds.has(instanceId)) {
      params.positionTransitionTrackByInstanceId.delete(instanceId);
    }
  }
  params.pooledVisitedTransitionIds.clear();
}

export function rebuildAnimatedRectOverrides(params: RebuildAnimatedRectOverridesParams): boolean {
  params.animatedRectByInstanceId.clear();
  params.animatedOpacityByInstanceId.clear();
  params.pooledRuntimeStack.length = 0;
  params.pooledLayoutStack.length = 0;
  params.pooledOffsetXStack.length = 0;
  params.pooledOffsetYStack.length = 0;
  params.pooledRuntimeStack.push(params.runtimeRoot);
  params.pooledLayoutStack.push(params.layoutRoot);
  params.pooledOffsetXStack.push(0);
  params.pooledOffsetYStack.push(0);

  let activeCount = 0;

  while (
    params.pooledRuntimeStack.length > 0 &&
    params.pooledLayoutStack.length > 0 &&
    params.pooledOffsetXStack.length > 0 &&
    params.pooledOffsetYStack.length > 0
  ) {
    const runtimeNode = params.pooledRuntimeStack.pop();
    const layoutNode = params.pooledLayoutStack.pop();
    const parentOffsetX = params.pooledOffsetXStack.pop();
    const parentOffsetY = params.pooledOffsetYStack.pop();
    if (runtimeNode === undefined || layoutNode === undefined) continue;
    if (parentOffsetX === undefined || parentOffsetY === undefined) continue;

    const baseRect = layoutNode.rect;
    const track = params.positionTransitionTrackByInstanceId.get(runtimeNode.instanceId);
    let localOffsetX = 0;
    let localOffsetY = 0;
    let animatedWidth = baseRect.w;
    let animatedHeight = baseRect.h;
    let animatedOpacity: number | null = null;

    if (track) {
      const elapsedMs = Math.max(0, params.frameNowMs - track.startMs);
      const progress = track.durationMs <= 0 ? 1 : Math.min(1, elapsedMs / track.durationMs);
      if (progress >= 1) {
        params.positionTransitionTrackByInstanceId.delete(runtimeNode.instanceId);
      } else {
        activeCount++;
        const eased = track.easing(progress);
        const animatedX = track.animatePosition
          ? Math.round(interpolateNumber(track.from.x, track.to.x, eased))
          : baseRect.x;
        const animatedY = track.animatePosition
          ? Math.round(interpolateNumber(track.from.y, track.to.y, eased))
          : baseRect.y;
        if (track.animateSize) {
          animatedWidth = Math.max(
            0,
            Math.round(interpolateNumber(track.from.w, track.to.w, eased)),
          );
          animatedHeight = Math.max(
            0,
            Math.round(interpolateNumber(track.from.h, track.to.h, eased)),
          );
        }
        if (track.animateOpacity) {
          animatedOpacity = clampOpacity(
            interpolateNumber(track.fromOpacity, track.toOpacity, eased),
          );
        }
        localOffsetX = animatedX - baseRect.x;
        localOffsetY = animatedY - baseRect.y;
      }
    }

    const totalOffsetX = parentOffsetX + localOffsetX;
    const totalOffsetY = parentOffsetY + localOffsetY;
    if (
      totalOffsetX !== 0 ||
      totalOffsetY !== 0 ||
      animatedWidth !== baseRect.w ||
      animatedHeight !== baseRect.h
    ) {
      params.animatedRectByInstanceId.set(
        runtimeNode.instanceId,
        Object.freeze({
          x: baseRect.x + totalOffsetX,
          y: baseRect.y + totalOffsetY,
          w: animatedWidth,
          h: animatedHeight,
        }),
      );
    }
    if (animatedOpacity !== null) {
      params.animatedOpacityByInstanceId.set(runtimeNode.instanceId, animatedOpacity);
    }

    const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
    for (let i = childCount - 1; i >= 0; i--) {
      const runtimeChild = runtimeNode.children[i];
      const layoutChild = layoutNode.children[i];
      if (runtimeChild && layoutChild) {
        params.pooledRuntimeStack.push(runtimeChild);
        params.pooledLayoutStack.push(layoutChild);
        params.pooledOffsetXStack.push(totalOffsetX);
        params.pooledOffsetYStack.push(totalOffsetY);
      }
    }
  }

  const hasActivePositionTransitions = activeCount > 0;
  if (!hasActivePositionTransitions) {
    params.animatedRectByInstanceId.clear();
    params.animatedOpacityByInstanceId.clear();
  }

  return hasActivePositionTransitions;
}

export function scheduleExitAnimations(
  params: ScheduleExitAnimationsParams,
): readonly PendingExitAnimation[] {
  const missingLayout: PendingExitAnimation[] = [];
  for (const pending of params.pendingExitAnimations) {
    const layoutRoot = params.layoutSubtreeByInstanceId.get(pending.instanceId);
    if (!layoutRoot) {
      missingLayout.push(pending);
      continue;
    }

    const properties = pending.exit.properties;
    const animatePosition =
      properties === "all" || (Array.isArray(properties) && properties.includes("position"));
    const animateSize =
      properties === "all" || (Array.isArray(properties) && properties.includes("size"));
    const animateOpacity =
      properties === "all" || (Array.isArray(properties) && properties.includes("opacity"));
    const frozenOpacity = params.prevFrameOpacityByInstanceId.get(pending.instanceId) ?? 1;

    params.exitTransitionTrackByInstanceId.set(
      pending.instanceId,
      Object.freeze({
        instanceId: pending.instanceId,
        frozenRect: layoutRoot.rect,
        frozenOpacity,
        startMs: params.frameNowMs,
        durationMs: pending.exit.durationMs,
        easing: pending.exit.easing,
        animateOpacity,
        animatePosition,
        animateSize,
      }),
    );
    params.exitRenderNodeByInstanceId.set(
      pending.instanceId,
      Object.freeze({
        instanceId: pending.instanceId,
        parentInstanceId: pending.parentInstanceId,
        runtimeRoot: pending.runtimeRoot,
        layoutRoot,
        vnodeKind: pending.vnodeKind,
        key: pending.key,
        subtreeInstanceIds: pending.subtreeInstanceIds,
        runDeferredLocalStateCleanup: pending.runDeferredLocalStateCleanup,
      }),
    );
  }
  return Object.freeze(missingLayout);
}

export function sampleExitAnimations(params: SampleExitAnimationsParams): Readonly<{
  hasActiveExitTransitions: boolean;
  completedExitNodes: readonly ExitTransitionRenderNode[];
}> {
  params.exitAnimatedRectByInstanceId.clear();
  params.exitAnimatedOpacityByInstanceId.clear();

  const completedExitNodes: ExitTransitionRenderNode[] = [];
  let activeCount = 0;
  for (const [instanceId, track] of params.exitTransitionTrackByInstanceId) {
    const elapsedMs = Math.max(0, params.frameNowMs - track.startMs);
    const progress = track.durationMs <= 0 ? 1 : Math.min(1, elapsedMs / track.durationMs);
    if (progress >= 1) {
      params.exitTransitionTrackByInstanceId.delete(instanceId);
      const node = params.exitRenderNodeByInstanceId.get(instanceId);
      if (node) {
        completedExitNodes.push(node);
      }
      params.exitRenderNodeByInstanceId.delete(instanceId);
      continue;
    }

    activeCount++;
    params.exitAnimatedRectByInstanceId.set(instanceId, track.frozenRect);
    if (track.animateOpacity) {
      params.exitAnimatedOpacityByInstanceId.set(
        instanceId,
        clampOpacity(interpolateNumber(track.frozenOpacity, 0, track.easing(progress))),
      );
    } else if (!Object.is(track.frozenOpacity, 1)) {
      params.exitAnimatedOpacityByInstanceId.set(instanceId, track.frozenOpacity);
    }
  }

  const hasActiveExitTransitions = activeCount > 0;
  if (!hasActiveExitTransitions) {
    params.exitAnimatedRectByInstanceId.clear();
    params.exitAnimatedOpacityByInstanceId.clear();
  }

  return Object.freeze({
    hasActiveExitTransitions,
    completedExitNodes: Object.freeze(completedExitNodes),
  });
}

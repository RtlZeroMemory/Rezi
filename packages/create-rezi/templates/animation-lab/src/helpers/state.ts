import type { AnimationLabAction, AnimationLabState, NudgePayload } from "../types.js";

const MODULE_SET: readonly string[] = Object.freeze([
  "Particle mesh synchronized",
  "Quaternion drift compensated",
  "Raster cache pre-warmed",
  "Lens bloom stabilized",
  "Adaptive blurline fused",
]);

type Viewport = Readonly<{
  cols: number;
  rows: number;
}>;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return fallback;
  }
  return value;
}

function resolveViewport(
  cols: number,
  rows: number,
): Readonly<{
  viewportCols: number;
  viewportRows: number;
}> {
  const viewportCols = clamp(toPositiveInt(cols, 96), 20, 500);
  const viewportRows = clamp(toPositiveInt(rows, 32), 10, 200);
  return Object.freeze({ viewportCols, viewportRows });
}

export function createInitialState(viewport?: Viewport): AnimationLabState {
  const layout = resolveViewport(viewport?.cols ?? 96, viewport?.rows ?? 32);
  return Object.freeze({
    tick: 0,
    phase: 0,
    viewportCols: layout.viewportCols,
    viewportRows: layout.viewportRows,
    panelOpacity: 0.9,
    driftTarget: 0.15,
    fluxTarget: 0.58,
    orbitTarget: 0.45,
    burstTarget: 0.2,
    modules: MODULE_SET,
  });
}

function applyNudge(previous: AnimationLabState, payload: NudgePayload): AnimationLabState {
  return Object.freeze({
    ...previous,
    driftTarget: clamp(previous.driftTarget + (payload.driftDelta ?? 0), -1, 1),
    fluxTarget: clamp(previous.fluxTarget + (payload.fluxDelta ?? 0), 0, 1),
    orbitTarget: clamp(previous.orbitTarget + (payload.orbitDelta ?? 0), 0, 1),
    burstTarget: clamp(previous.burstTarget + (payload.burstDelta ?? 0), 0, 1),
    panelOpacity: clamp(previous.panelOpacity + (payload.opacityDelta ?? 0), 0.3, 1),
  });
}

function advanceState(previous: AnimationLabState): AnimationLabState {
  const nextTick = previous.tick + 1;
  const panelOpacityTarget = 0.82 + Math.sin(nextTick / 11) * 0.08;

  const driftTarget = clamp(Math.sin(nextTick / 5), -1, 1);
  const fluxTarget = clamp(0.52 + Math.sin(nextTick / 4) * 0.42, 0.08, 1);
  const orbitTarget = clamp(0.5 + Math.cos(nextTick / 6) * 0.45, 0, 1);

  const periodicBurst = nextTick % 13 === 0 ? 1 : 0;
  const burstTarget = clamp(previous.burstTarget * 0.82 + periodicBurst * 0.9, 0, 1);

  return Object.freeze({
    tick: nextTick,
    phase: previous.phase,
    viewportCols: previous.viewportCols,
    viewportRows: previous.viewportRows,
    panelOpacity: clamp(panelOpacityTarget, 0.3, 1),
    driftTarget,
    fluxTarget,
    orbitTarget,
    burstTarget,
    modules: MODULE_SET,
  });
}

function applyViewport(previous: AnimationLabState, cols: number, rows: number): AnimationLabState {
  const layout = resolveViewport(cols, rows);
  if (
    previous.viewportCols === layout.viewportCols &&
    previous.viewportRows === layout.viewportRows
  ) {
    return previous;
  }

  return Object.freeze({
    ...previous,
    viewportCols: layout.viewportCols,
    viewportRows: layout.viewportRows,
  });
}

export function reduceAnimationLabState(
  previous: AnimationLabState,
  action: AnimationLabAction,
): AnimationLabState {
  if (action.type === "advance") {
    return advanceState(previous);
  }

  if (action.type === "cycle-phase") {
    return Object.freeze({
      ...previous,
      phase: (previous.phase + 1) % 4,
    });
  }

  if (action.type === "burst") {
    return applyNudge(previous, { burstDelta: 0.9 });
  }

  if (action.type === "nudge") {
    return applyNudge(previous, action.payload);
  }

  if (action.type === "apply-viewport") {
    return applyViewport(previous, action.cols, action.rows);
  }

  return previous;
}

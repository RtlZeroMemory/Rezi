export type AnimationLabState = Readonly<{
  tick: number;
  phase: number;
  viewportCols: number;
  viewportRows: number;
  panelOpacity: number;
  driftTarget: number;
  fluxTarget: number;
  orbitTarget: number;
  burstTarget: number;
  modules: readonly string[];
}>;

export type NudgePayload = Readonly<{
  driftDelta?: number;
  fluxDelta?: number;
  orbitDelta?: number;
  burstDelta?: number;
  opacityDelta?: number;
}>;

export type AnimationLabAction =
  | Readonly<{ type: "advance" }>
  | Readonly<{ type: "cycle-phase" }>
  | Readonly<{ type: "burst" }>
  | Readonly<{ type: "nudge"; payload: NudgePayload }>
  | Readonly<{ type: "apply-viewport"; cols: number; rows: number }>;

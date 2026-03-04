export type AnimationLabCommand =
  | "quit"
  | "toggle-autoplay"
  | "step"
  | "nudge-right"
  | "nudge-left"
  | "nudge-up"
  | "nudge-down"
  | "burst"
  | "randomize"
  | "cycle-phase"
  | "cycle-theme";

const COMMAND_MAP: Readonly<Record<string, AnimationLabCommand>> = Object.freeze({
  q: "quit",
  "ctrl+c": "quit",
  space: "toggle-autoplay",
  p: "toggle-autoplay",
  enter: "step",
  right: "nudge-right",
  left: "nudge-left",
  up: "nudge-up",
  down: "nudge-down",
  b: "burst",
  r: "randomize",
  m: "cycle-phase",
  t: "cycle-theme",
});

export function resolveAnimationLabCommand(key: string): AnimationLabCommand | undefined {
  return COMMAND_MAP[key];
}

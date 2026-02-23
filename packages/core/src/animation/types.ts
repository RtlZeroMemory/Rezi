/**
 * packages/core/src/animation/types.ts — Core animation API types.
 *
 * Why: Centralize animation configs so hooks and renderer transitions share
 * consistent behavior and defaults.
 */

/** Easing function input/output in [0..1]. */
export type EasingFunction = (t: number) => number;

/** Built-in easing presets for declarative animation hooks. */
export type EasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInExpo"
  | "easeOutExpo"
  | "easeInOutExpo"
  | "easeInBack"
  | "easeOutBack"
  | "easeInOutBack"
  | "easeOutBounce"
  | "easeInBounce";

/** Easing value accepted by transition APIs. */
export type EasingInput = EasingName | EasingFunction;

/** Time-based interpolation configuration. */
export type TransitionConfig = Readonly<{
  /** Transition duration in milliseconds. */
  duration?: number;
  /** Easing curve name or custom easing function. */
  easing?: EasingInput;
  /** Called when the transition reaches the target value. */
  onComplete?: () => void;
}>;

/** Spring simulation configuration. */
export type SpringConfig = Readonly<{
  /** Hooke spring constant. Larger values snap faster. */
  stiffness?: number;
  /** Velocity damping factor. Larger values reduce oscillation. */
  damping?: number;
  /** Mass term. Higher values move more slowly. */
  mass?: number;
  /** Position threshold for settling. */
  restDelta?: number;
  /** Velocity threshold for settling. */
  restSpeed?: number;
  /** Maximum integration step in milliseconds. */
  maxDeltaMs?: number;
  /** Called when the spring settles at rest. */
  onComplete?: () => void;
}>;

/** Internal normalized spring config with defaults applied. */
export type NormalizedSpringConfig = Readonly<{
  stiffness: number;
  damping: number;
  mass: number;
  restDelta: number;
  restSpeed: number;
  maxDeltaMs: number;
}>;

/** Sequence keyframe input for `useSequence`. */
export type SequenceKeyframe =
  | number
  | Readonly<{
      /** Keyframe numeric value. */
      value: number;
      /** Segment duration (ms) to the next keyframe. */
      duration?: number;
      /** Easing used for the segment to the next keyframe. */
      easing?: EasingInput;
    }>;

/** Sequence timeline configuration. */
export type SequenceConfig = Readonly<{
  /** Default per-segment duration in milliseconds. */
  duration?: number;
  /** Default easing for segments without per-keyframe easing. */
  easing?: EasingInput;
  /** Loop sequence timeline when it reaches the end. */
  loop?: boolean;
  /** Called when the sequence reaches the final keyframe (when not looping). */
  onComplete?: () => void;
}>;

/** Staggered list animation configuration. */
export type StaggerConfig = Readonly<{
  /** Delay between each item start in milliseconds. */
  delay?: number;
  /** Duration for each item in milliseconds. */
  duration?: number;
  /** Easing curve applied to each item's local progress. */
  easing?: EasingInput;
  /** Called when all item progress values reach 1.0. */
  onComplete?: () => void;
}>;

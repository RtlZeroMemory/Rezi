import { resolveEasing } from "../../animation/easing.js";
import { clamp01, interpolateNumber, normalizeDurationMs } from "../../animation/interpolate.js";
import {
  type NormalizedSpringConfig,
  isSpringAtRest,
  normalizeSpringConfig,
  stepSpring,
} from "../../animation/spring.js";
import { normalizeSequence, sampleSequence } from "../../animation/timeline.js";
import type {
  SequenceConfig,
  SequenceKeyframe,
  SpringConfig,
  StaggerConfig,
  TransitionConfig,
} from "../../animation/types.js";
import type { WidgetContext } from "../composition.js";

/**
 * Minimal context required by `useTransition`.
 */
type TransitionHookContext = Pick<
  WidgetContext<unknown>,
  "useEffect" | "useMemo" | "useRef" | "useState"
>;

/**
 * Minimal context required by `useSpring`.
 */
type SpringHookContext = Pick<
  WidgetContext<unknown>,
  "useEffect" | "useMemo" | "useRef" | "useState"
>;

/**
 * Minimal context required by `useSequence`.
 */
type SequenceHookContext = Pick<
  WidgetContext<unknown>,
  "useEffect" | "useMemo" | "useRef" | "useState"
>;

/**
 * Minimal context required by `useStagger`.
 */
type StaggerHookContext = Pick<
  WidgetContext<unknown>,
  "useEffect" | "useMemo" | "useRef" | "useState"
>;

/**
 * Transition configuration accepted by `useTransition`.
 */
export type UseTransitionConfig = TransitionConfig;

/**
 * Spring configuration accepted by `useSpring`.
 */
export type UseSpringConfig = SpringConfig;

/**
 * Sequence configuration accepted by `useSequence`.
 */
export type UseSequenceConfig = SequenceConfig;

/**
 * Stagger configuration accepted by `useStagger`.
 */
export type UseStaggerConfig = StaggerConfig;

const ANIMATION_FRAME_MS = 16;
const DEFAULT_TRANSITION_DURATION_MS = 160;

function nowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = perf?.now;
  if (typeof perfNow === "function") return perfNow.call(perf);
  return Date.now();
}

function clearAnimationTimer(ref: { current: ReturnType<typeof setTimeout> | null }): void {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

type AnimationCompletionState = {
  runId: number;
  completedRunId: number;
};

function beginAnimationRun(ref: { current: AnimationCompletionState }): number {
  const nextRunId = ref.current.runId + 1;
  ref.current.runId = nextRunId;
  return nextRunId;
}

function invalidateAnimationRun(ref: { current: AnimationCompletionState }, runId: number): void {
  if (ref.current.runId === runId) {
    ref.current.runId = runId + 1;
  }
}

function scheduleAnimationCompletion(
  ref: { current: AnimationCompletionState },
  runId: number,
  onCompleteRef: { current: (() => void) | undefined },
): void {
  if (ref.current.completedRunId === runId) return;
  setTimeout(() => {
    const state = ref.current;
    if (state.runId !== runId || state.completedRunId === runId) return;
    state.completedRunId = runId;
    onCompleteRef.current?.();
  }, 0);
}

/**
 * Animate from the current numeric value to `value` over time.
 *
 * Returns the interpolated number for the current render.
 */
export function useTransition(
  ctx: TransitionHookContext,
  value: number,
  config: UseTransitionConfig = {},
): number {
  const [current, setCurrent] = ctx.useState<number>(() => value);
  const timerRef = ctx.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = ctx.useRef<number>(current);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  currentRef.current = current;

  const durationMs = normalizeDurationMs(config.duration, DEFAULT_TRANSITION_DURATION_MS);
  const easing = ctx.useMemo(() => resolveEasing(config.easing), [config.easing]);

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);

    if (!Number.isFinite(value) || !Number.isFinite(currentRef.current)) {
      const changed = !Object.is(currentRef.current, value);
      setCurrent(value);
      if (changed) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    if (durationMs <= 0 || Object.is(currentRef.current, value)) {
      const changed = !Object.is(currentRef.current, value);
      setCurrent(value);
      if (changed) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    const from = currentRef.current;
    const to = value;
    const startMs = nowMs();

    const tick = () => {
      const elapsedMs = nowMs() - startMs;
      const progress = clamp01(elapsedMs / durationMs);
      const next = interpolateNumber(from, to, easing(progress));
      if (progress >= 1) {
        setCurrent(to);
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        timerRef.current = null;
        return;
      }
      setCurrent(next);
      timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);
    };

    timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [durationMs, easing, value]);

  return current;
}

/**
 * Animate a numeric target with spring physics.
 *
 * Returns the spring-simulated value for the current render.
 */
export function useSpring(
  ctx: SpringHookContext,
  target: number,
  config: UseSpringConfig = {},
): number {
  const [current, setCurrent] = ctx.useState<number>(() => target);
  const timerRef = ctx.useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = ctx.useRef<number>(current);
  const velocityRef = ctx.useRef<number>(0);
  const targetRef = ctx.useRef<number>(target);
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  valueRef.current = current;
  targetRef.current = target;

  const springConfig: NormalizedSpringConfig = ctx.useMemo(
    () => normalizeSpringConfig(config),
    [
      config.stiffness,
      config.damping,
      config.mass,
      config.restDelta,
      config.restSpeed,
      config.maxDeltaMs,
    ],
  );

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);
    lastStepMsRef.current = nowMs();

    if (!Number.isFinite(target) || !Number.isFinite(valueRef.current)) {
      velocityRef.current = 0;
      const changed = !Object.is(valueRef.current, target);
      setCurrent(target);
      if (changed) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    if (isSpringAtRest(valueRef.current, target, velocityRef.current, springConfig)) {
      velocityRef.current = 0;
      const changed = !Object.is(valueRef.current, target);
      if (changed) {
        setCurrent(target);
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    const tick = () => {
      const stepNowMs = nowMs();
      const prevMs = lastStepMsRef.current ?? stepNowMs;
      lastStepMsRef.current = stepNowMs;
      const dtMs = Math.max(1, Math.min(springConfig.maxDeltaMs, stepNowMs - prevMs));
      const step = stepSpring(
        { value: valueRef.current, velocity: velocityRef.current },
        targetRef.current,
        dtMs / 1000,
        springConfig,
      );
      velocityRef.current = step.velocity;
      if (step.done) {
        setCurrent(step.value);
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        timerRef.current = null;
        return;
      }
      setCurrent(step.value);
      timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);
    };

    timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [springConfig, target]);

  return current;
}

/**
 * Run a keyframe sequence and return the current interpolated value.
 */
export function useSequence(
  ctx: SequenceHookContext,
  keyframes: readonly SequenceKeyframe[],
  config: UseSequenceConfig = {},
): number {
  const timerRef = ctx.useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  const signature = ctx.useMemo(() => {
    const parts: string[] = [];
    for (const frame of keyframes) {
      if (typeof frame === "number") {
        parts.push(`n:${String(frame)}`);
        continue;
      }
      parts.push(
        `k:${String(frame.value)}:${String(frame.duration ?? "")}:${String(frame.easing ?? "")}`,
      );
    }
    parts.push(`cfg:${String(config.duration ?? "")}:${String(config.easing ?? "")}`);
    parts.push(`loop:${config.loop === true ? "1" : "0"}`);
    return parts.join("|");
  }, [config.duration, config.easing, config.loop, keyframes]);

  const sequence = ctx.useMemo(
    () =>
      normalizeSequence(keyframes, {
        ...(config.duration === undefined ? {} : { duration: config.duration }),
        ...(config.easing === undefined ? {} : { easing: config.easing }),
      }),
    [signature],
  );

  const [current, setCurrent] = ctx.useState<number>(() => sequence.initialValue);

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);

    if (sequence.segments.length === 0) {
      setCurrent(sequence.initialValue);
      if (config.loop !== true) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    const loop = config.loop === true;
    const startMs = nowMs();

    const tick = () => {
      const elapsedMs = nowMs() - startMs;
      const sample = sampleSequence(sequence, elapsedMs, loop);
      if (sample.done && !loop) {
        setCurrent(sample.value);
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        timerRef.current = null;
        return;
      }
      setCurrent(sample.value);
      timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);
    };

    timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [config.loop, sequence]);

  return current;
}

function arraysShallowEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Animate item entrances with staggered delays.
 *
 * Returns eased progress for each item in [0..1].
 */
export function useStagger<T>(
  ctx: StaggerHookContext,
  items: readonly T[],
  config: UseStaggerConfig = {},
): readonly number[] {
  const timerRef = ctx.useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  const count = items.length;
  const delayMs = normalizeDurationMs(config.delay, 40);
  const durationMs = normalizeDurationMs(config.duration, 180);
  const easing = ctx.useMemo(() => resolveEasing(config.easing), [config.easing]);
  const [progresses, setProgresses] = ctx.useState<readonly number[]>(() =>
    Object.freeze(new Array<number>(count).fill(0)),
  );

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);

    if (count <= 0) {
      setProgresses(Object.freeze([]));
      return;
    }

    const startMs = nowMs();
    const totalDurationMs = delayMs * Math.max(0, count - 1) + durationMs;

    const tick = () => {
      const elapsedMs = nowMs() - startMs;
      const next: number[] = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        const localElapsedMs = elapsedMs - delayMs * i;
        const localProgress = durationMs <= 0 ? 1 : clamp01(localElapsedMs / durationMs);
        next[i] = easing(localProgress);
      }
      const frozen = Object.freeze(next);
      setProgresses((prev) => (arraysShallowEqual(prev, frozen) ? prev : frozen));
      if (elapsedMs >= totalDurationMs) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        timerRef.current = null;
        return;
      }
      timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);
    };

    timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [count, delayMs, durationMs, easing]);

  return progresses;
}

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
  PlaybackControl,
  SequenceConfig,
  SequenceKeyframe,
  SpringConfig,
  StaggerConfig,
  TransitionConfig,
} from "../../animation/types.js";

type HookUseEffect = {
  (effect: () => void, deps?: readonly unknown[]): void;
  (effect: () => () => void, deps?: readonly unknown[]): void;
};

type HookUseMemo = <T>(factory: () => T, deps?: readonly unknown[]) => T;
type HookUseRef = <T>(initial: T) => { current: T };
type HookUseState = <T>(initial: T | (() => T)) => [T, (v: T | ((prev: T) => T)) => void];

type AnimationHookContext = Readonly<{
  useEffect: HookUseEffect;
  useMemo: HookUseMemo;
  useRef: HookUseRef;
  useState: HookUseState;
}>;

/**
 * Minimal context required by `useTransition`.
 */
type TransitionHookContext = AnimationHookContext;

/**
 * Minimal context required by `useSpring`.
 */
type SpringHookContext = AnimationHookContext;

/**
 * Minimal context required by `useSequence`.
 */
type SequenceHookContext = AnimationHookContext;

/**
 * Minimal context required by `useStagger`.
 */
type StaggerHookContext = AnimationHookContext;

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

export type AnimatedValue = Readonly<{
  value: number;
  velocity: number;
  isAnimating: boolean;
}>;

export type AnimatedValueConfig = Readonly<{
  mode: "transition" | "spring";
  transition?: TransitionConfig;
  spring?: SpringConfig;
}>;

export type UseAnimatedValueConfig = AnimatedValueConfig;

export type ParallelAnimationEntry = Readonly<{
  value: number;
  isAnimating: boolean;
}>;

type ParallelAnimationConfig = Readonly<{
  target: number;
  config?: TransitionConfig;
}>;

export type UseParallelConfig = readonly ParallelAnimationConfig[];

type ChainAnimationConfig = Readonly<{
  target: number;
  config?: TransitionConfig;
}>;

export type UseChainConfig = readonly ChainAnimationConfig[];

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

type TimerLoopOptions = Readonly<{
  timerRef: { current: ReturnType<typeof setTimeout> | null };
  delayMs: number;
  onStart?: () => boolean;
  onTick: () => boolean;
  sampleOnStart?: boolean;
}>;

function runTimerLoop(options: TimerLoopOptions): void {
  const start = () => {
    if (options.onStart && options.onStart() === false) {
      options.timerRef.current = null;
      return;
    }

    const tick = () => {
      if (!options.onTick()) {
        options.timerRef.current = null;
        return;
      }
      options.timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);
    };

    if (options.sampleOnStart === true) {
      if (!options.onTick()) {
        options.timerRef.current = null;
        return;
      }
    }

    options.timerRef.current = setTimeout(tick, ANIMATION_FRAME_MS);
  };

  if (options.delayMs > 0) {
    options.timerRef.current = setTimeout(() => {
      options.timerRef.current = null;
      start();
    }, options.delayMs);
    return;
  }

  start();
}

type NormalizedPlayback = Readonly<{
  paused: boolean;
  reversed: boolean;
  rate: number;
}>;

function normalizePlayback(playback: PlaybackControl | undefined): NormalizedPlayback {
  const rateRaw = playback?.rate;
  const rate =
    typeof rateRaw === "number" && Number.isFinite(rateRaw) && rateRaw >= 0 ? rateRaw : 1;
  return Object.freeze({
    paused: playback?.paused === true || rate === 0,
    reversed: playback?.reversed === true,
    rate,
  });
}

function createAnimatedValue(value: number, velocity: number, isAnimating: boolean): AnimatedValue {
  return Object.freeze({ value, velocity, isAnimating });
}

function createParallelEntry(value: number, isAnimating: boolean): ParallelAnimationEntry {
  return Object.freeze({ value, isAnimating });
}

type TransitionRunState = {
  initialized: boolean;
  from: number;
  to: number;
  elapsedMs: number;
  durationMs: number;
  easing: (t: number) => number;
  pendingDelayMs: number;
};

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
  const lastTickMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  currentRef.current = current;

  const delayMs = normalizeDurationMs(config.delay, 0);
  const durationMs = normalizeDurationMs(config.duration, DEFAULT_TRANSITION_DURATION_MS);
  const easing = ctx.useMemo(() => resolveEasing(config.easing), [config.easing]);
  const playback = normalizePlayback(config.playback);
  const transitionStateRef = ctx.useRef<TransitionRunState>({
    initialized: false,
    from: value,
    to: value,
    elapsedMs: 0,
    durationMs,
    easing,
    pendingDelayMs: 0,
  });

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);

    const state = transitionStateRef.current;
    const shouldReset =
      !state.initialized ||
      !Object.is(state.to, value) ||
      state.durationMs !== durationMs ||
      state.easing !== easing;

    if (shouldReset) {
      state.initialized = true;
      state.from = currentRef.current;
      state.to = value;
      state.durationMs = durationMs;
      state.easing = easing;
      state.elapsedMs = playback.reversed ? durationMs : 0;
      state.pendingDelayMs = delayMs;
    } else {
      state.durationMs = durationMs;
      state.easing = easing;
      if (state.elapsedMs < 0) state.elapsedMs = 0;
      if (state.elapsedMs > state.durationMs) state.elapsedMs = state.durationMs;
    }

    if (playback.paused) {
      lastTickMsRef.current = null;
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    if (!Number.isFinite(state.from) || !Number.isFinite(state.to)) {
      const finalValue = playback.reversed ? state.from : state.to;
      const changed = !Object.is(currentRef.current, finalValue);
      setCurrent(finalValue);
      state.elapsedMs = playback.reversed ? 0 : state.durationMs;
      if (changed) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    if (state.durationMs <= 0 || Object.is(state.from, state.to)) {
      const finalValue = playback.reversed ? state.from : state.to;
      const changed = !Object.is(currentRef.current, finalValue);
      setCurrent(finalValue);
      state.elapsedMs = playback.reversed ? 0 : state.durationMs;
      if (changed) {
        scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
      }
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    const direction = playback.reversed ? -1 : 1;
    const startDelayMs = state.pendingDelayMs;
    state.pendingDelayMs = 0;

    runTimerLoop({
      timerRef,
      delayMs: startDelayMs,
      onStart: () => {
        lastTickMsRef.current = nowMs() - ANIMATION_FRAME_MS;
        return true;
      },
      sampleOnStart: true,
      onTick: () => {
        const stepNowMs = nowMs();
        const prevMs = lastTickMsRef.current ?? stepNowMs;
        lastTickMsRef.current = stepNowMs;
        const deltaMs = Math.max(0, stepNowMs - prevMs) * playback.rate;
        state.elapsedMs += deltaMs * direction;
        if (state.elapsedMs < 0) state.elapsedMs = 0;
        if (state.elapsedMs > state.durationMs) state.elapsedMs = state.durationMs;

        const progress = state.durationMs <= 0 ? 1 : clamp01(state.elapsedMs / state.durationMs);
        const next = interpolateNumber(state.from, state.to, state.easing(progress));
        const done = playback.reversed ? state.elapsedMs <= 0 : state.elapsedMs >= state.durationMs;

        if (done) {
          const finalValue = playback.reversed ? state.from : state.to;
          setCurrent(finalValue);
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          return false;
        }

        setCurrent(next);
        return true;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [delayMs, durationMs, easing, playback.paused, playback.rate, playback.reversed, value]);

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
  const delayMs = normalizeDurationMs(config.delay, 0);

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
    lastStepMsRef.current = null;

    runTimerLoop({
      timerRef,
      delayMs,
      onStart: () => {
        lastStepMsRef.current = nowMs();

        if (!Number.isFinite(targetRef.current) || !Number.isFinite(valueRef.current)) {
          velocityRef.current = 0;
          const changed = !Object.is(valueRef.current, targetRef.current);
          setCurrent(targetRef.current);
          if (changed) {
            scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          }
          return false;
        }

        if (
          isSpringAtRest(valueRef.current, targetRef.current, velocityRef.current, springConfig)
        ) {
          velocityRef.current = 0;
          const changed = !Object.is(valueRef.current, targetRef.current);
          if (changed) {
            setCurrent(targetRef.current);
            scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          }
          return false;
        }

        return true;
      },
      onTick: () => {
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
          return false;
        }

        setCurrent(step.value);
        return true;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [delayMs, springConfig, target]);

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
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;

  const playback = normalizePlayback(config.playback);
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

  const sequenceSignatureRef = ctx.useRef<string>(signature);
  const sequenceElapsedMsRef = ctx.useRef<number>(
    playback.reversed && config.loop !== true ? sequence.totalDurationMs : 0,
  );
  if (sequenceSignatureRef.current !== signature) {
    sequenceSignatureRef.current = signature;
    sequenceElapsedMsRef.current =
      playback.reversed && config.loop !== true ? sequence.totalDurationMs : 0;
  }

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

    if (playback.paused) {
      lastStepMsRef.current = null;
      return () => {
        invalidateAnimationRun(completionRef, runId);
      };
    }

    const loop = config.loop === true;
    const direction = playback.reversed ? -1 : 1;

    runTimerLoop({
      timerRef,
      delayMs: 0,
      onStart: () => {
        lastStepMsRef.current = nowMs() - ANIMATION_FRAME_MS;
        return true;
      },
      sampleOnStart: true,
      onTick: () => {
        const stepNowMs = nowMs();
        const prevMs = lastStepMsRef.current ?? stepNowMs;
        lastStepMsRef.current = stepNowMs;
        const deltaMs = Math.max(0, stepNowMs - prevMs) * playback.rate;
        sequenceElapsedMsRef.current += deltaMs * direction;

        if (loop) {
          const sample = sampleSequence(sequence, sequenceElapsedMsRef.current, true);
          setCurrent(sample.value);
          return true;
        }

        if (playback.reversed && sequenceElapsedMsRef.current <= 0) {
          sequenceElapsedMsRef.current = 0;
          setCurrent(sequence.initialValue);
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          return false;
        }

        if (!playback.reversed && sequenceElapsedMsRef.current >= sequence.totalDurationMs) {
          sequenceElapsedMsRef.current = sequence.totalDurationMs;
          setCurrent(sequence.finalValue);
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          return false;
        }

        const sample = sampleSequence(sequence, sequenceElapsedMsRef.current, false);
        setCurrent(sample.value);
        return true;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [config.loop, playback.paused, playback.rate, playback.reversed, sequence, signature]);

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

    runTimerLoop({
      timerRef,
      delayMs: 0,
      onTick: () => {
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
          return false;
        }
        return true;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [count, delayMs, durationMs, easing]);

  return progresses;
}

/**
 * Compose transition or spring animation state for a numeric value.
 */
export function useAnimatedValue(
  ctx: AnimationHookContext,
  target: number,
  config: UseAnimatedValueConfig = { mode: "transition" },
): AnimatedValue {
  const mode = config.mode;
  const transitionConfig = config.transition ?? {};
  const springConfigInput = config.spring ?? {};

  const [animated, setAnimated] = ctx.useState<AnimatedValue>(() =>
    createAnimatedValue(target, 0, false),
  );
  const timerRef = ctx.useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = ctx.useRef<number>(animated.value);
  const velocityRef = ctx.useRef<number>(animated.velocity);
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });

  valueRef.current = animated.value;
  velocityRef.current = animated.velocity;

  const onCompleteRef = ctx.useRef<(() => void) | undefined>(
    mode === "spring" ? springConfigInput.onComplete : transitionConfig.onComplete,
  );
  onCompleteRef.current =
    mode === "spring" ? springConfigInput.onComplete : transitionConfig.onComplete;

  const delayMs =
    mode === "spring"
      ? normalizeDurationMs(springConfigInput.delay, 0)
      : normalizeDurationMs(transitionConfig.delay, 0);
  const durationMs = normalizeDurationMs(transitionConfig.duration, DEFAULT_TRANSITION_DURATION_MS);
  const easing = ctx.useMemo(
    () => resolveEasing(transitionConfig.easing),
    [transitionConfig.easing],
  );
  const playback = normalizePlayback(transitionConfig.playback);
  const springConfig: NormalizedSpringConfig = ctx.useMemo(
    () => normalizeSpringConfig(springConfigInput),
    [
      springConfigInput.stiffness,
      springConfigInput.damping,
      springConfigInput.mass,
      springConfigInput.restDelta,
      springConfigInput.restSpeed,
      springConfigInput.maxDeltaMs,
    ],
  );

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);

    if (mode === "transition") {
      const from = valueRef.current;
      const to = target;
      const initialElapsedMs = playback.reversed ? durationMs : 0;
      let elapsedMs = initialElapsedMs;

      if (playback.paused) {
        return () => {
          invalidateAnimationRun(completionRef, runId);
        };
      }

      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        const finalValue = playback.reversed ? from : to;
        setAnimated(createAnimatedValue(finalValue, 0, false));
        if (!Object.is(from, finalValue)) {
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        }
        return () => {
          invalidateAnimationRun(completionRef, runId);
        };
      }

      if (durationMs <= 0 || Object.is(from, to)) {
        const finalValue = playback.reversed ? from : to;
        setAnimated(createAnimatedValue(finalValue, 0, false));
        if (!Object.is(from, finalValue)) {
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        }
        return () => {
          invalidateAnimationRun(completionRef, runId);
        };
      }

      const direction = playback.reversed ? -1 : 1;
      runTimerLoop({
        timerRef,
        delayMs,
        onStart: () => {
          lastStepMsRef.current = nowMs() - ANIMATION_FRAME_MS;
          setAnimated(createAnimatedValue(from, 0, true));
          return true;
        },
        sampleOnStart: true,
        onTick: () => {
          const stepNowMs = nowMs();
          const prevMs = lastStepMsRef.current ?? stepNowMs;
          lastStepMsRef.current = stepNowMs;
          const deltaMs = Math.max(0, stepNowMs - prevMs) * playback.rate;
          elapsedMs += deltaMs * direction;
          if (elapsedMs < 0) elapsedMs = 0;
          if (elapsedMs > durationMs) elapsedMs = durationMs;

          const progress = clamp01(elapsedMs / durationMs);
          const nextValue = interpolateNumber(from, to, easing(progress));
          const done = playback.reversed ? elapsedMs <= 0 : elapsedMs >= durationMs;
          if (done) {
            const finalValue = playback.reversed ? from : to;
            setAnimated(createAnimatedValue(finalValue, 0, false));
            scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
            return false;
          }

          setAnimated(createAnimatedValue(nextValue, 0, true));
          return true;
        },
      });

      return () => {
        clearAnimationTimer(timerRef);
        invalidateAnimationRun(completionRef, runId);
      };
    }

    runTimerLoop({
      timerRef,
      delayMs,
      onStart: () => {
        lastStepMsRef.current = nowMs();
        if (!Number.isFinite(target) || !Number.isFinite(valueRef.current)) {
          setAnimated(createAnimatedValue(target, 0, false));
          if (!Object.is(valueRef.current, target)) {
            scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          }
          return false;
        }

        if (isSpringAtRest(valueRef.current, target, velocityRef.current, springConfig)) {
          setAnimated(createAnimatedValue(target, 0, false));
          if (!Object.is(valueRef.current, target)) {
            scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          }
          return false;
        }

        setAnimated(createAnimatedValue(valueRef.current, velocityRef.current, true));
        return true;
      },
      onTick: () => {
        const stepNowMs = nowMs();
        const prevMs = lastStepMsRef.current ?? stepNowMs;
        lastStepMsRef.current = stepNowMs;
        const dtMs = Math.max(1, Math.min(springConfig.maxDeltaMs, stepNowMs - prevMs));
        const step = stepSpring(
          { value: valueRef.current, velocity: velocityRef.current },
          target,
          dtMs / 1000,
          springConfig,
        );

        if (step.done) {
          setAnimated(createAnimatedValue(step.value, 0, false));
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
          return false;
        }

        setAnimated(createAnimatedValue(step.value, step.velocity, true));
        return true;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
      invalidateAnimationRun(completionRef, runId);
    };
  }, [
    delayMs,
    durationMs,
    easing,
    mode,
    playback.paused,
    playback.rate,
    playback.reversed,
    springConfig,
    target,
  ]);

  return animated;
}

/**
 * Run multiple transitions in parallel.
 */
export function useParallel(
  ctx: AnimationHookContext,
  animations: UseParallelConfig,
): readonly ParallelAnimationEntry[] {
  const signature = ctx.useMemo(() => {
    const parts: string[] = [];
    for (const animation of animations) {
      parts.push(
        [
          String(animation.target),
          String(animation.config?.delay ?? ""),
          String(animation.config?.duration ?? ""),
          String(animation.config?.easing ?? ""),
          String(animation.config?.playback?.paused ?? ""),
          String(animation.config?.playback?.reversed ?? ""),
          String(animation.config?.playback?.rate ?? ""),
        ].join(":"),
      );
    }
    return parts.join("|");
  }, [animations]);

  const [entries, setEntries] = ctx.useState<readonly ParallelAnimationEntry[]>(() =>
    Object.freeze(animations.map(() => createParallelEntry(0, false))),
  );
  const entriesRef = ctx.useRef(entries);
  const timerRef = ctx.useRef<ReturnType<typeof setTimeout> | null>(null);
  entriesRef.current = entries;

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);

    if (animations.length === 0) {
      setEntries(Object.freeze([]));
      return;
    }

    const startMs = nowMs();
    const tracks = animations.map((animation, index) => {
      const from = entriesRef.current[index]?.value ?? 0;
      const to = animation.target;
      const durationMs = normalizeDurationMs(
        animation.config?.duration,
        DEFAULT_TRANSITION_DURATION_MS,
      );
      const delayMs = normalizeDurationMs(animation.config?.delay, 0);
      const easing = resolveEasing(animation.config?.easing);
      const playback = normalizePlayback(animation.config?.playback);
      const onComplete = animation.config?.onComplete;
      return {
        from,
        to,
        durationMs,
        delayMs,
        easing,
        playback,
        onComplete,
        completed: false,
      };
    });

    runTimerLoop({
      timerRef,
      delayMs: 0,
      onTick: () => {
        const elapsedMs = nowMs() - startMs;
        let activeCount = 0;
        const nextEntries: ParallelAnimationEntry[] = new Array(tracks.length);

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (!track) continue;
          if (track.playback.paused) {
            nextEntries[i] = createParallelEntry(track.from, false);
            continue;
          }

          const localElapsedMs = Math.max(0, elapsedMs - track.delayMs);
          const rawProgress =
            track.durationMs <= 0
              ? 1
              : clamp01((localElapsedMs * track.playback.rate) / track.durationMs);
          const progress = track.playback.reversed ? 1 - rawProgress : rawProgress;
          const nextValue = interpolateNumber(track.from, track.to, track.easing(progress));
          const finished = track.playback.reversed ? rawProgress >= 1 : rawProgress >= 1;

          const isAnimating = !track.playback.paused && !finished;
          if (isAnimating) activeCount++;

          if (finished && !track.completed) {
            track.completed = true;
            track.onComplete?.();
          }

          nextEntries[i] = createParallelEntry(
            finished ? (track.playback.reversed ? track.from : track.to) : nextValue,
            isAnimating,
          );
        }

        setEntries(Object.freeze(nextEntries));
        return activeCount > 0;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
    };
  }, [signature]);

  return entries;
}

/**
 * Run transition steps sequentially.
 */
export function useChain(
  ctx: AnimationHookContext,
  steps: UseChainConfig,
): Readonly<{ value: number; currentStep: number; isComplete: boolean }> {
  const stepsRef = ctx.useRef<UseChainConfig>(steps);
  stepsRef.current = steps;

  const signature = ctx.useMemo(() => {
    const parts: string[] = [];
    for (const step of steps) {
      parts.push(
        [
          String(step.target),
          String(step.config?.delay ?? ""),
          String(step.config?.duration ?? ""),
          String(step.config?.easing ?? ""),
          String(step.config?.playback?.paused ?? ""),
          String(step.config?.playback?.reversed ?? ""),
          String(step.config?.playback?.rate ?? ""),
        ].join(":"),
      );
    }
    return parts.join("|");
  }, [steps]);

  const [currentStep, setCurrentStep] = ctx.useState<number>(0);
  const [currentTarget, setCurrentTarget] = ctx.useState<number>(0);
  const currentStepRef = ctx.useRef<number>(0);
  currentStepRef.current = currentStep;

  ctx.useEffect(() => {
    currentStepRef.current = 0;
    setCurrentStep(0);
    if (stepsRef.current.length === 0) {
      setCurrentTarget(0);
      return;
    }
    setCurrentTarget(stepsRef.current[0]?.target ?? 0);
  }, [signature]);

  const activeStepConfig = currentStep < steps.length ? steps[currentStep]?.config : undefined;
  const value = useTransition(ctx, currentTarget, {
    ...(activeStepConfig ?? {}),
    onComplete: () => {
      const completedStep = currentStepRef.current;
      const completedConfig = stepsRef.current[completedStep]?.config;
      if (!completedConfig && completedStep >= stepsRef.current.length) return;
      completedConfig?.onComplete?.();
      const nextStep = completedStep + 1;
      if (nextStep < stepsRef.current.length) {
        currentStepRef.current = nextStep;
        setCurrentStep(nextStep);
        setCurrentTarget(stepsRef.current[nextStep]?.target ?? 0);
        return;
      }
      currentStepRef.current = stepsRef.current.length;
      setCurrentStep(stepsRef.current.length);
    },
  });

  const isComplete = steps.length === 0 || currentStep >= steps.length;
  return Object.freeze({ value, currentStep, isComplete });
}

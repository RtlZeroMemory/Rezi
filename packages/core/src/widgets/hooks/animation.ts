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
const DEFAULT_PARALLEL_TARGET = 0;

type AnimationLoopHandle =
  | Readonly<{ kind: "timeout"; timerId: ReturnType<typeof setTimeout> }>
  | Readonly<{ kind: "frame"; cancel: () => void }>;

const activeAnimationFrameCallbacks = new Set<() => boolean>();
let animationFrameTimer: ReturnType<typeof setTimeout> | null = null;

function nowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = perf?.now;
  if (typeof perfNow === "function") return perfNow.call(perf);
  return Date.now();
}

function warnDev(message: string): void {
  const consoleRef = (globalThis as { console?: { warn?: (message: string) => void } }).console;
  consoleRef?.warn?.(message);
}

function describeThrown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return String(value);
  } catch {
    return "[unstringifiable thrown value]";
  }
}

function safeInvokeAnimationCallback(callback: (() => void) | undefined): void {
  if (!callback) return;
  try {
    callback();
  } catch (error: unknown) {
    warnDev(`[rezi][animation] onComplete callback threw: ${describeThrown(error)}`);
  }
}

function scheduleSharedAnimationFrame(): void {
  if (animationFrameTimer !== null || activeAnimationFrameCallbacks.size === 0) return;
  animationFrameTimer = setTimeout(() => {
    animationFrameTimer = null;
    const callbacks = Array.from(activeAnimationFrameCallbacks);
    for (const callback of callbacks) {
      if (!activeAnimationFrameCallbacks.has(callback)) continue;
      if (!callback()) {
        activeAnimationFrameCallbacks.delete(callback);
      }
    }
    if (activeAnimationFrameCallbacks.size > 0) {
      scheduleSharedAnimationFrame();
    }
  }, ANIMATION_FRAME_MS);
}

function subscribeAnimationFrames(callback: () => boolean): () => void {
  activeAnimationFrameCallbacks.add(callback);
  scheduleSharedAnimationFrame();
  return () => {
    activeAnimationFrameCallbacks.delete(callback);
    if (activeAnimationFrameCallbacks.size === 0 && animationFrameTimer !== null) {
      clearTimeout(animationFrameTimer);
      animationFrameTimer = null;
    }
  };
}

function clearAnimationTimer(ref: { current: AnimationLoopHandle | null }): void {
  const handle = ref.current;
  if (handle === null) return;
  if (handle.kind === "timeout") {
    clearTimeout(handle.timerId);
  } else {
    handle.cancel();
  }
  ref.current = null;
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
    safeInvokeAnimationCallback(onCompleteRef.current);
  }, 0);
}

type TimerLoopOptions = Readonly<{
  timerRef: { current: AnimationLoopHandle | null };
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
      const keepRunning = options.onTick();
      if (!keepRunning) {
        options.timerRef.current = null;
      }
      return keepRunning;
    };

    if (options.sampleOnStart === true) {
      if (!options.onTick()) {
        options.timerRef.current = null;
        return;
      }
    }

    options.timerRef.current = Object.freeze({
      kind: "frame",
      cancel: subscribeAnimationFrames(tick),
    });
  };

  if (options.delayMs > 0) {
    options.timerRef.current = Object.freeze({
      kind: "timeout",
      timerId: setTimeout(() => {
        options.timerRef.current = null;
        start();
      }, options.delayMs),
    });
    return;
  }

  start();
}

function normalizedDelayMs(value: number | undefined): number {
  return normalizeDurationMs(value, 0);
}

function normalizedTransitionDurationMs(value: number | undefined): number {
  return normalizeDurationMs(value, DEFAULT_TRANSITION_DURATION_MS);
}

function playbackControlEqual(
  a: PlaybackControl | undefined,
  b: PlaybackControl | undefined,
): boolean {
  const left = normalizePlayback(a);
  const right = normalizePlayback(b);
  return (
    left.paused === right.paused &&
    left.reversed === right.reversed &&
    Object.is(left.rate, right.rate)
  );
}

function transitionMotionEqual(
  a: Readonly<{ target: number; config?: TransitionConfig }>,
  b: Readonly<{ target: number; config?: TransitionConfig }>,
): boolean {
  return (
    Object.is(a.target, b.target) &&
    normalizedDelayMs(a.config?.delay) === normalizedDelayMs(b.config?.delay) &&
    normalizedTransitionDurationMs(a.config?.duration) ===
      normalizedTransitionDurationMs(b.config?.duration) &&
    Object.is(a.config?.easing, b.config?.easing)
  );
}

function sequenceKeyframeEqual(a: SequenceKeyframe, b: SequenceKeyframe): boolean {
  if (typeof a === "number" || typeof b === "number") {
    return typeof a === "number" && typeof b === "number" && Object.is(a, b);
  }
  return (
    Object.is(a.value, b.value) &&
    normalizedTransitionDurationMs(a.duration) === normalizedTransitionDurationMs(b.duration) &&
    Object.is(a.easing, b.easing)
  );
}

function sequenceInputsEqual(
  prevKeyframes: readonly SequenceKeyframe[],
  nextKeyframes: readonly SequenceKeyframe[],
  prevConfig: Readonly<{
    duration: UseSequenceConfig["duration"];
    easing: UseSequenceConfig["easing"];
    loop: boolean;
  }>,
  nextConfig: Readonly<{
    duration: UseSequenceConfig["duration"];
    easing: UseSequenceConfig["easing"];
    loop: boolean;
  }>,
): boolean {
  if (prevKeyframes.length !== nextKeyframes.length) return false;
  for (let i = 0; i < prevKeyframes.length; i++) {
    const prevFrame = prevKeyframes[i];
    const nextFrame = nextKeyframes[i];
    if (prevFrame === undefined || nextFrame === undefined) return false;
    if (!sequenceKeyframeEqual(prevFrame, nextFrame)) return false;
  }
  return (
    normalizedTransitionDurationMs(prevConfig.duration) ===
      normalizedTransitionDurationMs(nextConfig.duration) &&
    Object.is(prevConfig.easing, nextConfig.easing) &&
    (prevConfig.loop === true) === (nextConfig.loop === true)
  );
}

function shallowItemsEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function transitionStepsEqual(
  prev: readonly Readonly<{ target: number; config?: TransitionConfig }>[],
  next: readonly Readonly<{ target: number; config?: TransitionConfig }>[],
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const prevEntry = prev[i];
    const nextEntry = next[i];
    if (!prevEntry || !nextEntry) return false;
    if (!transitionMotionEqual(prevEntry, nextEntry)) return false;
  }
  return true;
}

function transitionPlaybackStepsEqual(
  prev: readonly Readonly<{ target: number; config?: TransitionConfig }>[],
  next: readonly Readonly<{ target: number; config?: TransitionConfig }>[],
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const prevEntry = prev[i];
    const nextEntry = next[i];
    if (!prevEntry || !nextEntry) return false;
    if (!playbackControlEqual(prevEntry.config?.playback, nextEntry.config?.playback)) {
      return false;
    }
  }
  return true;
}

type SequenceInputSnapshot = Readonly<{
  keyframes: readonly SequenceKeyframe[];
  duration: number | undefined;
  easing: UseSequenceConfig["easing"] | undefined;
  loop: boolean;
}>;

type AnimationListSnapshot<T extends Readonly<{ target: number; config?: TransitionConfig }>> =
  readonly T[];

function zeroProgressEntries(count: number): readonly ParallelAnimationEntry[] {
  return Object.freeze(new Array(count).fill(undefined).map(() => createParallelEntry(0, false)));
}

function zeroProgressVector(count: number): readonly number[] {
  return Object.freeze(new Array<number>(count).fill(0));
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
  delayMs: number;
  easing: (t: number) => number;
  pendingDelayMs: number;
};

type ParallelTrackState = TransitionRunState & {
  completed: boolean;
  easingInput: TransitionConfig["easing"];
};

type TransitionStepResult = Readonly<{
  done: boolean;
  value: number;
  waiting: boolean;
}>;

function syncTransitionRunState(
  state: TransitionRunState,
  currentValue: number,
  target: number,
  durationMs: number,
  easing: (t: number) => number,
  delayMs: number,
  reversed: boolean,
): void {
  const shouldReset =
    !state.initialized ||
    !Object.is(state.to, target) ||
    state.durationMs !== durationMs ||
    state.delayMs !== delayMs ||
    state.easing !== easing;

  if (shouldReset) {
    state.initialized = true;
    state.from = currentValue;
    state.to = target;
    state.durationMs = durationMs;
    state.delayMs = delayMs;
    state.easing = easing;
    state.elapsedMs = reversed ? durationMs : 0;
    state.pendingDelayMs = delayMs;
    return;
  }

  state.durationMs = durationMs;
  state.delayMs = delayMs;
  state.easing = easing;
  if (state.elapsedMs < 0) state.elapsedMs = 0;
  if (state.elapsedMs > state.durationMs) state.elapsedMs = state.durationMs;
  if (state.pendingDelayMs < 0) state.pendingDelayMs = 0;
}

function currentTransitionValue(state: TransitionRunState): number {
  const progress = state.durationMs <= 0 ? 1 : clamp01(state.elapsedMs / state.durationMs);
  return interpolateNumber(state.from, state.to, state.easing(progress));
}

function transitionFinalValue(state: TransitionRunState, reversed: boolean): number {
  return reversed ? state.from : state.to;
}

function stepTransitionRunState(
  state: TransitionRunState,
  deltaMs: number,
  reversed: boolean,
): TransitionStepResult {
  let remainingDeltaMs = deltaMs;
  if (state.pendingDelayMs > 0) {
    if (remainingDeltaMs < state.pendingDelayMs) {
      state.pendingDelayMs -= remainingDeltaMs;
      return { done: false, value: state.from, waiting: true };
    }
    remainingDeltaMs -= state.pendingDelayMs;
    state.pendingDelayMs = 0;
  }

  state.elapsedMs += remainingDeltaMs * (reversed ? -1 : 1);
  if (state.elapsedMs < 0) state.elapsedMs = 0;
  if (state.elapsedMs > state.durationMs) state.elapsedMs = state.durationMs;

  return {
    done: reversed ? state.elapsedMs <= 0 : state.elapsedMs >= state.durationMs,
    value: currentTransitionValue(state),
    waiting: false,
  };
}

function parallelEntriesEqual(
  a: readonly ParallelAnimationEntry[],
  b: readonly ParallelAnimationEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (!Object.is(left.value, right.value) || left.isAnimating !== right.isAnimating) {
      return false;
    }
  }
  return true;
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
  const timerRef = ctx.useRef<AnimationLoopHandle | null>(null);
  const currentRef = ctx.useRef<number>(current);
  const lastTickMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  currentRef.current = current;

  const delayMs = normalizedDelayMs(config.delay);
  const durationMs = normalizedTransitionDurationMs(config.duration);
  const easing = ctx.useMemo(() => resolveEasing(config.easing), [config.easing]);
  const playback = normalizePlayback(config.playback);
  const transitionStateRef = ctx.useRef<TransitionRunState>({
    initialized: false,
    from: value,
    to: value,
    elapsedMs: 0,
    durationMs,
    delayMs,
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
      state.delayMs !== delayMs ||
      state.easing !== easing;

    if (shouldReset) {
      state.initialized = true;
      state.from = currentRef.current;
      state.to = value;
      state.durationMs = durationMs;
      state.delayMs = delayMs;
      state.easing = easing;
      state.elapsedMs = playback.reversed ? durationMs : 0;
      state.pendingDelayMs = delayMs;
    } else {
      state.durationMs = durationMs;
      state.delayMs = delayMs;
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
  const timerRef = ctx.useRef<AnimationLoopHandle | null>(null);
  const valueRef = ctx.useRef<number>(current);
  const velocityRef = ctx.useRef<number>(0);
  const targetRef = ctx.useRef<number>(target);
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  valueRef.current = current;
  targetRef.current = target;
  const delayMs = normalizedDelayMs(config.delay);

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
  const timerRef = ctx.useRef<AnimationLoopHandle | null>(null);
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;

  const playback = normalizePlayback(config.playback);
  const sequenceInputRef = ctx.useRef<SequenceInputSnapshot | null>(null);
  const sequenceVersionRef = ctx.useRef(0);
  const nextSequenceInput: SequenceInputSnapshot = Object.freeze({
    keyframes,
    duration: config.duration,
    easing: config.easing,
    loop: config.loop === true,
  });
  if (
    sequenceInputRef.current === null ||
    !sequenceInputsEqual(
      sequenceInputRef.current.keyframes,
      nextSequenceInput.keyframes,
      sequenceInputRef.current,
      nextSequenceInput,
    )
  ) {
    sequenceInputRef.current = nextSequenceInput;
    sequenceVersionRef.current += 1;
  }
  const sequenceVersion = sequenceVersionRef.current;
  const sequenceInput = sequenceInputRef.current ?? nextSequenceInput;

  const sequence = ctx.useMemo(
    () =>
      normalizeSequence(sequenceInput.keyframes, {
        ...(sequenceInput.duration === undefined ? {} : { duration: sequenceInput.duration }),
        ...(sequenceInput.easing === undefined ? {} : { easing: sequenceInput.easing }),
      }),
    [sequenceVersion],
  );

  const sequenceVersionAppliedRef = ctx.useRef<number>(sequenceVersion);
  const sequenceElapsedMsRef = ctx.useRef<number>(
    playback.reversed && config.loop !== true ? sequence.totalDurationMs : 0,
  );
  if (sequenceVersionAppliedRef.current !== sequenceVersion) {
    sequenceVersionAppliedRef.current = sequenceVersion;
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
  }, [config.loop, playback.paused, playback.rate, playback.reversed, sequence, sequenceVersion]);

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
  const timerRef = ctx.useRef<AnimationLoopHandle | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const onCompleteRef = ctx.useRef<(() => void) | undefined>(config.onComplete);
  onCompleteRef.current = config.onComplete;
  const itemsRef = ctx.useRef(items);
  const itemsVersionRef = ctx.useRef(0);
  if (!shallowItemsEqual(itemsRef.current, items)) {
    itemsRef.current = items;
    itemsVersionRef.current += 1;
  }
  const count = items.length;
  const itemsVersion = itemsVersionRef.current;
  const delayMs = normalizeDurationMs(config.delay, 40);
  const durationMs = normalizeDurationMs(config.duration, 180);
  const easing = ctx.useMemo(() => resolveEasing(config.easing), [config.easing]);
  const [progresses, setProgresses] = ctx.useState<readonly number[]>(() =>
    zeroProgressVector(count),
  );

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    const runId = beginAnimationRun(completionRef);

    if (count <= 0) {
      setProgresses(Object.freeze([]));
      return;
    }

    setProgresses(zeroProgressVector(count));
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
  }, [count, delayMs, durationMs, easing, itemsVersion]);

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
  const timerRef = ctx.useRef<AnimationLoopHandle | null>(null);
  const valueRef = ctx.useRef<number>(animated.value);
  const velocityRef = ctx.useRef<number>(animated.velocity);
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const completionRef = ctx.useRef<AnimationCompletionState>({ runId: 0, completedRunId: 0 });
  const transitionStateRef = ctx.useRef<TransitionRunState>({
    initialized: false,
    from: target,
    to: target,
    elapsedMs: 0,
    durationMs: normalizedTransitionDurationMs(transitionConfig.duration),
    delayMs: normalizedDelayMs(transitionConfig.delay),
    easing: resolveEasing(transitionConfig.easing),
    pendingDelayMs: 0,
  });
  const previousModeRef = ctx.useRef<typeof mode>(mode);

  valueRef.current = animated.value;
  velocityRef.current = animated.velocity;

  if (previousModeRef.current !== mode) {
    previousModeRef.current = mode;
    transitionStateRef.current.initialized = false;
    lastStepMsRef.current = null;
  }

  const onCompleteRef = ctx.useRef<(() => void) | undefined>(
    mode === "spring" ? springConfigInput.onComplete : transitionConfig.onComplete,
  );
  onCompleteRef.current =
    mode === "spring" ? springConfigInput.onComplete : transitionConfig.onComplete;

  const delayMs =
    mode === "spring"
      ? normalizedDelayMs(springConfigInput.delay)
      : normalizedDelayMs(transitionConfig.delay);
  const durationMs = normalizedTransitionDurationMs(transitionConfig.duration);
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
      const state = transitionStateRef.current;
      const shouldReset =
        !state.initialized ||
        !Object.is(state.to, target) ||
        state.durationMs !== durationMs ||
        state.delayMs !== delayMs ||
        state.easing !== easing;

      if (shouldReset) {
        state.initialized = true;
        state.from = valueRef.current;
        state.to = target;
        state.durationMs = durationMs;
        state.delayMs = delayMs;
        state.easing = easing;
        state.elapsedMs = playback.reversed ? durationMs : 0;
        state.pendingDelayMs = delayMs;
      } else {
        state.durationMs = durationMs;
        state.delayMs = delayMs;
        state.easing = easing;
        if (state.elapsedMs < 0) state.elapsedMs = 0;
        if (state.elapsedMs > state.durationMs) state.elapsedMs = state.durationMs;
      }

      if (playback.paused) {
        lastStepMsRef.current = null;
        setAnimated(createAnimatedValue(valueRef.current, 0, false));
        return () => {
          invalidateAnimationRun(completionRef, runId);
        };
      }

      if (!Number.isFinite(state.from) || !Number.isFinite(state.to)) {
        const finalValue = playback.reversed ? state.from : state.to;
        setAnimated(createAnimatedValue(finalValue, 0, false));
        state.elapsedMs = playback.reversed ? 0 : state.durationMs;
        if (!Object.is(valueRef.current, finalValue)) {
          scheduleAnimationCompletion(completionRef, runId, onCompleteRef);
        }
        return () => {
          invalidateAnimationRun(completionRef, runId);
        };
      }

      if (state.durationMs <= 0 || Object.is(state.from, state.to)) {
        const finalValue = playback.reversed ? state.from : state.to;
        setAnimated(createAnimatedValue(finalValue, 0, false));
        state.elapsedMs = playback.reversed ? 0 : state.durationMs;
        if (!Object.is(valueRef.current, finalValue)) {
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
          lastStepMsRef.current = nowMs() - ANIMATION_FRAME_MS;
          setAnimated(createAnimatedValue(valueRef.current, 0, true));
          return true;
        },
        sampleOnStart: true,
        onTick: () => {
          const stepNowMs = nowMs();
          const prevMs = lastStepMsRef.current ?? stepNowMs;
          lastStepMsRef.current = stepNowMs;
          const deltaMs = Math.max(0, stepNowMs - prevMs) * playback.rate;
          state.elapsedMs += deltaMs * direction;
          if (state.elapsedMs < 0) state.elapsedMs = 0;
          if (state.elapsedMs > state.durationMs) state.elapsedMs = state.durationMs;

          const progress = clamp01(state.elapsedMs / state.durationMs);
          const nextValue = interpolateNumber(state.from, state.to, state.easing(progress));
          const done = playback.reversed
            ? state.elapsedMs <= 0
            : state.elapsedMs >= state.durationMs;
          if (done) {
            const finalValue = playback.reversed ? state.from : state.to;
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

    transitionStateRef.current.initialized = false;
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
  const animationsRef = ctx.useRef<AnimationListSnapshot<ParallelAnimationConfig>>(animations);
  const animationsVersionRef = ctx.useRef(0);
  const playbackVersionRef = ctx.useRef(0);
  if (!transitionStepsEqual(animationsRef.current, animations)) {
    animationsRef.current = animations;
    animationsVersionRef.current += 1;
  } else {
    if (!transitionPlaybackStepsEqual(animationsRef.current, animations)) {
      playbackVersionRef.current += 1;
    }
    animationsRef.current = animations;
  }
  const animationsVersion = animationsVersionRef.current;
  const playbackVersion = playbackVersionRef.current;
  const [entries, setEntries] = ctx.useState<readonly ParallelAnimationEntry[]>(() =>
    zeroProgressEntries(animations.length),
  );
  const entriesRef = ctx.useRef(entries);
  const timerRef = ctx.useRef<AnimationLoopHandle | null>(null);
  const lastStepMsRef = ctx.useRef<number | null>(null);
  const trackStatesRef = ctx.useRef<ParallelTrackState[]>([]);
  entriesRef.current = entries;

  ctx.useEffect(() => {
    clearAnimationTimer(timerRef);
    lastStepMsRef.current = null;

    if (animations.length === 0) {
      trackStatesRef.current = [];
      setEntries(Object.freeze([]));
      return;
    }

    const nextShape: ParallelAnimationEntry[] = new Array(animations.length);
    let shapeChanged = entriesRef.current.length !== animations.length;
    const tracks = trackStatesRef.current;
    tracks.length = animations.length;
    for (let i = 0; i < animations.length; i++) {
      const animation = animations[i];
      if (!animation) continue;
      const currentEntry = entriesRef.current[i];
      const currentValue = currentEntry?.value ?? DEFAULT_PARALLEL_TARGET;
      const durationMs = normalizedTransitionDurationMs(animation.config?.duration);
      const delayMs = normalizedDelayMs(animation.config?.delay);
      const easingInput = animation.config?.easing;
      const playback = normalizePlayback(animation.config?.playback);
      const existing = tracks[i];
      if (!existing) {
        const easing = resolveEasing(easingInput);
        tracks[i] = {
          initialized: false,
          from: currentValue,
          to: animation.target,
          elapsedMs: 0,
          durationMs,
          delayMs,
          easing,
          pendingDelayMs: 0,
          completed: false,
          easingInput,
        };
      }
      const state = tracks[i];
      if (!state) continue;
      const easing = Object.is(state.easingInput, easingInput)
        ? state.easing
        : resolveEasing(easingInput);
      const before = {
        initialized: state.initialized,
        to: state.to,
        durationMs: state.durationMs,
        delayMs: state.delayMs,
        easing: state.easing,
      };
      syncTransitionRunState(
        state,
        currentValue,
        animation.target,
        durationMs,
        easing,
        delayMs,
        playback.reversed,
      );
      const motionChanged =
        !before.initialized ||
        !Object.is(before.to, state.to) ||
        before.durationMs !== state.durationMs ||
        before.delayMs !== state.delayMs ||
        before.easing !== state.easing;
      if (motionChanged) {
        state.completed = false;
      }
      state.easingInput = easingInput;
      const nextValue = motionChanged ? currentValue : (currentEntry?.value ?? currentValue);
      nextShape[i] = createParallelEntry(nextValue, false);
      if (
        !shapeChanged &&
        (!currentEntry ||
          !Object.is(currentEntry.value, nextShape[i]?.value ?? DEFAULT_PARALLEL_TARGET) ||
          currentEntry.isAnimating !== false)
      ) {
        shapeChanged = true;
      }
    }
    if (shapeChanged) {
      const frozenShape = Object.freeze(nextShape);
      setEntries((prev) => (parallelEntriesEqual(prev, frozenShape) ? prev : frozenShape));
    }

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
        let activeCount = 0;
        const nextEntries: ParallelAnimationEntry[] = new Array(tracks.length);

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (!track) continue;
          const animation = animationsRef.current[i];
          const playback = normalizePlayback(animation?.config?.playback);
          const currentValue = entriesRef.current[i]?.value ?? track.from;
          if (playback.paused) {
            nextEntries[i] = createParallelEntry(currentValue, false);
            continue;
          }
          if (!Number.isFinite(track.from) || !Number.isFinite(track.to)) {
            const finalValue = transitionFinalValue(track, playback.reversed);
            if (!track.completed && !Object.is(currentValue, finalValue)) {
              track.completed = true;
              safeInvokeAnimationCallback(animation?.config?.onComplete);
            }
            nextEntries[i] = createParallelEntry(finalValue, false);
            continue;
          }
          if (track.durationMs <= 0 || Object.is(track.from, track.to)) {
            const finalValue = transitionFinalValue(track, playback.reversed);
            if (!track.completed && !Object.is(currentValue, finalValue)) {
              track.completed = true;
              safeInvokeAnimationCallback(animation?.config?.onComplete);
            }
            nextEntries[i] = createParallelEntry(finalValue, false);
            continue;
          }

          const step = stepTransitionRunState(
            track,
            Math.max(0, stepNowMs - prevMs) * playback.rate,
            playback.reversed,
          );
          if (step.waiting) {
            activeCount++;
            nextEntries[i] = createParallelEntry(currentValue, true);
            continue;
          }
          if (step.done) {
            const finalValue = transitionFinalValue(track, playback.reversed);
            if (!track.completed) {
              track.completed = true;
              safeInvokeAnimationCallback(animation?.config?.onComplete);
            }
            nextEntries[i] = createParallelEntry(finalValue, false);
            continue;
          }

          track.completed = false;
          activeCount++;
          nextEntries[i] = createParallelEntry(step.value, true);
        }

        const frozen = Object.freeze(nextEntries);
        setEntries((prev) => (parallelEntriesEqual(prev, frozen) ? prev : frozen));
        return activeCount > 0;
      },
    });

    return () => {
      clearAnimationTimer(timerRef);
    };
  }, [animationsVersion, playbackVersion, animations.length]);

  return entries;
}

/**
 * Run transition steps sequentially.
 */
export function useChain(
  ctx: AnimationHookContext,
  steps: UseChainConfig,
): Readonly<{ value: number; currentStep: number; isComplete: boolean }> {
  const stepsRef = ctx.useRef<AnimationListSnapshot<ChainAnimationConfig>>(steps);
  const stepsVersionRef = ctx.useRef(0);
  if (!transitionStepsEqual(stepsRef.current, steps)) {
    stepsRef.current = steps;
    stepsVersionRef.current += 1;
  } else {
    stepsRef.current = steps;
  }
  const stepsVersion = stepsVersionRef.current;

  const [currentStep, setCurrentStep] = ctx.useState<number>(0);
  const [currentTarget, setCurrentTarget] = ctx.useState<number>(DEFAULT_PARALLEL_TARGET);
  const currentStepRef = ctx.useRef<number>(0);
  currentStepRef.current = currentStep;

  ctx.useEffect(() => {
    currentStepRef.current = 0;
    setCurrentStep(0);
    if (stepsRef.current.length === 0) {
      setCurrentTarget(DEFAULT_PARALLEL_TARGET);
      return;
    }
    setCurrentTarget(stepsRef.current[0]?.target ?? DEFAULT_PARALLEL_TARGET);
  }, [stepsVersion]);

  const activeStepConfig = currentStep < steps.length ? steps[currentStep]?.config : undefined;
  const value = useTransition(ctx, currentTarget, {
    ...(activeStepConfig ?? {}),
    onComplete: () => {
      const completedStep = currentStepRef.current;
      const completedConfig = stepsRef.current[completedStep]?.config;
      if (!completedConfig && completedStep >= stepsRef.current.length) return;
      safeInvokeAnimationCallback(completedConfig?.onComplete);
      const nextStep = completedStep + 1;
      if (nextStep < stepsRef.current.length) {
        currentStepRef.current = nextStep;
        setCurrentStep(nextStep);
        setCurrentTarget(stepsRef.current[nextStep]?.target ?? DEFAULT_PARALLEL_TARGET);
        return;
      }
      currentStepRef.current = stepsRef.current.length;
      setCurrentStep(stepsRef.current.length);
    },
  });

  const isComplete = steps.length === 0 || currentStep >= steps.length;
  return Object.freeze({ value, currentStep, isComplete });
}

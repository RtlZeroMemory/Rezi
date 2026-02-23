/**
 * packages/core/src/widgets/composition.ts — Widget composition API.
 *
 * Why: Provides defineWidget for creating reusable components with local state
 * and lifecycle. Enables building complex UIs from composable, stateful widgets
 * while maintaining the declarative nature of the VNode tree.
 *
 * Key concepts:
 *   - defineWidget: Creates a widget factory with per-instance state
 *   - WidgetContext: Provides hooks for state, refs, effects, and app state
 *   - Scoped IDs: Each instance gets unique ID prefixes
 *   - Hook rules: Hooks must be called in consistent order each render
 *
 * @see docs/guide/composition.md (GitHub issue #116)
 */

import { resolveEasing } from "../animation/easing.js";
import { clamp01, interpolateNumber, normalizeDurationMs } from "../animation/interpolate.js";
import {
  type NormalizedSpringConfig,
  isSpringAtRest,
  normalizeSpringConfig,
  stepSpring,
} from "../animation/spring.js";
import { normalizeSequence, sampleSequence } from "../animation/timeline.js";
import type {
  SequenceConfig,
  SequenceKeyframe,
  SpringConfig,
  StaggerConfig,
  TransitionConfig,
} from "../animation/types.js";
import type { ResponsiveViewportSnapshot } from "../layout/responsive.js";
import type { VNode } from "./types.js";

/* ========== Widget Context Type ========== */

type UnknownCallback = (...args: never[]) => unknown;

/**
 * Context provided to widget render functions.
 * Contains hooks for managing local state and side effects.
 */
export type WidgetContext<State = void> = Readonly<{
  /**
   * Generate a scoped ID unique to this widget instance.
   * Use for interactive widget IDs to prevent collisions.
   *
   * @example
   * ctx.id("button") // Returns "MyWidget_0_button" for instance 0
   */
  id: (suffix: string) => string;

  /**
   * Create local state that persists across renders.
   * Similar to React's useState hook.
   *
   * @param initial - Initial value or lazy initializer function
   * @returns Tuple of [currentValue, setValue]
   *
   * @example
   * const [count, setCount] = ctx.useState(0);
   * const [items, setItems] = ctx.useState(() => loadItems());
   */
  useState: <T>(initial: T | (() => T)) => [T, (v: T | ((prev: T) => T)) => void];

  /**
   * Create a mutable ref that persists across renders without triggering re-renders.
   * Similar to React's useRef hook.
   *
   * @param initial - Initial value for the ref
   * @returns Object with mutable `current` property
   *
   * @example
   * const inputRef = ctx.useRef<string>("");
   */
  useRef: <T>(initial: T) => { current: T };

  /**
   * Memoize a computed value until dependencies change.
   * Matches React `useMemo` dependency semantics (`Object.is` comparison).
   */
  useMemo: <T>(factory: () => T, deps?: readonly unknown[]) => T;

  /**
   * Memoize a callback reference until dependencies change.
   * Matches React `useCallback` dependency semantics (`Object.is` comparison).
   */
  useCallback: <T extends UnknownCallback>(callback: T, deps?: readonly unknown[]) => T;

  /**
   * Register a side effect to run after commit.
   * Similar to React's useEffect hook.
   *
   * @param effect - Effect callback, may return cleanup function
   * @param deps - Dependency array; effect re-runs when deps change
   *
   * @example
   * ctx.useEffect(() => {
   *   const timer = setInterval(tick, 1000);
   *   return () => clearInterval(timer); // Cleanup
   * }, []);
   */
  useEffect: {
    (effect: () => void, deps?: readonly unknown[]): void;
    (effect: () => () => void, deps?: readonly unknown[]): void;
  };

  /**
   * Select a slice of app state with automatic re-render on change.
   * Only available when widget has access to app state.
   *
   * @param selector - Function to extract desired state slice
   * @returns Selected state value
   *
   * @example
   * const userName = ctx.useAppState(s => s.user.name);
   */
  useAppState: <T>(selector: (s: State) => T) => T;

  /**
   * Read current viewport size and responsive breakpoint.
   */
  useViewport?: () => ResponsiveViewportSnapshot;

  /**
   * Request a re-render of this widget instance.
   * Typically called in response to external state changes.
   */
  invalidate: () => void;
}>;

/* ========== Utility Hooks ========== */

/**
 * Minimal context required by `useDebounce`.
 */
type DebounceHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useState">;

/**
 * Minimal context required by `usePrevious`.
 */
type PreviousHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef">;

/**
 * Minimal context required by `useAsync`.
 */
type AsyncHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef" | "useState">;

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

/**
 * Minimal context required by `useStream`.
 */
type StreamHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef" | "useState">;

/**
 * Minimal context required by `useInterval`.
 */
type IntervalHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef">;

/**
 * Minimal context required by `useEventSource`.
 */
type EventSourceHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef" | "useState">;

/**
 * Minimal context required by `useWebSocket`.
 */
type WebSocketHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef" | "useState">;

/**
 * Minimal context required by `useTail`.
 */
type TailHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef" | "useState">;

/**
 * Async state returned by `useAsync`.
 */
export type UseAsyncState<T> = Readonly<{
  data: T | undefined;
  loading: boolean;
  error: unknown;
}>;

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

/**
 * State returned by `useStream`.
 */
export type UseStreamState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  error: unknown;
  done: boolean;
}>;

/**
 * Normalized event payload emitted by `useEventSource`.
 */
export type UseEventSourceMessage = Readonly<{
  type: string;
  data: string;
  lastEventId: string | undefined;
  origin: string | undefined;
}>;

/**
 * Runtime EventSource-like contract used by `useEventSource`.
 */
export type EventSourceLike = Readonly<{
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  close: () => void;
}>;

/**
 * Factory used to create EventSource instances.
 */
export type EventSourceFactory = (
  url: string,
  options: Readonly<{ withCredentials?: boolean }>,
) => EventSourceLike;

/**
 * Options for `useEventSource`.
 */
export type UseEventSourceOptions<T> = Readonly<{
  enabled?: boolean;
  reconnectMs?: number;
  withCredentials?: boolean;
  eventType?: string;
  parse?: (message: UseEventSourceMessage) => T;
  factory?: EventSourceFactory;
}>;

/**
 * State returned by `useEventSource`.
 */
export type UseEventSourceState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  connected: boolean;
  reconnectAttempts: number;
  error: unknown;
}>;

/**
 * Send payload types accepted by `useWebSocket`.
 */
export type WebSocketSendPayload = string | ArrayBuffer | ArrayBufferView;

/**
 * Runtime WebSocket-like contract used by `useWebSocket`.
 */
export type WebSocketLike = Readonly<{
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  send: (payload: WebSocketSendPayload) => void;
  close: (code?: number, reason?: string) => void;
}>;

/**
 * Factory used to create WebSocket instances.
 */
export type WebSocketFactory = (
  url: string,
  protocol?: string | readonly string[],
) => WebSocketLike;

/**
 * Options for `useWebSocket`.
 */
export type UseWebSocketOptions<T> = Readonly<{
  enabled?: boolean;
  reconnectMs?: number;
  parse?: (payload: unknown) => T;
  factory?: WebSocketFactory;
}>;

/**
 * State returned by `useWebSocket`.
 */
export type UseWebSocketState<T> = Readonly<{
  value: T | undefined;
  loading: boolean;
  connected: boolean;
  reconnectAttempts: number;
  error: unknown;
  send: (payload: WebSocketSendPayload) => boolean;
  close: (code?: number, reason?: string) => void;
}>;

/**
 * Tail source contract used by `useTail`.
 */
export type TailSource<T = string> = AsyncIterable<T> &
  Readonly<{
    close?: () => void;
  }>;

/**
 * Factory used to create tail sources for `useTail`.
 */
export type TailSourceFactory<T = string> = (
  filePath: string,
  options: Readonly<{ fromEnd: boolean; pollMs: number }>,
) => TailSource<T>;

/**
 * Options for `useTail`.
 */
export type UseTailOptions<T> = Readonly<{
  enabled?: boolean;
  maxBuffer?: number;
  fromEnd?: boolean;
  pollMs?: number;
  parse?: (chunk: string) => T;
  sourceFactory?: TailSourceFactory<string>;
}>;

/**
 * State returned by `useTail`.
 */
export type UseTailState<T> = Readonly<{
  latest: T | undefined;
  lines: readonly T[];
  dropped: number;
  loading: boolean;
  error: unknown;
}>;

type TailBufferState<T> = Readonly<{
  lines: readonly T[];
  dropped: number;
}>;

const DEFAULT_STREAM_RECONNECT_MS = 1000;
const DEFAULT_TAIL_POLL_MS = 200;
const DEFAULT_TAIL_MAX_BUFFER = 512;

let defaultTailSourceFactory: TailSourceFactory<string> | undefined;

/**
 * Configure the default `useTail` source factory.
 *
 * Runtime packages can register environment-specific tail implementations
 * without introducing Node/browser imports into `@rezi-ui/core`.
 */
export function setDefaultTailSourceFactory(factory: TailSourceFactory<string> | undefined): void {
  defaultTailSourceFactory = factory;
}

function readUnknownProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readUnknownProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === "function";
}

function closeAsyncIterator<T>(iterator: AsyncIterator<T>): void {
  const maybeReturn = iterator.return;
  if (typeof maybeReturn !== "function") return;
  try {
    const maybePromise = maybeReturn.call(iterator);
    if (isPromiseLike(maybePromise)) {
      void maybePromise.catch(() => {
        // Ignore async-iterator close races.
      });
    }
  } catch {
    // Ignore sync close races.
  }
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  return Math.floor(value);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

type EventSourceCtor = new (
  url: string,
  options?: Readonly<{ withCredentials?: boolean }>,
) => EventSourceLike;

function resolveEventSourceFactory(
  factory: EventSourceFactory | undefined,
): EventSourceFactory | undefined {
  if (factory) return factory;
  const ctor = (globalThis as { EventSource?: EventSourceCtor }).EventSource;
  if (typeof ctor !== "function") return undefined;
  return (url, options) => new ctor(url, options);
}

function toEventSourceMessage(event: unknown, fallbackType: string): UseEventSourceMessage {
  const rawData = readUnknownProperty(event, "data");

  return {
    type: readStringProperty(event, "type") ?? fallbackType,
    data:
      typeof rawData === "string"
        ? rawData
        : rawData === undefined || rawData === null
          ? ""
          : String(rawData),
    lastEventId: readStringProperty(event, "lastEventId"),
    origin: readStringProperty(event, "origin"),
  };
}

type WebSocketCtor = new (url: string, protocol?: string | string[]) => WebSocketLike;

function resolveWebSocketFactory(
  factory: WebSocketFactory | undefined,
): WebSocketFactory | undefined {
  if (factory) return factory;
  const ctor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (typeof ctor !== "function") return undefined;
  return (url, protocol) => {
    const normalizedProtocol = Array.isArray(protocol) ? Array.from(protocol) : protocol;
    return new ctor(url, normalizedProtocol as string | string[] | undefined);
  };
}

function toWebSocketPayload(event: unknown): unknown {
  if (!event || typeof event !== "object") return event;
  if (!("data" in event)) return event;
  return readUnknownProperty(event, "data");
}

/**
 * Return a debounced copy of a value.
 *
 * The returned value updates only after `delayMs` has elapsed without a new
 * input value. Non-positive or non-finite delays apply on the next effect pass.
 */
export function useDebounce<T>(ctx: DebounceHookContext, value: T, delayMs: number): T {
  // Wrap to preserve function values; this hook runtime treats function inputs
  // as lazy initializers.
  const [debounced, setDebounced] = ctx.useState<T>(() => value);

  ctx.useEffect(() => {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      setDebounced(value);
      return;
    }

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debounced;
}

/**
 * Track the previous render's value.
 */
export function usePrevious<T>(ctx: PreviousHookContext, value: T): T | undefined {
  const ref = ctx.useRef<T | undefined>(undefined);
  const previousValue = ref.current;

  ctx.useEffect(() => {
    ref.current = value;
  }, [value]);

  return previousValue;
}

/**
 * Run an async operation when dependencies change.
 *
 * - Sets `loading` to `true` while the operation is in-flight
 * - Stores resolved value in `data`
 * - Stores thrown/rejected value in `error`
 * - Ignores stale completions from older dependency runs
 */
export function useAsync<T>(
  ctx: AsyncHookContext,
  task: () => Promise<T>,
  deps: readonly unknown[],
): UseAsyncState<T> {
  const [data, setData] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);

  ctx.useEffect(() => {
    let cancelled = false;
    runIdRef.current += 1;
    const runId = runIdRef.current;

    setLoading(true);
    setError(undefined);

    Promise.resolve()
      .then(() => task())
      .then((nextData) => {
        if (cancelled || runIdRef.current !== runId) return;
        setData(nextData);
        setLoading(false);
      })
      .catch((nextError) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return {
    data,
    loading,
    error,
  };
}

/**
 * Subscribe to an async iterable and re-render on each value.
 *
 * - Sets `loading` while waiting for the first value
 * - Stores the latest stream item in `value`
 * - Sets `done` when iteration completes
 * - Ignores stale values if a newer subscription replaces the stream
 */
export function useStream<T>(
  ctx: StreamHookContext,
  stream: AsyncIterable<T> | undefined,
  deps?: readonly unknown[],
): UseStreamState<T> {
  const [value, setValue] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(stream !== undefined);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const [done, setDone] = ctx.useState<boolean>(stream === undefined);
  const runIdRef = ctx.useRef(0);

  const effectDeps = deps ?? [stream];

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (!stream) {
      setLoading(false);
      setDone(true);
      setError(undefined);
      return;
    }

    let cancelled = false;
    let iterator: AsyncIterator<T> | undefined;

    setLoading(true);
    setDone(false);
    setError(undefined);

    void Promise.resolve()
      .then(() => {
        iterator = stream[Symbol.asyncIterator]();
      })
      .then(async () => {
        if (!iterator) return;
        while (true) {
          const next = await iterator.next();
          if (cancelled || runIdRef.current !== runId) return;
          if (next.done) {
            setLoading(false);
            setDone(true);
            return;
          }
          setValue(next.value);
          setLoading(false);
        }
      })
      .catch((nextError) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
        setLoading(false);
        setDone(true);
      });

    return () => {
      cancelled = true;
      if (iterator) {
        closeAsyncIterator(iterator);
      }
    };
  }, effectDeps);

  return {
    value,
    loading,
    error,
    done,
  };
}

/**
 * Register an interval callback with automatic cleanup.
 *
 * The latest callback is always invoked without requiring interval resubscribe.
 */
export function useInterval(ctx: IntervalHookContext, fn: () => void, ms: number): void {
  const callbackRef = ctx.useRef(fn);

  ctx.useEffect(() => {
    callbackRef.current = fn;
  }, [fn]);

  ctx.useEffect(() => {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }

    const intervalId: ReturnType<typeof setInterval> = setInterval(() => {
      callbackRef.current();
    }, ms);

    return () => {
      clearInterval(intervalId);
    };
  }, [ms]);
}

/**
 * Subscribe to a server-sent-events endpoint with automatic reconnect.
 */
export function useEventSource<T = string>(
  ctx: EventSourceHookContext,
  url: string,
  options: UseEventSourceOptions<T> = {},
): UseEventSourceState<T> {
  const [value, setValue] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [connected, setConnected] = ctx.useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = ctx.useState(0);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);

  const enabled = options.enabled ?? true;
  const reconnectMs = normalizeNonNegativeInteger(options.reconnectMs, DEFAULT_STREAM_RECONNECT_MS);
  const eventType = options.eventType ?? "message";
  const parse = options.parse;

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (!enabled || url.length === 0) {
      setLoading(false);
      setConnected(false);
      setReconnectAttempts(0);
      setError(undefined);
      return;
    }

    const createSource = resolveEventSourceFactory(options.factory);
    if (!createSource) {
      setLoading(false);
      setConnected(false);
      setError(new Error("useEventSource: EventSource is unavailable in this runtime."));
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSourceLike | null = null;
    let detachListeners: (() => void) | undefined;
    let attempt = 0;

    const closeSource = () => {
      if (detachListeners) {
        detachListeners();
        detachListeners = undefined;
      }
      if (source) {
        try {
          source.close();
        } catch {
          // Ignore close races.
        }
        source = null;
      }
    };

    const scheduleReconnect = (reason: unknown) => {
      if (cancelled || runIdRef.current !== runId) return;
      setConnected(false);
      setLoading(true);
      setError(reason);
      attempt += 1;
      setReconnectAttempts(attempt);

      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, reconnectMs);
    };

    const connect = () => {
      if (cancelled || runIdRef.current !== runId) return;

      try {
        source = createSource(
          url,
          options.withCredentials === undefined ? {} : { withCredentials: options.withCredentials },
        );
      } catch (nextError) {
        scheduleReconnect(nextError);
        return;
      }

      const onOpen = () => {
        if (cancelled || runIdRef.current !== runId) return;
        setConnected(true);
        setLoading(false);
        setError(undefined);
      };

      const onMessage = (rawEvent: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        try {
          const message = toEventSourceMessage(rawEvent, eventType);
          const parsed = parse ? parse(message) : (message.data as unknown as T);
          setValue(parsed);
          setLoading(false);
          setError(undefined);
        } catch (nextError) {
          setError(nextError);
        }
      };

      const onError = (nextError: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        closeSource();
        scheduleReconnect(nextError);
      };

      source.addEventListener("open", onOpen);
      source.addEventListener(eventType, onMessage);
      source.addEventListener("error", onError);

      detachListeners = () => {
        if (!source) return;
        source.removeEventListener("open", onOpen);
        source.removeEventListener(eventType, onMessage);
        source.removeEventListener("error", onError);
      };
    };

    setLoading(true);
    setConnected(false);
    setReconnectAttempts(0);
    setError(undefined);
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      closeSource();
    };
  }, [url, enabled, reconnectMs, eventType, parse, options.factory, options.withCredentials]);

  return {
    value,
    loading,
    connected,
    reconnectAttempts,
    error,
  };
}

/**
 * Subscribe to a websocket endpoint with message parsing and auto-reconnect.
 */
export function useWebSocket<T = string>(
  ctx: WebSocketHookContext,
  url: string,
  protocol?: string | readonly string[],
  options: UseWebSocketOptions<T> = {},
): UseWebSocketState<T> {
  const [value, setValue] = ctx.useState<T | undefined>(undefined);
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [connected, setConnected] = ctx.useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = ctx.useState(0);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);
  const socketRef = ctx.useRef<WebSocketLike | null>(null);
  const manualCloseRef = ctx.useRef(false);
  const reconnectTimerRef = ctx.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendRef = ctx.useRef<((payload: WebSocketSendPayload) => boolean) | undefined>(undefined);
  const closeRef = ctx.useRef<((code?: number, reason?: string) => void) | undefined>(undefined);

  if (!sendRef.current) {
    sendRef.current = (payload: WebSocketSendPayload): boolean => {
      const socket = socketRef.current;
      if (!socket) return false;
      try {
        socket.send(payload);
        return true;
      } catch (nextError) {
        setError(nextError);
        return false;
      }
    };
  }

  if (!closeRef.current) {
    closeRef.current = (code?: number, reason?: string): void => {
      manualCloseRef.current = true;
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      const socket = socketRef.current;
      if (!socket) return;
      try {
        socket.close(code, reason);
      } catch (nextError) {
        setError(nextError);
      } finally {
        socketRef.current = null;
      }
    };
  }

  const enabled = options.enabled ?? true;
  const reconnectMs = normalizeNonNegativeInteger(options.reconnectMs, DEFAULT_STREAM_RECONNECT_MS);
  const parse = options.parse;

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    manualCloseRef.current = false;

    if (!enabled || url.length === 0) {
      setLoading(false);
      setConnected(false);
      setReconnectAttempts(0);
      setError(undefined);
      return;
    }

    const createSocket = resolveWebSocketFactory(options.factory);
    if (!createSocket) {
      setLoading(false);
      setConnected(false);
      setError(new Error("useWebSocket: WebSocket is unavailable in this runtime."));
      return;
    }

    let cancelled = false;
    let detachListeners: (() => void) | undefined;
    let attempt = 0;

    const closeSocket = () => {
      if (detachListeners) {
        detachListeners();
        detachListeners = undefined;
      }

      const socket = socketRef.current;
      if (!socket) return;
      try {
        socket.close();
      } catch {
        // Ignore close races.
      } finally {
        socketRef.current = null;
      }
    };

    const scheduleReconnect = (reason: unknown) => {
      if (cancelled || runIdRef.current !== runId || manualCloseRef.current) return;
      setConnected(false);
      setLoading(true);
      setError(reason);
      attempt += 1;
      setReconnectAttempts(attempt);

      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = undefined;
        connect();
      }, reconnectMs);
    };

    const connect = () => {
      if (cancelled || runIdRef.current !== runId || manualCloseRef.current) return;

      let socket: WebSocketLike;
      try {
        socket = createSocket(url, protocol);
      } catch (nextError) {
        scheduleReconnect(nextError);
        return;
      }

      socketRef.current = socket;

      const onOpen = () => {
        if (cancelled || runIdRef.current !== runId) return;
        setConnected(true);
        setLoading(false);
        setError(undefined);
      };

      const onMessage = (rawEvent: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        try {
          const payload = toWebSocketPayload(rawEvent);
          const parsed = parse ? parse(payload) : (payload as unknown as T);
          setValue(parsed);
          setLoading(false);
          setError(undefined);
        } catch (nextError) {
          setError(nextError);
        }
      };

      const onError = (nextError: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
      };

      const onClose = (nextEvent: unknown) => {
        if (cancelled || runIdRef.current !== runId) return;
        socketRef.current = null;
        setConnected(false);
        if (manualCloseRef.current) {
          setLoading(false);
          return;
        }
        scheduleReconnect(nextEvent);
      };

      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);

      detachListeners = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
      };
    };

    setLoading(true);
    setConnected(false);
    setReconnectAttempts(0);
    setError(undefined);
    connect();

    return () => {
      cancelled = true;
      manualCloseRef.current = true;
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      closeSocket();
    };
  }, [url, protocol, enabled, reconnectMs, parse, options.factory]);

  return {
    value,
    loading,
    connected,
    reconnectAttempts,
    error,
    send: sendRef.current ?? (() => false),
    close: closeRef.current ?? (() => {}),
  };
}

/**
 * Tail a file source and retain a bounded in-memory line buffer.
 *
 * Backpressure behavior: when incoming line rate exceeds the configured
 * `maxBuffer`, the oldest lines are dropped and counted in `dropped`.
 */
export function useTail<T = string>(
  ctx: TailHookContext,
  filePath: string,
  options: UseTailOptions<T> = {},
): UseTailState<T> {
  const [latest, setLatest] = ctx.useState<T | undefined>(undefined);
  const [buffer, setBuffer] = ctx.useState<TailBufferState<T>>({
    lines: [],
    dropped: 0,
  });
  const [loading, setLoading] = ctx.useState<boolean>(true);
  const [error, setError] = ctx.useState<unknown>(undefined);
  const runIdRef = ctx.useRef(0);

  const enabled = options.enabled ?? true;
  const maxBuffer = normalizePositiveInteger(options.maxBuffer, DEFAULT_TAIL_MAX_BUFFER);
  const fromEnd = options.fromEnd ?? true;
  const pollMs = normalizePositiveInteger(options.pollMs, DEFAULT_TAIL_POLL_MS);
  const parse = options.parse;

  ctx.useEffect(() => {
    setLatest(undefined);
    setBuffer({
      lines: [],
      dropped: 0,
    });
  }, [filePath]);

  ctx.useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (!enabled || filePath.length === 0) {
      setLoading(false);
      setError(undefined);
      return;
    }

    const createTailSource = options.sourceFactory ?? defaultTailSourceFactory;
    if (!createTailSource) {
      setLoading(false);
      setError(
        new Error(
          "useTail: no tail source factory configured. Import @rezi-ui/node or pass options.sourceFactory.",
        ),
      );
      return;
    }

    let cancelled = false;
    let source: TailSource<string> | undefined;
    let iterator: AsyncIterator<string> | undefined;

    setLoading(true);
    setError(undefined);

    void Promise.resolve()
      .then(() => {
        source = createTailSource(filePath, {
          fromEnd,
          pollMs,
        });
        iterator = source[Symbol.asyncIterator]();
      })
      .then(async () => {
        if (!iterator) return;

        while (true) {
          const next = await iterator.next();
          if (cancelled || runIdRef.current !== runId) return;
          if (next.done) {
            setLoading(false);
            return;
          }

          const parsed = parse ? parse(next.value) : (next.value as unknown as T);
          setLatest(parsed);
          setBuffer((previous) => {
            const nextLines = [...previous.lines, parsed];
            if (nextLines.length <= maxBuffer) {
              return {
                lines: nextLines,
                dropped: previous.dropped,
              };
            }

            const overflow = nextLines.length - maxBuffer;
            return {
              lines: nextLines.slice(overflow),
              dropped: previous.dropped + overflow,
            };
          });
          setLoading(false);
        }
      })
      .catch((nextError) => {
        if (cancelled || runIdRef.current !== runId) return;
        setError(nextError);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (source && typeof source.close === "function") {
        try {
          source.close();
        } catch {
          // Ignore source close races.
        }
      }
      if (iterator) {
        closeAsyncIterator(iterator);
      }
    };
  }, [filePath, enabled, maxBuffer, fromEnd, pollMs, parse, options.sourceFactory]);

  return {
    latest,
    lines: buffer.lines,
    dropped: buffer.dropped,
    loading,
    error,
  };
}

/* ========== Composite Widget Types ========== */

/**
 * A composite widget is a VNode with special metadata for runtime handling.
 * The runtime detects these and manages their instance state.
 */
export type CompositeVNode = VNode & {
  readonly __composite: CompositeWidgetMeta;
};

/**
 * Metadata attached to composite widget VNodes.
 */
export type CompositeWidgetMeta = Readonly<{
  /** Unique key for this widget definition (for identity checking). */
  widgetKey: string;
  /** The render function to call. */
  render: (ctx: WidgetContext<unknown>) => VNode;
  /** Props passed to the widget. */
  props: unknown;
  /** Optional key prop for reconciliation. */
  key: string | undefined;
}>;

/**
 * Check if a VNode is a composite widget.
 */
export function isCompositeVNode(vnode: VNode): vnode is CompositeVNode {
  return "__composite" in vnode && (vnode as CompositeVNode).__composite !== undefined;
}

/**
 * Get composite metadata from a VNode, or null if not composite.
 */
export function getCompositeMeta(vnode: VNode): CompositeWidgetMeta | null {
  if (isCompositeVNode(vnode)) {
    return vnode.__composite;
  }
  return null;
}

/* ========== Widget Definition ========== */

/** Counter for generating unique widget keys. */
let widgetKeyCounter = 0;

/**
 * Generate a unique widget key for a definition.
 * This ensures each call to defineWidget creates a distinct widget type.
 */
function generateWidgetKey(name?: string): string {
  const id = widgetKeyCounter++;
  return name ? `${name}_${id}` : `Widget_${id}`;
}

/**
 * Props constraint: must have optional key property.
 */
export type WidgetPropsBase = Readonly<{ key?: string }>;

/**
 * Widget factory function returned by defineWidget.
 */
export type WidgetFactory<Props extends WidgetPropsBase> = (props: Props) => VNode;

export type WidgetWrapperKind = "column" | "row";

/**
 * Options for defineWidget.
 */
export type DefineWidgetOptions = Readonly<{
  /** Display name for debugging (optional). */
  name?: string;
  /**
   * Container wrapper kind used by the composite placeholder node.
   * Defaults to "column" for backwards compatibility.
   */
  wrapper?: WidgetWrapperKind;
}>;

/**
 * Define a reusable widget with local state and lifecycle.
 *
 * The render function receives props and a WidgetContext for managing
 * per-instance state. Each instance of the widget maintains its own
 * state that persists across renders.
 *
 * @param render - Function that renders props and context to a VNode
 * @param options - Optional configuration
 * @returns Factory function that creates widget VNodes
 *
 * @example
 * ```ts
 * const Counter = defineWidget<{ initial: number; key?: string }>((props, ctx) => {
 *   const [count, setCount] = ctx.useState(props.initial);
 *
 *   return ui.row([
 *     ui.text(`Count: ${count}`),
 *     ui.button({
 *       id: ctx.id("inc"),
 *       label: "+",
 *       onPress: () => setCount(c => c + 1)
 *     }),
 *   ]);
 * });
 *
 * // Usage:
 * ui.column([
 *   Counter({ initial: 0 }),
 *   Counter({ initial: 10, key: "counter-2" }),
 * ]);
 * ```
 */
export function defineWidget<Props extends WidgetPropsBase, State = void>(
  render: (props: Props, ctx: WidgetContext<State>) => VNode,
  options?: DefineWidgetOptions,
): WidgetFactory<Props> {
  const widgetKey = generateWidgetKey(options?.name);
  const wrapperKind = options?.wrapper ?? "column";

  return function widgetFactory(props: Props): VNode {
    // Store render function and props for later execution
    const renderFn = (ctx: WidgetContext<unknown>) => {
      return render(props, ctx as WidgetContext<State>);
    };

    // Create a composite VNode that the runtime will detect and handle
    // Use a container wrapper so runtime can reconcile the rendered child.
    const baseVNode: VNode = {
      kind: wrapperKind,
      props: props.key !== undefined ? { key: props.key } : {},
      children: [],
    };

    const compositeVNode: CompositeVNode = {
      ...baseVNode,
      __composite: Object.freeze({
        widgetKey,
        render: renderFn,
        props,
        key: props.key,
      }),
    };

    return compositeVNode;
  };
}

/* ========== Instance ID Scoping ========== */

/**
 * Generate a scoped ID for a widget instance.
 *
 * @param widgetKey - The widget definition key
 * @param instanceIndex - Instance index within parent
 * @param suffix - User-provided suffix
 * @returns Scoped ID string like "Counter_0_inc"
 */
export function scopedId(widgetKey: string, instanceIndex: number, suffix: string): string {
  return `${widgetKey}_${instanceIndex}_${suffix}`;
}

/* ========== Context Creation ========== */

/**
 * Create a WidgetContext for rendering a composite widget.
 * This is called by the runtime during the commit phase.
 *
 * @param widgetKey - Widget definition key for ID scoping
 * @param instanceIndex - Instance index for ID scoping
 * @param hookContext - Hook implementations from instance registry
 * @param appState - Current app state for useAppState
 * @param onInvalidate - Callback when widget needs re-render
 * @returns Complete WidgetContext for the render pass
 */
export function createWidgetContext<State>(
  widgetKey: string,
  instanceIndex: number,
  hookContext: Pick<
    WidgetContext<State>,
    "useState" | "useRef" | "useEffect" | "useMemo" | "useCallback"
  >,
  appState: State,
  viewport: ResponsiveViewportSnapshot,
  onInvalidate: () => void,
): WidgetContext<State> {
  return Object.freeze({
    id: (suffix: string) => scopedId(widgetKey, instanceIndex, suffix),
    useState: hookContext.useState,
    useRef: hookContext.useRef,
    useEffect: hookContext.useEffect,
    useMemo: hookContext.useMemo,
    useCallback: hookContext.useCallback,
    useAppState: <T>(selector: (s: State) => T): T => selector(appState),
    useViewport: () => viewport,
    invalidate: onInvalidate,
  });
}

/* ========== Render Result Type ========== */

/**
 * Result of rendering a composite widget.
 */
export type CompositeRenderResult = Readonly<{
  /** The rendered VNode tree. */
  vnode: VNode;
  /** Pending effects to run after commit. */
  pendingEffects: readonly {
    deps: readonly unknown[] | undefined;
    cleanup: (() => void) | undefined;
    effect: () => undefined | (() => void);
  }[];
}>;

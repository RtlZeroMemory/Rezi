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

import type { ResponsiveViewportSnapshot } from "../layout/responsive.js";
import type { VNode } from "./types.js";

/* ========== Widget Context Type ========== */

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
 * Async state returned by `useAsync`.
 */
export type UseAsyncState<T> = Readonly<{
  data: T | undefined;
  loading: boolean;
  error: unknown;
}>;

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
  hookContext: Pick<WidgetContext<State>, "useState" | "useRef" | "useEffect">,
  appState: State,
  viewport: ResponsiveViewportSnapshot,
  onInvalidate: () => void,
): WidgetContext<State> {
  return Object.freeze({
    id: (suffix: string) => scopedId(widgetKey, instanceIndex, suffix),
    useState: hookContext.useState,
    useRef: hookContext.useRef,
    useEffect: hookContext.useEffect,
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

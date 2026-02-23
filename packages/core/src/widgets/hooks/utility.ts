import type { WidgetContext } from "../composition.js";

/**
 * Minimal context required by `useDebounce`.
 */
type DebounceHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useState">;

/**
 * Minimal context required by `usePrevious`.
 */
type PreviousHookContext = Pick<WidgetContext<unknown>, "useEffect" | "useRef">;

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

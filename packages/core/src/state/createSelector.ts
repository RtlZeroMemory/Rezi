/**
 * packages/core/src/state/createSelector.ts — Memoized selector factory.
 *
 * Why: Prevents unnecessary re-renders when useAppState selectors compute
 * derived data. Without memoization, selectors like `items.filter(...)` create
 * new array references every render, defeating Object.is comparison.
 */

type Selector<S, R> = (state: S) => R;
type EqualityFn = (a: unknown, b: unknown) => boolean;

const defaultEquality: EqualityFn = Object.is;

/**
 * Create a memoized selector from 1-4 input selectors and a combiner.
 *
 * Input selectors extract slices from the state. The combiner receives
 * the extracted slices and computes a derived value. The combiner only
 * re-runs when at least one input slice changes (compared with Object.is).
 *
 * @example
 * ```ts
 * const selectVisibleItems = createSelector(
 *   (s: AppState) => s.items,
 *   (s: AppState) => s.filter,
 *   (items, filter) => items.filter(i => i.name.includes(filter)),
 * );
 *
 * // Inside a defineWidget render:
 * const visible = ctx.useAppState(selectVisibleItems);
 * ```
 */
export function createSelector<S, R1, Result>(
  s1: Selector<S, R1>,
  combiner: (r1: R1) => Result,
  equalityFn?: EqualityFn,
): Selector<S, Result>;
export function createSelector<S, R1, R2, Result>(
  s1: Selector<S, R1>,
  s2: Selector<S, R2>,
  combiner: (r1: R1, r2: R2) => Result,
  equalityFn?: EqualityFn,
): Selector<S, Result>;
export function createSelector<S, R1, R2, R3, Result>(
  s1: Selector<S, R1>,
  s2: Selector<S, R2>,
  s3: Selector<S, R3>,
  combiner: (r1: R1, r2: R2, r3: R3) => Result,
  equalityFn?: EqualityFn,
): Selector<S, Result>;
export function createSelector<S, R1, R2, R3, R4, Result>(
  s1: Selector<S, R1>,
  s2: Selector<S, R2>,
  s3: Selector<S, R3>,
  s4: Selector<S, R4>,
  combiner: (r1: R1, r2: R2, r3: R3, r4: R4) => Result,
  equalityFn?: EqualityFn,
): Selector<S, Result>;
export function createSelector(...args: unknown[]): unknown {
  const { inputSelectors, combiner, equalityFn } = parseSelectorArgs(args);

  let lastInputs: unknown[] | null = null;
  let lastResult: unknown = undefined;

  return (state: unknown): unknown => {
    const inputs = inputSelectors.map((selector) => selector(state));

    if (lastInputs !== null && inputs.length === lastInputs.length) {
      let allEqual = true;
      for (let i = 0; i < inputs.length; i++) {
        if (!equalityFn(inputs[i], lastInputs[i])) {
          allEqual = false;
          break;
        }
      }
      if (allEqual) {
        return lastResult;
      }
    }

    lastInputs = inputs;
    lastResult = combiner(...inputs);
    return lastResult;
  };
}

function looksLikeEqualityFn(fn: Function): boolean {
  const name = fn.name.toLowerCase();
  return name.includes("equal") || name.includes("equality") || name === "is";
}

function parseSelectorArgs(args: unknown[]): {
  inputSelectors: Array<(state: unknown) => unknown>;
  combiner: (...inputs: unknown[]) => unknown;
  equalityFn: EqualityFn;
} {
  if (args.length < 2 || args.length > 6) {
    throw new Error("createSelector: expected 2-6 function arguments");
  }

  for (const arg of args) {
    if (typeof arg !== "function") {
      throw new Error("createSelector: all arguments must be functions");
    }
  }

  const fns = args as Function[];

  const noEqSelectors = fns.slice(0, -1);
  const noEqCombiner = fns[fns.length - 1]!;
  const canUseNoEq = noEqSelectors.length >= 1 && noEqSelectors.length <= 4;

  const withEqSelectors = fns.slice(0, -2);
  const withEqCombiner = fns[fns.length - 2]!;
  const withEqFn = fns[fns.length - 1]!;
  const canUseWithEq =
    fns.length >= 3 &&
    withEqSelectors.length >= 1 &&
    withEqSelectors.length <= 4 &&
    withEqFn.length >= 2;

  if (!canUseNoEq && !canUseWithEq) {
    throw new Error("createSelector: invalid arguments");
  }

  if (canUseWithEq && (!canUseNoEq || looksLikeEqualityFn(withEqFn))) {
    return {
      inputSelectors: withEqSelectors as Array<(state: unknown) => unknown>,
      combiner: withEqCombiner as (...inputs: unknown[]) => unknown,
      equalityFn: withEqFn as EqualityFn,
    };
  }

  return {
    inputSelectors: noEqSelectors as Array<(state: unknown) => unknown>,
    combiner: noEqCombiner as (...inputs: unknown[]) => unknown,
    equalityFn: defaultEquality,
  };
}

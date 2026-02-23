/**
 * packages/core/src/state/createSlice.ts — State slice factory.
 *
 * Why: Provides modular state management for apps with complex state.
 * Each slice owns a namespace of the state, generates typed action creators,
 * and produces a reducer that can be composed into the root reducer.
 */

type CaseReducers<SliceState> = Record<string, (state: SliceState, payload: any) => SliceState>;

type ActionCreators<Name extends string, CR extends CaseReducers<any>> = {
  [K in keyof CR]: CR[K] extends (state: any, payload: infer P) => any
    ? unknown extends P
      ? () => { type: `${Name}/${K & string}` }
      : (payload: P) => { type: `${Name}/${K & string}`; payload: P }
    : never;
};

type AnySlice = Slice<string, any, CaseReducers<any>>;
type SliceStateOf<T> = T extends Slice<string, infer S, any> ? S : never;
type RootStateFromSlices<Slices extends Record<string, AnySlice>> = {
  [K in keyof Slices]: SliceStateOf<Slices[K]>;
};

export type Slice<Name extends string, SliceState, CR extends CaseReducers<SliceState>> = Readonly<{
  name: Name;
  reducer: (state: SliceState, action: { type: string; payload?: unknown }) => SliceState;
  actions: ActionCreators<Name, CR>;
  initialState: SliceState;
}>;

export type SliceConfig<
  Name extends string,
  SliceState,
  CR extends CaseReducers<SliceState>,
> = Readonly<{
  name: Name;
  initialState: SliceState;
  reducers: CR;
}>;

export function createSlice<Name extends string, SliceState, CR extends CaseReducers<SliceState>>(
  config: SliceConfig<Name, SliceState, CR>,
): Slice<Name, SliceState, CR> {
  const { name, initialState, reducers } = config;

  const actionTypes = new Map<string, keyof CR>();
  const actions = {} as Record<string, (...args: unknown[]) => { type: string; payload?: unknown }>;

  for (const key of Object.keys(reducers)) {
    const type = `${name}/${key}`;
    actionTypes.set(type, key);
    actions[key] = (payload?: unknown) => {
      return payload === undefined ? { type } : { type, payload };
    };
  }

  const reducer = (state: SliceState, action: { type: string; payload?: unknown }): SliceState => {
    const key = actionTypes.get(action.type);
    if (key === undefined) return state;
    const caseReducer = reducers[key];
    if (caseReducer === undefined) return state;
    return caseReducer(state, action.payload);
  };

  return Object.freeze({
    name,
    reducer,
    actions: actions as ActionCreators<Name, CR>,
    initialState,
  });
}

/**
 * Combine multiple slice reducers into a single root reducer.
 * Each slice manages its own key in the root state object.
 *
 * @example
 * ```ts
 * const rootReducer = combineSlices({ counter: counterSlice, todos: todosSlice });
 * ```
 */
export function combineSlices<Slices extends Record<string, AnySlice>>(
  slices: Slices,
): (
  state: RootStateFromSlices<Slices>,
  action: { type: string; payload?: unknown },
) => RootStateFromSlices<Slices> {
  type RootState = RootStateFromSlices<Slices>;

  const keys = Object.keys(slices) as (keyof Slices & string)[];

  return (state: RootState, action: { type: string; payload?: unknown }): RootState => {
    let changed = false;
    const next = {} as Record<string, unknown>;

    for (const key of keys) {
      const slice = slices[key]!;
      const prev = state[key];
      const result = slice.reducer(prev, action);
      next[key] = result;
      if (result !== prev) changed = true;
    }

    return changed ? (next as RootState) : state;
  };
}

/**
 * Build initial state from combined slices.
 */
export function getInitialState<Slices extends Record<string, AnySlice>>(
  slices: Slices,
): RootStateFromSlices<Slices> {
  type RootState = RootStateFromSlices<Slices>;

  const state = {} as Record<string, unknown>;
  for (const key of Object.keys(slices)) {
    state[key] = slices[key]!.initialState;
  }

  return state as RootState;
}

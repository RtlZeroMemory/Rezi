import { assert, describe, test } from "@rezi-ui/testkit";
import { combineSlices, createSlice, getInitialState } from "../createSlice.js";

describe("createSlice", () => {
  const counterSlice = createSlice({
    name: "counter",
    initialState: 0,
    reducers: {
      increment: (state: number) => state + 1,
      decrement: (state: number) => state - 1,
      addBy: (state: number, amount: number) => state + amount,
    },
  });

  test("generates correct action types", () => {
    const inc = counterSlice.actions.increment();
    assert.equal(inc.type, "counter/increment");

    const add = counterSlice.actions.addBy(5);
    assert.equal(add.type, "counter/addBy");
    assert.equal(add.payload, 5);
  });

  test("reducer handles matching actions", () => {
    let state = counterSlice.initialState;
    state = counterSlice.reducer(state, counterSlice.actions.increment());
    assert.equal(state, 1);

    state = counterSlice.reducer(state, counterSlice.actions.addBy(10));
    assert.equal(state, 11);

    state = counterSlice.reducer(state, counterSlice.actions.decrement());
    assert.equal(state, 10);
  });

  test("reducer returns same state for unknown actions", () => {
    const state = 42;
    const next = counterSlice.reducer(state, { type: "unknown/action" });
    assert.strictEqual(next, state);
  });

  test("initialState is preserved", () => {
    assert.equal(counterSlice.initialState, 0);
  });
});

describe("combineSlices", () => {
  const counterSlice = createSlice({
    name: "counter",
    initialState: 0,
    reducers: {
      increment: (state: number) => state + 1,
    },
  });

  const todosSlice = createSlice({
    name: "todos",
    initialState: [] as string[],
    reducers: {
      add: (state: string[], text: string) => [...state, text],
      clear: () => [],
    },
  });

  test("combines slices into root reducer", () => {
    const rootReducer = combineSlices({ counter: counterSlice, todos: todosSlice });
    let state = getInitialState({ counter: counterSlice, todos: todosSlice });
    assert.deepEqual(state, { counter: 0, todos: [] });

    state = rootReducer(state, counterSlice.actions.increment());
    assert.equal(state.counter, 1);
    assert.deepEqual(state.todos, []);

    state = rootReducer(state, todosSlice.actions.add("hello"));
    assert.equal(state.counter, 1);
    assert.deepEqual(state.todos, ["hello"]);
  });

  test("returns same state reference when nothing changed", () => {
    const rootReducer = combineSlices({ counter: counterSlice, todos: todosSlice });
    const state = getInitialState({ counter: counterSlice, todos: todosSlice });
    const next = rootReducer(state, { type: "unknown/action" });
    assert.strictEqual(next, state);
  });
});

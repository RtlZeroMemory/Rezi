import { assert, describe, test } from "@rezi-ui/testkit";
import { createApp } from "../createApp.js";
import type { Thunk } from "../types.js";
import { flushMicrotasks } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

describe("app.dispatch()", () => {
  test("dispatching a value acts like app.update()", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    await app.start();
    app.dispatch(42);
    await flushMicrotasks(3);

    assert.equal(app.getState(), 42);
  });

  test("dispatching an updater function acts like app.update()", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 10 });
    app.draw((g) => g.clear());

    await app.start();
    app.dispatch((prev: number) => prev + 5);
    await flushMicrotasks(3);

    assert.equal(app.getState(), 15);
  });

  test("dispatching a thunk receives dispatch and getState", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    await app.start();

    app.dispatch((dispatch, getState) => {
      const current = getState();
      dispatch(current + 100);
    });
    await flushMicrotasks(3);

    assert.equal(app.getState(), 100);
  });

  test("dispatching a single-arg thunk works", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 10 });
    app.draw((g) => g.clear());

    await app.start();

    const singleArgThunk: Thunk<number> = (dispatch) => {
      dispatch((prev: number) => prev + 7);
    };

    app.dispatch(singleArgThunk);
    await flushMicrotasks(5);

    assert.equal(app.getState(), 17);
  });

  test("single-arg thunk that does nothing does not corrupt state", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 123 });
    app.draw((g) => g.clear());

    await app.start();

    const noopThunk: Thunk<number> = (_dispatch) => {
      // no-op thunk
    };

    app.dispatch(noopThunk);
    await flushMicrotasks(3);

    assert.equal(app.getState(), 123);
  });

  test("async thunk works", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    await app.start();

    app.dispatch(async (dispatch, _getState) => {
      await Promise.resolve();
      dispatch(999);
    });
    await flushMicrotasks(10);

    assert.equal(app.getState(), 999);
  });

  test("thunk can dispatch another thunk", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    await app.start();

    app.dispatch((dispatch, _getState) => {
      dispatch((innerDispatch, innerGetState) => {
        innerDispatch(innerGetState() + 50);
      });
    });
    await flushMicrotasks(5);

    assert.equal(app.getState(), 50);
  });
});

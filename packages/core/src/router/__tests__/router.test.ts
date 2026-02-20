import { assert, describe, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import {
  backRouterState,
  canGoBackFromState,
  createRouteMap,
  createRouterState,
  currentRouteFromState,
  deserializeRouterState,
  historyFromState,
  navigateRouterState,
  replaceRouterState,
  serializeRouterState,
} from "../router.js";
import type { RouteDefinition, RouteParams } from "../types.js";

const EMPTY_PARAMS: RouteParams = Object.freeze({});

function route<S>(id: string): RouteDefinition<S> {
  return Object.freeze({
    id,
    screen: () => ({ kind: "text" as const, text: id, props: {} }),
  });
}

describe("router core state machine", () => {
  test("navigate + replace + back update history deterministically", () => {
    let state = createRouterState("home");
    assert.deepEqual(historyFromState(state), [{ id: "home", params: EMPTY_PARAMS }]);

    state = navigateRouterState(state, "logs", Object.freeze({ source: "api" }));
    assert.deepEqual(historyFromState(state), [
      { id: "home", params: EMPTY_PARAMS },
      { id: "logs", params: Object.freeze({ source: "api" }) },
    ]);

    state = replaceRouterState(state, "settings", Object.freeze({ section: "network" }));
    assert.deepEqual(historyFromState(state), [
      { id: "home", params: EMPTY_PARAMS },
      { id: "settings", params: Object.freeze({ section: "network" }) },
    ]);

    state = backRouterState(state);
    assert.deepEqual(currentRouteFromState(state), {
      id: "home",
      params: EMPTY_PARAMS,
    });
  });

  test("navigate to same id + params is a no-op", () => {
    const state = createRouterState("home", {
      initialParams: Object.freeze({ tab: "main" }),
    });

    const next = navigateRouterState(state, "home", Object.freeze({ tab: "main" }));
    assert.equal(next, state);
  });

  test("back with single-entry history is a no-op", () => {
    const state = createRouterState("home");
    const next = backRouterState(state);
    assert.equal(next, state);
    assert.equal(canGoBackFromState(next), false);
  });

  test("history is bounded and evicts oldest entries on overflow", () => {
    let state = createRouterState("home", { maxDepth: 3 });
    state = navigateRouterState(state, "logs");
    state = navigateRouterState(state, "settings");
    state = navigateRouterState(state, "detail", Object.freeze({ id: "42" }));

    assert.deepEqual(historyFromState(state), [
      { id: "logs", params: EMPTY_PARAMS },
      { id: "settings", params: EMPTY_PARAMS },
      { id: "detail", params: Object.freeze({ id: "42" }) },
    ]);
  });

  test("rapid sequential navigate operations preserve insertion order", () => {
    let state = createRouterState("home", { maxDepth: 6 });
    state = navigateRouterState(state, "a");
    state = navigateRouterState(state, "b");
    state = navigateRouterState(state, "c");
    state = navigateRouterState(state, "d", Object.freeze({ idx: "4" }));

    assert.deepEqual(historyFromState(state), [
      { id: "home", params: EMPTY_PARAMS },
      { id: "a", params: EMPTY_PARAMS },
      { id: "b", params: EMPTY_PARAMS },
      { id: "c", params: EMPTY_PARAMS },
      { id: "d", params: Object.freeze({ idx: "4" }) },
    ]);
  });

  test("serialization round-trip preserves router state", () => {
    let state = createRouterState("home", { maxDepth: 4 });
    state = navigateRouterState(state, "logs", Object.freeze({ stream: "main" }));
    state = navigateRouterState(state, "detail", Object.freeze({ id: "9", pane: "json" }));

    const snapshot = serializeRouterState(state);
    const restored = deserializeRouterState(snapshot);

    assert.deepEqual(serializeRouterState(restored), snapshot);
    assert.deepEqual(historyFromState(restored), historyFromState(state));
  });

  test("same action sequence yields same final serialized state", () => {
    const runSequence = () => {
      let state = createRouterState("home", { maxDepth: 5 });
      state = navigateRouterState(state, "logs", Object.freeze({ source: "tail" }));
      state = navigateRouterState(state, "settings", Object.freeze({ tab: "keys" }));
      state = replaceRouterState(state, "detail", Object.freeze({ id: "abc" }));
      state = backRouterState(state);
      return serializeRouterState(state);
    };

    assert.deepEqual(runSequence(), runSequence());
  });

  test("createRouteMap validates duplicate ids", () => {
    assert.throws(
      () => createRouteMap([route("home"), route("home")]),
      (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
    );
  });

  test("createRouteMap normalizes and exposes route definitions", () => {
    const map = createRouteMap([route("home"), route("settings")]);
    assert.equal(map.get("home")?.id, "home");
    assert.equal(map.get("settings")?.id, "settings");
  });

  test("invalid maxDepth throws", () => {
    assert.throws(
      () => createRouterState("home", { maxDepth: 0 }),
      (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
    );
  });
});

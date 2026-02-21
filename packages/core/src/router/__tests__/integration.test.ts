import { assert, describe, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import type { WidgetFocusSnapshot } from "../../app/widgetRenderer.js";
import { createRouterIntegration } from "../integration.js";
import type { RouteDefinition } from "../types.js";

type AppState = Readonly<{ allowAdmin: boolean }>;

function textNode(text: string) {
  return { kind: "text" as const, text, props: {} };
}

function route(
  id: string,
  options?: Readonly<{
    keybinding?: string;
    guard?: RouteDefinition<AppState>["guard"];
    children?: readonly RouteDefinition<AppState>[];
  }>,
): RouteDefinition<AppState> {
  return Object.freeze({
    id,
    ...(options?.keybinding === undefined ? {} : { keybinding: options.keybinding }),
    ...(options?.guard === undefined ? {} : { guard: options.guard }),
    ...(options?.children === undefined ? {} : { children: options.children }),
    screen: () => textNode(id),
  });
}

function fireBinding(
  binding: ReturnType<typeof createRouterIntegration<AppState>>["routeKeybindings"][string],
): void {
  if (typeof binding === "function") {
    binding({} as never);
    return;
  }
  binding.handler({} as never);
}

const SNAPSHOT = {} as WidgetFocusSnapshot;

describe("createRouterIntegration route replacement", () => {
  test("replaceRoutes remaps to first next route when all history entries are removed", () => {
    let appState: AppState = Object.freeze({ allowAdmin: false });
    let renderRequests = 0;
    const integration = createRouterIntegration<AppState>({
      routes: [route("home", { keybinding: "ctrl+1" }), route("logs", { keybinding: "ctrl+2" })],
      initialRoute: "logs",
      getState: () => appState,
      requestRouteRender: () => {
        renderRequests++;
      },
      captureFocusSnapshot: () => SNAPSHOT,
      restoreFocusSnapshot: () => {},
      assertCanMutate: () => {},
    });

    integration.router.navigate("home");
    assert.equal(integration.router.currentRoute().id, "home");

    const nextBindings = integration.replaceRoutes([
      route("settings", { keybinding: "ctrl+7" }),
      route("admin", { keybinding: "ctrl+8" }),
    ]);

    assert.equal(integration.router.currentRoute().id, "settings");
    assert.deepEqual(integration.router.history(), [{ id: "settings", params: Object.freeze({}) }]);
    assert.deepEqual(Object.keys(nextBindings).sort(), ["ctrl+7", "ctrl+8"]);
    assert.equal(renderRequests >= 2, true);

    appState = Object.freeze({ allowAdmin: true });
  });

  test("replaceRoutes preserves surviving history entries in order", () => {
    const integration = createRouterIntegration<AppState>({
      routes: [route("home"), route("logs"), route("settings")],
      initialRoute: "home",
      getState: () => Object.freeze({ allowAdmin: false }),
      requestRouteRender: () => {},
      captureFocusSnapshot: () => SNAPSHOT,
      restoreFocusSnapshot: () => {},
      assertCanMutate: () => {},
    });

    integration.router.navigate("logs");
    integration.router.navigate("settings");
    integration.router.navigate("home");
    assert.deepEqual(integration.router.history(), [
      { id: "home", params: Object.freeze({}) },
      { id: "logs", params: Object.freeze({}) },
      { id: "settings", params: Object.freeze({}) },
      { id: "home", params: Object.freeze({}) },
    ]);

    integration.replaceRoutes([route("home"), route("settings")]);
    assert.deepEqual(integration.router.history(), [
      { id: "home", params: Object.freeze({}) },
      { id: "settings", params: Object.freeze({}) },
      { id: "home", params: Object.freeze({}) },
    ]);
    assert.equal(integration.router.currentRoute().id, "home");
  });

  test("replaceRoutes applies new route guards for subsequent navigation", () => {
    let appState: AppState = Object.freeze({ allowAdmin: false });
    const integration = createRouterIntegration<AppState>({
      routes: [route("home"), route("admin")],
      initialRoute: "home",
      getState: () => appState,
      requestRouteRender: () => {},
      captureFocusSnapshot: () => SNAPSHOT,
      restoreFocusSnapshot: () => {},
      assertCanMutate: () => {},
    });

    integration.router.navigate("admin");
    assert.equal(integration.router.currentRoute().id, "admin");

    integration.replaceRoutes([
      route("home"),
      route("admin", {
        guard: (_params, state) => state.allowAdmin,
      }),
    ]);

    integration.router.navigate("home");
    integration.router.navigate("admin");
    assert.equal(integration.router.currentRoute().id, "home");

    appState = Object.freeze({ allowAdmin: true });
    integration.router.navigate("admin");
    assert.equal(integration.router.currentRoute().id, "admin");
  });

  test("stale pre-replacement keybindings become inert after replaceRoutes", () => {
    const integration = createRouterIntegration<AppState>({
      routes: [route("home", { keybinding: "ctrl+1" }), route("logs", { keybinding: "ctrl+2" })],
      initialRoute: "home",
      getState: () => Object.freeze({ allowAdmin: false }),
      requestRouteRender: () => {},
      captureFocusSnapshot: () => SNAPSHOT,
      restoreFocusSnapshot: () => {},
      assertCanMutate: () => {},
    });

    const oldLogsBinding = integration.routeKeybindings["ctrl+2"];
    assert.ok(oldLogsBinding);

    const nextBindings = integration.replaceRoutes([
      route("home", { keybinding: "ctrl+1" }),
      route("settings", { keybinding: "ctrl+2" }),
    ]);
    assert.equal(integration.router.currentRoute().id, "home");

    fireBinding(oldLogsBinding);
    assert.equal(integration.router.currentRoute().id, "home");

    const nextBinding = nextBindings["ctrl+2"];
    assert.ok(nextBinding);
    fireBinding(nextBinding);
    assert.equal(integration.router.currentRoute().id, "settings");
  });

  test("replaceRoutes rejects empty route lists", () => {
    const integration = createRouterIntegration<AppState>({
      routes: [route("home")],
      initialRoute: "home",
      getState: () => Object.freeze({ allowAdmin: false }),
      requestRouteRender: () => {},
      captureFocusSnapshot: () => SNAPSHOT,
      restoreFocusSnapshot: () => {},
      assertCanMutate: () => {},
    });

    assert.throws(
      () => integration.replaceRoutes(Object.freeze([])),
      (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_INVALID_PROPS",
    );
  });
});

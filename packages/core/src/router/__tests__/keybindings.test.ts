import { assert, describe, test } from "@rezi-ui/testkit";
import { createRouteKeybindings } from "../keybindings.js";
import type { RouteDefinition, RouterApi } from "../types.js";

function textNode(text: string) {
  return { kind: "text" as const, text, props: {} };
}

function route<S>(
  id: string,
  keybinding: string | undefined,
  children?: readonly RouteDefinition<S>[],
): RouteDefinition<S> {
  return Object.freeze({
    id,
    ...(keybinding === undefined ? {} : { keybinding }),
    ...(children === undefined ? {} : { children }),
    screen: () => textNode(id),
  });
}

function fireBinding(binding: ReturnType<typeof createRouteKeybindings<unknown>>[string]): void {
  if (typeof binding === "function") {
    binding({} as never);
    return;
  }
  binding.handler({} as never);
}

describe("createRouteKeybindings", () => {
  test("creates handlers for nested routes", () => {
    let currentId = "home";
    const navigateCalls: string[] = [];
    const router: RouterApi = {
      navigate(routeId) {
        navigateCalls.push(routeId);
        currentId = routeId;
      },
      replace() {},
      back() {},
      currentRoute() {
        return Object.freeze({ id: currentId, params: Object.freeze({}) });
      },
      canGoBack() {
        return false;
      },
      history() {
        return Object.freeze([Object.freeze({ id: currentId, params: Object.freeze({}) })]);
      },
    };

    const bindings = createRouteKeybindings(
      [
        route("home", "ctrl+1"),
        route("settings", "ctrl+2", [route("profile", "ctrl+3"), route("appearance", undefined)]),
      ],
      router,
    );

    assert.deepEqual(Object.keys(bindings).sort(), ["ctrl+1", "ctrl+2", "ctrl+3"]);
    const profileBinding = bindings["ctrl+3"];
    assert.ok(profileBinding);
    fireBinding(profileBinding);
    assert.deepEqual(navigateCalls, ["profile"]);
  });

  test("skips navigate when route is already active", () => {
    const navigateCalls: string[] = [];
    const router: RouterApi = {
      navigate(routeId) {
        navigateCalls.push(routeId);
      },
      replace() {},
      back() {},
      currentRoute() {
        return Object.freeze({ id: "home", params: Object.freeze({}) });
      },
      canGoBack() {
        return false;
      },
      history() {
        return Object.freeze([Object.freeze({ id: "home", params: Object.freeze({}) })]);
      },
    };

    const bindings = createRouteKeybindings([route("home", "ctrl+1")], router);
    const homeBinding = bindings["ctrl+1"];
    assert.ok(homeBinding);
    fireBinding(homeBinding);
    assert.deepEqual(navigateCalls, []);
  });

  test("stale binding handlers are inert when resolver remaps the keybinding", () => {
    let currentId = "home";
    const navigateCalls: string[] = [];
    const byKeybinding = new Map<string, string>([
      ["ctrl+1", "home"],
      ["ctrl+2", "logs"],
    ]);

    const router: RouterApi = {
      navigate(routeId) {
        navigateCalls.push(routeId);
        currentId = routeId;
      },
      replace() {},
      back() {},
      currentRoute() {
        return Object.freeze({ id: currentId, params: Object.freeze({}) });
      },
      canGoBack() {
        return false;
      },
      history() {
        return Object.freeze([Object.freeze({ id: currentId, params: Object.freeze({}) })]);
      },
    };

    const initialBindings = createRouteKeybindings(
      [route("home", "ctrl+1"), route("logs", "ctrl+2")],
      router,
      {
        resolveRouteIdForKeybinding: (keybinding) => byKeybinding.get(keybinding),
      },
    );

    byKeybinding.set("ctrl+2", "settings");
    const staleBinding = initialBindings["ctrl+2"];
    assert.ok(staleBinding);
    fireBinding(staleBinding);
    assert.deepEqual(navigateCalls, []);
    assert.equal(currentId, "home");
  });
});

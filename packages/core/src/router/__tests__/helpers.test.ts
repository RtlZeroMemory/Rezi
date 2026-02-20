import { assert, describe, test } from "@rezi-ui/testkit";
import {
  buildRouterBreadcrumbItems,
  buildRouterTabsItems,
  buildRouterTabsProps,
  routerBreadcrumb,
  routerTabs,
} from "../helpers.js";
import type { RouteDefinition, RouterApi } from "../types.js";

function makeRouter(
  currentId: string,
  historyEntries: readonly Readonly<{ id: string; params: Readonly<Record<string, string>> }>[],
): {
  router: RouterApi;
  calls: Array<
    Readonly<{
      method: "navigate" | "replace";
      id: string;
      params: Readonly<Record<string, string>> | undefined;
    }>
  >;
} {
  const calls: Array<
    Readonly<{
      method: "navigate" | "replace";
      id: string;
      params: Readonly<Record<string, string>> | undefined;
    }>
  > = [];

  const router: RouterApi = {
    navigate(routeId, params) {
      calls.push(Object.freeze({ method: "navigate", id: routeId, params }));
    },
    replace(routeId, params) {
      calls.push(Object.freeze({ method: "replace", id: routeId, params }));
    },
    back() {},
    currentRoute() {
      return Object.freeze({ id: currentId, params: Object.freeze({}) });
    },
    canGoBack() {
      return historyEntries.length > 1;
    },
    history() {
      return historyEntries;
    },
  };

  return { router, calls };
}

function route(id: string, title: string): RouteDefinition {
  return Object.freeze({
    id,
    title,
    screen: () => ({ kind: "text" as const, text: title, props: {} }),
  });
}

describe("router helper wrappers", () => {
  test("buildRouterBreadcrumbItems uses route titles and presses navigate", () => {
    const history = Object.freeze([
      Object.freeze({ id: "home", params: Object.freeze({}) }),
      Object.freeze({ id: "logs", params: Object.freeze({ stream: "main" }) }),
      Object.freeze({ id: "detail", params: Object.freeze({ id: "7" }) }),
    ]);
    const routes = [route("home", "Home"), route("logs", "Logs"), route("detail", "Detail")];
    const { router, calls } = makeRouter("detail", history);

    const items = buildRouterBreadcrumbItems(router, routes);

    assert.equal(items.length, 3);
    assert.equal(items[0]?.label, "Home");
    assert.equal(items[1]?.label, "Logs");
    assert.equal(items[2]?.label, "Detail");
    assert.ok(items[2]?.onPress === undefined);

    items[1]?.onPress?.();
    assert.deepEqual(calls, [
      {
        method: "navigate",
        id: "logs",
        params: Object.freeze({ stream: "main" }),
      },
    ]);
  });

  test("buildRouterTabsItems and buildRouterTabsProps produce stable tab state", () => {
    const routes = [route("home", "Home"), route("logs", "Logs"), route("settings", "Settings")];
    const history = Object.freeze([Object.freeze({ id: "home", params: Object.freeze({}) })]);
    const { router, calls } = makeRouter("home", history);

    const items = buildRouterTabsItems(routes);
    assert.equal(items.length, 3);
    assert.equal(items[0]?.key, "home");
    assert.equal(items[1]?.label, "Logs");

    const props = buildRouterTabsProps(router, routes, Object.freeze({ id: "route-tabs" }));
    assert.equal(props.id, "route-tabs");
    assert.equal(props.activeTab, "home");

    props.onChange("home");
    assert.equal(calls.length, 0);

    props.onChange("settings");
    assert.deepEqual(calls, [
      {
        method: "replace",
        id: "settings",
        params: undefined,
      },
    ]);
  });

  test("buildRouterTabsProps supports push history mode", () => {
    const routes = [route("home", "Home"), route("logs", "Logs"), route("settings", "Settings")];
    const history = Object.freeze([Object.freeze({ id: "home", params: Object.freeze({}) })]);
    const { router, calls } = makeRouter("home", history);

    const props = buildRouterTabsProps(
      router,
      routes,
      Object.freeze({ id: "route-tabs", historyMode: "push" }),
    );
    props.onChange("logs");

    assert.deepEqual(calls, [
      {
        method: "navigate",
        id: "logs",
        params: undefined,
      },
    ]);
  });

  test("routerBreadcrumb and routerTabs return navigation widgets", () => {
    const history = Object.freeze([Object.freeze({ id: "home", params: Object.freeze({}) })]);
    const routes = [route("home", "Home")];
    const { router } = makeRouter("home", history);

    const breadcrumbVNode = routerBreadcrumb(router, routes);
    const tabsVNode = routerTabs(router, routes);

    assert.equal(breadcrumbVNode.kind, "column");
    assert.equal(tabsVNode.kind, "column");
  });
});

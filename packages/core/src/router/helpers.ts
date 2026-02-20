import { createBreadcrumbWidgetVNode } from "../widgets/breadcrumb.js";
import { createTabsWidgetVNode } from "../widgets/tabs.js";
import type {
  BreadcrumbItem,
  BreadcrumbProps,
  TabsItem,
  TabsPosition,
  TabsProps,
  TabsVariant,
  VNode,
} from "../widgets/types.js";
import type { RouteDefinition, RouterApi } from "./types.js";

const EMPTY_TAB_CONTENT: VNode = Object.freeze({ kind: "text", text: "", props: {} });

/**
 * Extra props supported by `routerBreadcrumb`.
 */
export type RouterBreadcrumbProps = Readonly<{
  id?: string;
  key?: string;
  separator?: string;
}>;

/**
 * Extra props supported by `routerTabs`.
 */
export type RouterTabsProps = Readonly<{
  id?: string;
  key?: string;
  variant?: TabsVariant;
  position?: TabsPosition;
  /**
   * How tab switches should affect route history.
   *
   * - `"replace"` (default): keep one top-level entry (recommended for peer tabs).
   * - `"push"`: append a history entry per tab switch.
   */
  historyMode?: "replace" | "push";
}>;

function buildRouteTitleById<S>(
  routes: readonly RouteDefinition<S>[],
): ReadonlyMap<string, string> {
  const titleById = new Map<string, string>();
  for (const route of routes) {
    titleById.set(route.id, route.title ?? route.id);
  }
  return titleById;
}

/**
 * Build breadcrumb items from router history.
 */
export function buildRouterBreadcrumbItems<S>(
  router: RouterApi,
  routes: readonly RouteDefinition<S>[],
): readonly BreadcrumbItem[] {
  const history = router.history();
  const titleById = buildRouteTitleById(routes);

  return Object.freeze(
    history.map((entry, index) => {
      const label = titleById.get(entry.id) ?? entry.id;
      const isLast = index === history.length - 1;
      if (isLast) {
        return Object.freeze({ label });
      }
      return Object.freeze({
        label,
        onPress: () => router.navigate(entry.id, entry.params),
      });
    }),
  );
}

/**
 * Render a breadcrumb widget backed by router history.
 */
export function routerBreadcrumb<S>(
  router: RouterApi,
  routes: readonly RouteDefinition<S>[],
  props: RouterBreadcrumbProps = {},
): VNode {
  const breadcrumbProps: BreadcrumbProps = Object.freeze({
    ...(props.id === undefined ? {} : { id: props.id }),
    ...(props.key === undefined ? {} : { key: props.key }),
    ...(props.separator === undefined ? {} : { separator: props.separator }),
    items: buildRouterBreadcrumbItems(router, routes),
  });
  return createBreadcrumbWidgetVNode(breadcrumbProps);
}

/**
 * Build tabs items from registered routes.
 */
export function buildRouterTabsItems<S>(
  routes: readonly RouteDefinition<S>[],
): readonly TabsItem[] {
  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        key: route.id,
        label: route.title ?? route.id,
        content: EMPTY_TAB_CONTENT,
      }),
    ),
  );
}

/**
 * Build tabs props from route definitions + active router state.
 */
export function buildRouterTabsProps<S>(
  router: RouterApi,
  routes: readonly RouteDefinition<S>[],
  props: RouterTabsProps = {},
): TabsProps {
  const historyMode = props.historyMode ?? "replace";

  return Object.freeze({
    id: props.id ?? "router-tabs",
    ...(props.key === undefined ? {} : { key: props.key }),
    ...(props.variant === undefined ? {} : { variant: props.variant }),
    ...(props.position === undefined ? {} : { position: props.position }),
    tabs: buildRouterTabsItems(routes),
    activeTab: router.currentRoute().id,
    onChange: (nextRouteId: string) => {
      if (nextRouteId === router.currentRoute().id) return;
      if (historyMode === "push") {
        router.navigate(nextRouteId);
        return;
      }
      router.replace(nextRouteId);
    },
  });
}

/**
 * Render a tabs widget backed by route definitions.
 */
export function routerTabs<S>(
  router: RouterApi,
  routes: readonly RouteDefinition<S>[],
  props: RouterTabsProps = {},
): VNode {
  return createTabsWidgetVNode(buildRouterTabsProps(router, routes, props));
}

import {
  type RouterBreadcrumbProps,
  type RouterTabsProps,
  routerBreadcrumb as buildRouterBreadcrumb,
  routerTabs as buildRouterTabs,
} from "../../router/helpers.js";
import type { RouteDefinition, RouterApi } from "../../router/types.js";
import { createAccordionWidgetVNode } from "../accordion.js";
import { createBreadcrumbWidgetVNode } from "../breadcrumb.js";
import { createPaginationWidgetVNode } from "../pagination.js";
import { createTabsWidgetVNode } from "../tabs.js";
import type {
  AccordionProps,
  BreadcrumbProps,
  PaginationProps,
  TabsProps,
  VNode,
} from "../types.js";

export function tabs(props: TabsProps): VNode {
  return createTabsWidgetVNode(props);
}

export function routerBreadcrumb<S>(
  router: RouterApi,
  routes: readonly RouteDefinition<S>[],
  props: RouterBreadcrumbProps = {},
): VNode {
  return buildRouterBreadcrumb(router, routes, props);
}

export function routerTabs<S>(
  router: RouterApi,
  routes: readonly RouteDefinition<S>[],
  props: RouterTabsProps = {},
): VNode {
  return buildRouterTabs(router, routes, props);
}

export function accordion(props: AccordionProps): VNode {
  return createAccordionWidgetVNode(props);
}

export function breadcrumb(props: BreadcrumbProps): VNode {
  return createBreadcrumbWidgetVNode(props);
}

export function pagination(props: PaginationProps): VNode {
  return createPaginationWidgetVNode(props);
}

/**
 * packages/core/src/widgets/breadcrumb.ts — Breadcrumb widget utilities.
 *
 * Why: Provides deterministic breadcrumb helpers for clickable-item resolution,
 * focus IDs, and VNode construction.
 */

import { defineWidget } from "./composition.js";
import type { BreadcrumbProps, VNode } from "./types.js";

export const DEFAULT_BREADCRUMB_SEPARATOR = " > ";
export const BREADCRUMB_ZONE_PREFIX = "__rezi_breadcrumb_zone__";
export const BREADCRUMB_ITEM_PREFIX = "__rezi_breadcrumb_item__";

export type ParsedBreadcrumbItemId = Readonly<{
  breadcrumbId: string;
  index: number;
}>;

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string | null {
  if (value.length === 0) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function resolveBreadcrumbSeparator(separator: string | undefined): string {
  return typeof separator === "string" ? separator : DEFAULT_BREADCRUMB_SEPARATOR;
}

export function getBreadcrumbZoneId(breadcrumbId: string): string {
  return `${BREADCRUMB_ZONE_PREFIX}:${encodeSegment(breadcrumbId)}`;
}

export function getBreadcrumbItemId(breadcrumbId: string, index: number): string {
  return `${BREADCRUMB_ITEM_PREFIX}:${encodeSegment(breadcrumbId)}:${String(index)}`;
}

export function parseBreadcrumbItemId(id: string): ParsedBreadcrumbItemId | null {
  if (!id.startsWith(`${BREADCRUMB_ITEM_PREFIX}:`)) return null;
  const body = id.slice(BREADCRUMB_ITEM_PREFIX.length + 1);
  const sep = body.lastIndexOf(":");
  if (sep <= 0 || sep >= body.length - 1) return null;
  const breadcrumbId = decodeSegment(body.slice(0, sep));
  const index = Number.parseInt(body.slice(sep + 1), 10);
  if (breadcrumbId === null || !Number.isFinite(index) || index < 0) return null;
  return Object.freeze({ breadcrumbId, index });
}

export function resolveBreadcrumbClickableIndices(
  items: BreadcrumbProps["items"],
): readonly number[] {
  const out: number[] = [];
  const lastIndex = items.length - 1;
  for (let i = 0; i < items.length; i++) {
    if (i >= lastIndex) continue;
    if (typeof items[i]?.onPress !== "function") continue;
    out.push(i);
  }
  return Object.freeze(out);
}

export function buildBreadcrumbChildren(
  props: BreadcrumbProps & Readonly<{ id: string }>,
): readonly VNode[] {
  const separator = resolveBreadcrumbSeparator(props.separator);
  const clickable = new Set(resolveBreadcrumbClickableIndices(props.items));
  const rowChildren: VNode[] = [];

  for (let i = 0; i < props.items.length; i++) {
    const item = props.items[i];
    if (!item) continue;

    if (clickable.has(i)) {
      const onPress = item.onPress;
      if (typeof onPress !== "function") {
        rowChildren.push({ kind: "text", text: item.label, props: {} });
        if (i < props.items.length - 1) {
          rowChildren.push({ kind: "text", text: separator, props: {} });
        }
        continue;
      }
      rowChildren.push({
        kind: "button",
        props: {
          id: getBreadcrumbItemId(props.id, i),
          label: item.label,
          onPress,
        },
      });
    } else {
      rowChildren.push({ kind: "text", text: item.label, props: {} });
    }

    if (i < props.items.length - 1) {
      rowChildren.push({ kind: "text", text: separator, props: {} });
    }
  }

  const row: VNode = {
    kind: "row",
    props: { gap: 0 },
    children: Object.freeze(rowChildren),
  };

  const zone: VNode = {
    kind: "focusZone",
    props: {
      id: getBreadcrumbZoneId(props.id),
      tabIndex: 0,
      navigation: "linear",
      columns: 1,
      wrapAround: false,
    },
    children: Object.freeze([row]),
  };

  return Object.freeze([zone]);
}

export function createBreadcrumbVNode(props: BreadcrumbProps & Readonly<{ id: string }>): VNode {
  return {
    kind: "breadcrumb",
    props,
    children: buildBreadcrumbChildren(props),
  };
}

let breadcrumbWidgetFactory: ((props: BreadcrumbProps) => VNode) | null = null;

function getBreadcrumbWidgetFactory(): (props: BreadcrumbProps) => VNode {
  if (breadcrumbWidgetFactory === null) {
    breadcrumbWidgetFactory = defineWidget<BreadcrumbProps>(
      (props, ctx) => {
        const generatedIdRef = ctx.useRef<string>(props.id ?? ctx.id("breadcrumb"));
        if (props.id !== undefined) {
          generatedIdRef.current = props.id;
        }

        const resolvedId = props.id ?? generatedIdRef.current;
        return createBreadcrumbVNode({ ...props, id: resolvedId });
      },
      { name: "breadcrumb" },
    );
  }
  return breadcrumbWidgetFactory;
}

export function createBreadcrumbWidgetVNode(props: BreadcrumbProps): VNode {
  return getBreadcrumbWidgetFactory()(props);
}

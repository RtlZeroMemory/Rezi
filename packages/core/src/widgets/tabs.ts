/**
 * packages/core/src/widgets/tabs.ts — Tabs widget utilities.
 *
 * Why: Provides deterministic Tabs helpers for active-tab normalization,
 * focus ID generation, keyboard movement, and VNode construction.
 */

import { defineWidget } from "./composition.js";
import type { TabsProps, VNode } from "./types.js";

export const TABS_BAR_ZONE_PREFIX = "__rezi_tabs_bar__";
export const TABS_CONTENT_ZONE_PREFIX = "__rezi_tabs_content__";
export const TABS_TRIGGER_PREFIX = "__rezi_tabs_trigger__";

export type TabsDirection = "next" | "prev";

export type ParsedTabsTriggerId = Readonly<{
  tabsId: string;
  index: number;
  tabKey: string;
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

export function getTabsBarZoneId(tabsId: string): string {
  return `${TABS_BAR_ZONE_PREFIX}:${encodeSegment(tabsId)}`;
}

export function getTabsContentZoneId(tabsId: string): string {
  return `${TABS_CONTENT_ZONE_PREFIX}:${encodeSegment(tabsId)}`;
}

export function parseTabsBarZoneId(id: string): string | null {
  if (!id.startsWith(`${TABS_BAR_ZONE_PREFIX}:`)) return null;
  return decodeSegment(id.slice(TABS_BAR_ZONE_PREFIX.length + 1));
}

export function parseTabsContentZoneId(id: string): string | null {
  if (!id.startsWith(`${TABS_CONTENT_ZONE_PREFIX}:`)) return null;
  return decodeSegment(id.slice(TABS_CONTENT_ZONE_PREFIX.length + 1));
}

export function getTabsTriggerId(tabsId: string, index: number, tabKey: string): string {
  return `${TABS_TRIGGER_PREFIX}:${encodeSegment(tabsId)}:${String(index)}:${encodeSegment(tabKey)}`;
}

export function parseTabsTriggerId(id: string): ParsedTabsTriggerId | null {
  if (!id.startsWith(`${TABS_TRIGGER_PREFIX}:`)) return null;
  const body = id.slice(TABS_TRIGGER_PREFIX.length + 1);
  const firstSep = body.indexOf(":");
  if (firstSep <= 0) return null;
  const secondSep = body.indexOf(":", firstSep + 1);
  if (secondSep <= firstSep + 1) return null;
  if (body.indexOf(":", secondSep + 1) !== -1) return null;

  const tabsId = decodeSegment(body.slice(0, firstSep));
  const indexRaw = Number.parseInt(body.slice(firstSep + 1, secondSep), 10);
  const tabKey = decodeSegment(body.slice(secondSep + 1));
  if (tabsId === null || tabKey === null) return null;
  if (!Number.isFinite(indexRaw) || indexRaw < 0) return null;

  return Object.freeze({ tabsId, index: indexRaw, tabKey });
}

export function resolveTabsActiveIndex(tabs: TabsProps["tabs"], activeTab: string): number {
  if (tabs.length === 0) return -1;
  const idx = tabs.findIndex((tab) => tab.key === activeTab);
  return idx >= 0 ? idx : 0;
}

export function moveTabsIndex(
  currentIndex: number,
  count: number,
  direction: TabsDirection,
  wrapAround: boolean,
): number {
  if (count <= 0) return -1;
  const clamped = Math.max(0, Math.min(count - 1, currentIndex));

  if (direction === "next") {
    if (clamped + 1 < count) return clamped + 1;
    return wrapAround ? 0 : clamped;
  }

  if (clamped - 1 >= 0) return clamped - 1;
  return wrapAround ? count - 1 : clamped;
}

function formatTabsLabel(
  label: string,
  active: boolean,
  variant: NonNullable<TabsProps["variant"]>,
): string {
  if (variant === "enclosed") {
    return active ? `[${label}]` : ` ${label} `;
  }
  if (variant === "pills") {
    return active ? `( ${label} )` : `  ${label}  `;
  }
  return active ? `> ${label}` : `  ${label}`;
}

export function buildTabsChildren(props: TabsProps): readonly VNode[] {
  const activeIndex = resolveTabsActiveIndex(props.tabs, props.activeTab);
  const variant = props.variant ?? "line";
  const position = props.position ?? "top";

  const tabButtons: VNode[] = [];
  for (let i = 0; i < props.tabs.length; i++) {
    const tab = props.tabs[i];
    if (!tab) continue;
    tabButtons.push({
      kind: "button",
      props: {
        id: getTabsTriggerId(props.id, i, tab.key),
        label: formatTabsLabel(tab.label, i === activeIndex, variant),
        onPress: () => props.onChange(tab.key),
      },
    });
  }

  const barZone: VNode = {
    kind: "focusZone",
    props: {
      id: getTabsBarZoneId(props.id),
      tabIndex: 0,
      navigation: "linear",
      columns: 1,
      wrapAround: true,
    },
    children: Object.freeze(tabButtons),
  };

  const activeContent = activeIndex >= 0 ? props.tabs[activeIndex]?.content : undefined;
  const contentZone: VNode = {
    kind: "focusZone",
    props: {
      id: getTabsContentZoneId(props.id),
      tabIndex: 1,
      navigation: "none",
      columns: 1,
      wrapAround: false,
    },
    children: activeContent ? Object.freeze([activeContent]) : Object.freeze([]),
  };

  return position === "bottom"
    ? Object.freeze([contentZone, barZone])
    : Object.freeze([barZone, contentZone]);
}

export function createTabsVNode(props: TabsProps): VNode {
  return {
    kind: "tabs",
    props,
    children: buildTabsChildren(props),
  };
}

let tabsWidgetFactory: ((props: TabsProps) => VNode) | null = null;

function getTabsWidgetFactory(): (props: TabsProps) => VNode {
  if (tabsWidgetFactory === null) {
    tabsWidgetFactory = defineWidget<TabsProps>(
      (props, ctx) => {
        const idRef = ctx.useRef(props.id);
        idRef.current = props.id;
        return createTabsVNode(props);
      },
      { name: "tabs" },
    );
  }
  return tabsWidgetFactory;
}

export function createTabsWidgetVNode(props: TabsProps): VNode {
  return getTabsWidgetFactory()(props);
}

/**
 * packages/core/src/widgets/accordion.ts — Accordion widget utilities.
 *
 * Why: Provides deterministic expand/collapse helpers, focus IDs, and VNode
 * construction for accordion widgets.
 */

import { decodeIdSegment, encodeIdSegment } from "../runtime/idCodec.js";
import { defineWidget } from "./composition.js";
import type { AccordionProps, VNode } from "./types.js";

export const ACCORDION_HEADERS_ZONE_PREFIX = "__rezi_accordion_headers__";
export const ACCORDION_TRIGGER_PREFIX = "__rezi_accordion_trigger__";

export type ParsedAccordionTriggerId = Readonly<{
  accordionId: string;
  index: number;
  itemKey: string;
}>;

export function getAccordionHeadersZoneId(accordionId: string): string {
  return `${ACCORDION_HEADERS_ZONE_PREFIX}:${encodeIdSegment(accordionId)}`;
}

export function getAccordionTriggerId(accordionId: string, index: number, itemKey: string): string {
  return `${ACCORDION_TRIGGER_PREFIX}:${encodeIdSegment(accordionId)}:${String(index)}:${encodeIdSegment(itemKey)}`;
}

export function parseAccordionTriggerId(id: string): ParsedAccordionTriggerId | null {
  if (!id.startsWith(`${ACCORDION_TRIGGER_PREFIX}:`)) return null;
  const body = id.slice(ACCORDION_TRIGGER_PREFIX.length + 1);
  const firstSep = body.indexOf(":");
  if (firstSep <= 0) return null;
  const secondSep = body.indexOf(":", firstSep + 1);
  if (secondSep <= firstSep + 1) return null;
  if (body.indexOf(":", secondSep + 1) !== -1) return null;

  const accordionId = decodeIdSegment(body.slice(0, firstSep));
  const indexRaw = Number.parseInt(body.slice(firstSep + 1, secondSep), 10);
  const itemKey = decodeIdSegment(body.slice(secondSep + 1));
  if (accordionId === null || itemKey === null) return null;
  if (!Number.isFinite(indexRaw) || indexRaw < 0) return null;

  return Object.freeze({ accordionId, index: indexRaw, itemKey });
}

export function resolveAccordionExpanded(
  expanded: readonly string[],
  itemKeys: readonly string[],
  allowMultiple: boolean,
): readonly string[] {
  const itemKeySet = new Set(itemKeys);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of expanded) {
    if (!itemKeySet.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  if (allowMultiple) return Object.freeze(out);
  return out.length > 0 ? Object.freeze([out[0] ?? ""]) : Object.freeze([]);
}

export function toggleAccordionExpanded(
  expanded: readonly string[],
  itemKey: string,
  itemKeys: readonly string[],
  allowMultiple: boolean,
): readonly string[] {
  const normalized = resolveAccordionExpanded(expanded, itemKeys, allowMultiple);
  if (!itemKeys.includes(itemKey)) return normalized;

  if (allowMultiple) {
    if (normalized.includes(itemKey)) {
      return Object.freeze(normalized.filter((value) => value !== itemKey));
    }
    const next = [...normalized, itemKey];
    const ordered = itemKeys.filter((key) => next.includes(key));
    return Object.freeze(ordered);
  }

  if (normalized[0] === itemKey) return Object.freeze([]);
  return Object.freeze([itemKey]);
}

function buildAccordionHeaderLabel(title: string, expanded: boolean): string {
  return expanded ? `v ${title}` : `> ${title}`;
}

export function buildAccordionChildren(props: AccordionProps): readonly VNode[] {
  const itemKeys = props.items.map((item) => item.key);
  const allowMultiple = props.allowMultiple === true;
  const expanded = resolveAccordionExpanded(props.expanded, itemKeys, allowMultiple);
  const expandedSet = new Set(expanded);

  const headerButtons: VNode[] = [];
  for (let i = 0; i < props.items.length; i++) {
    const item = props.items[i];
    if (!item) continue;
    const isExpanded = expandedSet.has(item.key);
    headerButtons.push({
      kind: "button",
      props: {
        id: getAccordionTriggerId(props.id, i, item.key),
        label: buildAccordionHeaderLabel(item.title, isExpanded),
        onPress: () => {
          const next = toggleAccordionExpanded(props.expanded, item.key, itemKeys, allowMultiple);
          props.onChange(next);
        },
      },
    });
  }

  const children: VNode[] = [
    {
      kind: "focusZone",
      props: {
        id: getAccordionHeadersZoneId(props.id),
        tabIndex: 0,
        navigation: "linear",
        columns: 1,
        wrapAround: false,
      },
      children: Object.freeze(headerButtons),
    },
  ];

  for (const item of props.items) {
    if (!item) continue;
    if (!expandedSet.has(item.key)) continue;
    children.push(item.content);
  }

  return Object.freeze(children);
}

export function createAccordionVNode(props: AccordionProps): VNode {
  return {
    kind: "accordion",
    props,
    children: buildAccordionChildren(props),
  };
}

let accordionWidgetFactory: ((props: AccordionProps) => VNode) | null = null;

function getAccordionWidgetFactory(): (props: AccordionProps) => VNode {
  if (accordionWidgetFactory === null) {
    accordionWidgetFactory = defineWidget<AccordionProps>(
      (props, ctx) => {
        const idRef = ctx.useRef(props.id);
        idRef.current = props.id;
        return createAccordionVNode(props);
      },
      { name: "accordion" },
    );
  }
  return accordionWidgetFactory;
}

export function createAccordionWidgetVNode(props: AccordionProps): VNode {
  return getAccordionWidgetFactory()(props);
}

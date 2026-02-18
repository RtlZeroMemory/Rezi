/**
 * packages/core/src/widgets/pagination.ts — Pagination widget utilities.
 *
 * Why: Provides deterministic pagination helpers for page normalization,
 * visible-page computation, focus IDs, keyboard movement semantics, and
 * VNode construction.
 */

import { defineWidget } from "./composition.js";
import type { PaginationProps, VNode } from "./types.js";

export const PAGINATION_ZONE_PREFIX = "__rezi_pagination_zone__";
export const PAGINATION_CONTROL_PREFIX = "__rezi_pagination_control__";
export const PAGINATION_PAGE_PREFIX = "__rezi_pagination_page__";
export const PAGINATION_ELLIPSIS = "...";

export type PaginationControl = "first" | "prev" | "next" | "last";

export type PaginationVisibleItem = number | typeof PAGINATION_ELLIPSIS;

export type ParsedPaginationId =
  | Readonly<{
      paginationId: string;
      kind: "control";
      control: PaginationControl;
    }>
  | Readonly<{
      paginationId: string;
      kind: "page";
      page: number;
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

export function normalizeTotalPages(totalPages: number): number {
  if (!Number.isFinite(totalPages)) return 1;
  const asInt = Math.trunc(totalPages);
  return Math.max(1, asInt);
}

export function normalizePaginationPage(page: number, totalPages: number): number {
  const safeTotal = normalizeTotalPages(totalPages);
  if (!Number.isFinite(page)) return 1;
  const asInt = Math.trunc(page);
  if (asInt <= 1) return 1;
  if (asInt >= safeTotal) return safeTotal;
  return asInt;
}

export function movePaginationPage(
  page: number,
  totalPages: number,
  direction: "prev" | "next" | "first" | "last",
): number {
  const safeTotal = normalizeTotalPages(totalPages);
  const safePage = normalizePaginationPage(page, safeTotal);

  if (direction === "first") return 1;
  if (direction === "last") return safeTotal;
  if (direction === "prev") return safePage <= 1 ? 1 : safePage - 1;
  return safePage >= safeTotal ? safeTotal : safePage + 1;
}

export function computeVisiblePaginationItems(
  page: number,
  totalPages: number,
  maxVisible = 7,
): readonly PaginationVisibleItem[] {
  const safeTotal = normalizeTotalPages(totalPages);
  const safePage = normalizePaginationPage(page, safeTotal);
  const safeMaxVisible = Math.max(5, Math.trunc(maxVisible));

  if (safeTotal <= safeMaxVisible) {
    const all: number[] = [];
    for (let p = 1; p <= safeTotal; p++) all.push(p);
    return Object.freeze(all);
  }

  const siblingCount = Math.max(1, Math.floor((safeMaxVisible - 3) / 2) - 1);
  const left = Math.max(2, safePage - siblingCount);
  const right = Math.min(safeTotal - 1, safePage + siblingCount);

  const showLeftDots = left > 2;
  const showRightDots = right < safeTotal - 1;

  const out: PaginationVisibleItem[] = [1];

  if (showLeftDots) {
    out.push(PAGINATION_ELLIPSIS);
  } else {
    for (let p = 2; p < left; p++) out.push(p);
  }

  for (let p = left; p <= right; p++) out.push(p);

  if (showRightDots) {
    out.push(PAGINATION_ELLIPSIS);
  } else {
    for (let p = right + 1; p < safeTotal; p++) out.push(p);
  }

  out.push(safeTotal);
  return Object.freeze(out);
}

export function getPaginationZoneId(paginationId: string): string {
  return `${PAGINATION_ZONE_PREFIX}:${encodeSegment(paginationId)}`;
}

export function getPaginationControlId(paginationId: string, control: PaginationControl): string {
  return `${PAGINATION_CONTROL_PREFIX}:${encodeSegment(paginationId)}:${control}`;
}

export function getPaginationPageId(paginationId: string, page: number): string {
  return `${PAGINATION_PAGE_PREFIX}:${encodeSegment(paginationId)}:${String(normalizePaginationPage(page, Number.MAX_SAFE_INTEGER))}`;
}

export function parsePaginationId(id: string): ParsedPaginationId | null {
  if (id.startsWith(`${PAGINATION_CONTROL_PREFIX}:`)) {
    const body = id.slice(PAGINATION_CONTROL_PREFIX.length + 1);
    const sep = body.lastIndexOf(":");
    if (sep <= 0 || sep >= body.length - 1) return null;
    const paginationId = decodeSegment(body.slice(0, sep));
    const control = body.slice(sep + 1);
    if (paginationId === null) return null;
    if (control !== "first" && control !== "prev" && control !== "next" && control !== "last") {
      return null;
    }
    return Object.freeze({ paginationId, kind: "control", control });
  }

  if (id.startsWith(`${PAGINATION_PAGE_PREFIX}:`)) {
    const body = id.slice(PAGINATION_PAGE_PREFIX.length + 1);
    const sep = body.lastIndexOf(":");
    if (sep <= 0 || sep >= body.length - 1) return null;
    const paginationId = decodeSegment(body.slice(0, sep));
    const pageRaw = Number.parseInt(body.slice(sep + 1), 10);
    if (paginationId === null || !Number.isFinite(pageRaw) || pageRaw < 1) return null;
    return Object.freeze({ paginationId, kind: "page", page: pageRaw });
  }

  return null;
}

export function buildPaginationChildren(props: PaginationProps): readonly VNode[] {
  const safeTotal = normalizeTotalPages(props.totalPages);
  const safePage = normalizePaginationPage(props.page, safeTotal);
  const items = computeVisiblePaginationItems(safePage, safeTotal, 7);
  const showFirstLast = props.showFirstLast === true;

  const controls: VNode[] = [];

  if (showFirstLast) {
    controls.push({
      kind: "button",
      props: {
        id: getPaginationControlId(props.id, "first"),
        label: "<<",
        disabled: safePage <= 1,
        onPress: () => props.onChange(1),
      },
    });
  }

  controls.push({
    kind: "button",
    props: {
      id: getPaginationControlId(props.id, "prev"),
      label: "<",
      disabled: safePage <= 1,
      onPress: () => props.onChange(movePaginationPage(safePage, safeTotal, "prev")),
    },
  });

  for (const token of items) {
    if (token === PAGINATION_ELLIPSIS) {
      controls.push({ kind: "text", text: PAGINATION_ELLIPSIS, props: {} });
      continue;
    }

    controls.push({
      kind: "button",
      props: {
        id: getPaginationPageId(props.id, token),
        label: token === safePage ? `[${String(token)}]` : String(token),
        onPress: () => props.onChange(token),
      },
    });
  }

  controls.push({
    kind: "button",
    props: {
      id: getPaginationControlId(props.id, "next"),
      label: ">",
      disabled: safePage >= safeTotal,
      onPress: () => props.onChange(movePaginationPage(safePage, safeTotal, "next")),
    },
  });

  if (showFirstLast) {
    controls.push({
      kind: "button",
      props: {
        id: getPaginationControlId(props.id, "last"),
        label: ">>",
        disabled: safePage >= safeTotal,
        onPress: () => props.onChange(safeTotal),
      },
    });
  }

  const zone: VNode = {
    kind: "focusZone",
    props: {
      id: getPaginationZoneId(props.id),
      tabIndex: 0,
      navigation: "linear",
      columns: 1,
      wrapAround: false,
    },
    children: Object.freeze(controls),
  };

  return Object.freeze([zone]);
}

export function createPaginationVNode(props: PaginationProps): VNode {
  return {
    kind: "pagination",
    props,
    children: buildPaginationChildren(props),
  };
}

let paginationWidgetFactory: ((props: PaginationProps) => VNode) | null = null;

function getPaginationWidgetFactory(): (props: PaginationProps) => VNode {
  if (paginationWidgetFactory === null) {
    paginationWidgetFactory = defineWidget<PaginationProps>(
      (props, ctx) => {
        const idRef = ctx.useRef(props.id);
        idRef.current = props.id;
        return createPaginationVNode(props);
      },
      { name: "pagination" },
    );
  }
  return paginationWidgetFactory;
}

export function createPaginationWidgetVNode(props: PaginationProps): VNode {
  return getPaginationWidgetFactory()(props);
}

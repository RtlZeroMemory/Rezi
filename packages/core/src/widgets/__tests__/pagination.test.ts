import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import type { FocusZone } from "../../runtime/focus.js";
import { routePaginationKey } from "../../runtime/router/pagination.js";
import {
  PAGINATION_ELLIPSIS,
  buildPaginationChildren,
  computeVisiblePaginationItems,
  createPaginationVNode,
  getPaginationControlId,
  getPaginationPageId,
  getPaginationZoneId,
  movePaginationPage,
  normalizePaginationPage,
  normalizeTotalPages,
  parsePaginationId,
} from "../pagination.js";
import { ui } from "../ui.js";

function keyDown(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function zone(id: string, focusableIds: readonly string[], wrapAround: boolean): FocusZone {
  return {
    id,
    tabIndex: 0,
    navigation: "linear",
    columns: 1,
    wrapAround,
    focusableIds,
    lastFocusedId: null,
  };
}

describe("pagination normalization", () => {
  test("normalizeTotalPages clamps to minimum 1", () => {
    assert.equal(normalizeTotalPages(Number.NaN), 1);
    assert.equal(normalizeTotalPages(-10), 1);
    assert.equal(normalizeTotalPages(4.9), 4);
  });

  test("normalizePaginationPage clamps within total pages", () => {
    assert.equal(normalizePaginationPage(-2, 10), 1);
    assert.equal(normalizePaginationPage(999, 10), 10);
    assert.equal(normalizePaginationPage(3.9, 10), 3);
  });

  test("movePaginationPage supports prev/next/first/last", () => {
    assert.equal(movePaginationPage(1, 10, "prev"), 1);
    assert.equal(movePaginationPage(1, 10, "next"), 2);
    assert.equal(movePaginationPage(5, 10, "first"), 1);
    assert.equal(movePaginationPage(5, 10, "last"), 10);
  });
});

describe("pagination visible items", () => {
  test("returns full range for small totals", () => {
    assert.deepEqual(computeVisiblePaginationItems(2, 4, 7), [1, 2, 3, 4]);
  });

  test("returns ellipsis window for large totals", () => {
    assert.deepEqual(computeVisiblePaginationItems(10, 20, 7), [
      1,
      PAGINATION_ELLIPSIS,
      9,
      10,
      11,
      PAGINATION_ELLIPSIS,
      20,
    ]);
  });

  test("normalizes invalid maxVisible to minimum", () => {
    assert.deepEqual(computeVisiblePaginationItems(10, 20, 2), [
      1,
      PAGINATION_ELLIPSIS,
      9,
      10,
      11,
      PAGINATION_ELLIPSIS,
      20,
    ]);
  });
});

describe("pagination ids and vnode", () => {
  test("page and control IDs are deterministic", () => {
    assert.equal(getPaginationZoneId("pages"), "__rezi_pagination_zone__:pages");
    assert.equal(getPaginationControlId("pages", "next"), "__rezi_pagination_control__:pages:next");
    assert.equal(getPaginationPageId("pages", 3), "__rezi_pagination_page__:pages:3");
  });

  test("parsePaginationId round-trips control and page ids", () => {
    assert.deepEqual(parsePaginationId(getPaginationControlId("pages", "first")), {
      paginationId: "pages",
      kind: "control",
      control: "first",
    });
    assert.deepEqual(parsePaginationId(getPaginationPageId("pages", 4)), {
      paginationId: "pages",
      kind: "page",
      page: 4,
    });
  });

  test("createPaginationVNode emits pagination kind", () => {
    const vnode = createPaginationVNode({
      id: "pages",
      page: 3,
      totalPages: 9,
      onChange: () => undefined,
      showFirstLast: true,
    });
    assert.equal(vnode.kind, "pagination");
    assert.equal(vnode.children.length, 1);
  });

  test("buildPaginationChildren includes first/last controls when enabled", () => {
    const children = buildPaginationChildren({
      id: "pages",
      page: 3,
      totalPages: 9,
      onChange: () => undefined,
      showFirstLast: true,
    });
    assert.equal(children.length, 1);
    const zoneNode = children[0];
    assert.equal(zoneNode?.kind, "focusZone");
    if (zoneNode?.kind !== "focusZone") return;
    const ids = zoneNode.children
      .filter((child) => child.kind === "button")
      .map((child) => (child.kind === "button" ? child.props.id : ""));
    assert.equal(ids.includes(getPaginationControlId("pages", "first")), true);
    assert.equal(ids.includes(getPaginationControlId("pages", "last")), true);
  });

  test("ui.pagination returns a composite wrapper vnode", () => {
    const vnode = ui.pagination({
      id: "pages",
      page: 1,
      totalPages: 4,
      onChange: () => undefined,
    });
    assert.equal(vnode.kind, "column");
  });
});

describe("pagination keyboard routing", () => {
  const zoneId = getPaginationZoneId("pages");
  const page1 = getPaginationPageId("pages", 1);
  const page2 = getPaginationPageId("pages", 2);
  const page3 = getPaginationPageId("pages", 3);
  const page9 = getPaginationPageId("pages", 9);
  const page10 = getPaginationPageId("pages", 10);
  const page11 = getPaginationPageId("pages", 11);
  const page20 = getPaginationPageId("pages", 20);
  const prev = getPaginationControlId("pages", "prev");
  const next = getPaginationControlId("pages", "next");
  const first = getPaginationControlId("pages", "first");
  const last = getPaginationControlId("pages", "last");

  test("left/right arrows move focus and emit press", () => {
    const res = routePaginationKey(keyDown(23), {
      focusedId: page1,
      activeZoneId: zoneId,
      zones: new Map([[zoneId, zone(zoneId, [page1, page2, page3], false)]]),
      enabledById: new Map([
        [page1, true],
        [page2, true],
        [page3, true],
      ]),
      pressableIds: new Set([page1, page2, page3]),
    });

    assert.deepEqual(res, {
      nextFocusedId: page2,
      nextZoneId: zoneId,
      action: { id: page2, action: "press" },
    });
  });

  test("arrow at edge is a no-op when zone does not wrap", () => {
    const res = routePaginationKey(keyDown(22), {
      focusedId: page1,
      activeZoneId: zoneId,
      zones: new Map([[zoneId, zone(zoneId, [page1, page2, page3], false)]]),
      enabledById: new Map([
        [page1, true],
        [page2, true],
        [page3, true],
      ]),
      pressableIds: new Set([page1, page2, page3]),
    });

    assert.deepEqual(res, {});
  });

  test("home/end jump to first/last controls when present", () => {
    const zones = new Map([[zoneId, zone(zoneId, [first, page1, page2, page3, last], false)]]);
    const enabled = new Map([
      [first, true],
      [page1, true],
      [page2, true],
      [page3, true],
      [last, true],
    ]);
    const pressable = new Set([first, page1, page2, page3, last]);

    const home = routePaginationKey(keyDown(12), {
      focusedId: page2,
      activeZoneId: zoneId,
      zones,
      enabledById: enabled,
      pressableIds: pressable,
    });
    assert.deepEqual(home, {
      nextFocusedId: first,
      nextZoneId: zoneId,
      action: { id: first, action: "press" },
    });

    const end = routePaginationKey(keyDown(13), {
      focusedId: page2,
      activeZoneId: zoneId,
      zones,
      enabledById: enabled,
      pressableIds: pressable,
    });
    assert.deepEqual(end, {
      nextFocusedId: last,
      nextZoneId: zoneId,
      action: { id: last, action: "press" },
    });
  });

  test("home/end are no-ops when first/last controls are absent", () => {
    const res = routePaginationKey(keyDown(12), {
      focusedId: page2,
      activeZoneId: zoneId,
      zones: new Map([[zoneId, zone(zoneId, [page1, page2, page3], false)]]),
      enabledById: new Map([
        [page1, true],
        [page2, true],
        [page3, true],
      ]),
      pressableIds: new Set([page1, page2, page3]),
    });
    assert.deepEqual(res, {});
  });

  test("right arrow on sparse page buttons uses next control instead of jumping pages", () => {
    const res = routePaginationKey(keyDown(23), {
      focusedId: page1,
      activeZoneId: zoneId,
      zones: new Map([
        [zoneId, zone(zoneId, [prev, page1, page9, page10, page11, page20, next], false)],
      ]),
      enabledById: new Map([
        [prev, true],
        [page1, true],
        [page9, true],
        [page10, true],
        [page11, true],
        [page20, true],
        [next, true],
      ]),
      pressableIds: new Set([prev, page1, page9, page10, page11, page20, next]),
    });

    assert.deepEqual(res, {
      nextFocusedId: page1,
      nextZoneId: zoneId,
      action: { id: next, action: "press" },
    });
  });

  test("left arrow on sparse page buttons uses prev control instead of jumping pages", () => {
    const res = routePaginationKey(keyDown(22), {
      focusedId: page20,
      activeZoneId: zoneId,
      zones: new Map([
        [zoneId, zone(zoneId, [prev, page1, page9, page10, page11, page20, next], false)],
      ]),
      enabledById: new Map([
        [prev, true],
        [page1, true],
        [page9, true],
        [page10, true],
        [page11, true],
        [page20, true],
        [next, true],
      ]),
      pressableIds: new Set([prev, page1, page9, page10, page11, page20, next]),
    });

    assert.deepEqual(res, {
      nextFocusedId: page20,
      nextZoneId: zoneId,
      action: { id: prev, action: "press" },
    });
  });
});

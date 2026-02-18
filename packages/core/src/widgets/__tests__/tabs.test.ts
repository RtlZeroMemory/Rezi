import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import type { FocusZone } from "../../runtime/focus.js";
import { routeTabsKey } from "../../runtime/router/tabs.js";
import {
  buildTabsChildren,
  createTabsVNode,
  getTabsBarZoneId,
  getTabsContentZoneId,
  getTabsTriggerId,
  moveTabsIndex,
  parseTabsBarZoneId,
  parseTabsContentZoneId,
  parseTabsTriggerId,
  resolveTabsActiveIndex,
} from "../tabs.js";
import { ui } from "../ui.js";

function keyDown(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function keyUp(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "up" };
}

function zone(
  id: string,
  focusableIds: readonly string[],
  wrapAround: boolean,
  parentZoneId?: string,
): FocusZone {
  return {
    id,
    tabIndex: 0,
    navigation: "linear",
    columns: 1,
    wrapAround,
    focusableIds,
    ...(parentZoneId ? { parentZoneId } : {}),
    lastFocusedId: null,
  };
}

const props = {
  id: "tabs-main",
  tabs: [
    { key: "one", label: "One", content: ui.text("one") },
    { key: "two", label: "Two", content: ui.text("two") },
    { key: "three", label: "Three", content: ui.text("three") },
  ],
  activeTab: "two",
  onChange: () => undefined,
} as const;

describe("tabs id helpers", () => {
  test("bar zone id round-trips", () => {
    const id = getTabsBarZoneId("tabs/main");
    assert.equal(parseTabsBarZoneId(id), "tabs/main");
  });

  test("content zone id round-trips", () => {
    const id = getTabsContentZoneId("tabs/main");
    assert.equal(parseTabsContentZoneId(id), "tabs/main");
  });

  test("trigger id round-trips with encoded key", () => {
    const id = getTabsTriggerId("tabs/main", 2, "three/advanced");
    assert.deepEqual(parseTabsTriggerId(id), {
      tabsId: "tabs/main",
      index: 2,
      tabKey: "three/advanced",
    });
  });

  test("parseTabsTriggerId rejects malformed ids", () => {
    assert.equal(parseTabsTriggerId("bad"), null);
    assert.equal(parseTabsTriggerId("__rezi_tabs_trigger__:x"), null);
    assert.equal(parseTabsTriggerId("__rezi_tabs_trigger__:x:y"), null);
    assert.equal(parseTabsTriggerId("__rezi_tabs_trigger__:%:1:tab"), null);
  });
});

describe("tabs active and movement", () => {
  test("resolveTabsActiveIndex finds matching key", () => {
    assert.equal(resolveTabsActiveIndex(props.tabs, "three"), 2);
  });

  test("resolveTabsActiveIndex falls back to first key", () => {
    assert.equal(resolveTabsActiveIndex(props.tabs, "missing"), 0);
  });

  test("resolveTabsActiveIndex returns -1 for empty tabs", () => {
    assert.equal(resolveTabsActiveIndex([], "missing"), -1);
  });

  test("moveTabsIndex next wraps when enabled", () => {
    assert.equal(moveTabsIndex(2, 3, "next", true), 0);
  });

  test("moveTabsIndex next clamps at edge when wrap disabled", () => {
    assert.equal(moveTabsIndex(2, 3, "next", false), 2);
  });

  test("moveTabsIndex prev wraps when enabled", () => {
    assert.equal(moveTabsIndex(0, 3, "prev", true), 2);
  });

  test("moveTabsIndex prev clamps at edge when wrap disabled", () => {
    assert.equal(moveTabsIndex(0, 3, "prev", false), 0);
  });

  test("moveTabsIndex returns -1 for zero-count", () => {
    assert.equal(moveTabsIndex(0, 0, "next", true), -1);
  });
});

describe("tabs vnode construction", () => {
  test("buildTabsChildren returns bar then content for top position", () => {
    const children = buildTabsChildren({ ...props, position: "top" });
    assert.equal(children.length, 2);
    assert.equal(children[0]?.kind, "focusZone");
    assert.equal(children[1]?.kind, "focusZone");
  });

  test("buildTabsChildren returns content then bar for bottom position", () => {
    const children = buildTabsChildren({ ...props, position: "bottom" });
    assert.equal(children.length, 2);
    const first = children[0];
    const second = children[1];
    assert.equal(first?.kind, "focusZone");
    assert.equal(second?.kind, "focusZone");
    if (first?.kind === "focusZone") {
      assert.equal(first.props.id, getTabsContentZoneId(props.id));
    }
    if (second?.kind === "focusZone") {
      assert.equal(second.props.id, getTabsBarZoneId(props.id));
    }
  });

  test("buildTabsChildren includes only active content vnode", () => {
    const children = buildTabsChildren({ ...props, activeTab: "one" });
    const content = children[1];
    assert.equal(content?.kind, "focusZone");
    if (content?.kind !== "focusZone") return;
    assert.equal(content.children.length, 1);
    const child = content.children[0];
    assert.equal(child?.kind, "text");
    if (child?.kind === "text") {
      assert.equal(child.text, "one");
    }
  });

  test("createTabsVNode emits tabs kind and generated children", () => {
    const vnode = createTabsVNode(props);
    assert.equal(vnode.kind, "tabs");
    assert.equal(vnode.children.length, 2);
  });

  test("ui.tabs returns a composite wrapper vnode", () => {
    const vnode = ui.tabs(props);
    assert.equal(vnode.kind, "column");
  });
});

describe("tabs keyboard routing", () => {
  const t0 = getTabsTriggerId("tabs-main", 0, "one");
  const t1 = getTabsTriggerId("tabs-main", 1, "two");
  const t2 = getTabsTriggerId("tabs-main", 2, "three");
  const barId = getTabsBarZoneId("tabs-main");
  const contentId = getTabsContentZoneId("tabs-main");

  test("returns null for non-tab focused ids", () => {
    const res = routeTabsKey(keyDown(22), {
      focusedId: "other",
      activeZoneId: null,
      zones: new Map(),
      enabledById: new Map(),
      pressableIds: new Set(),
    });
    assert.equal(res, null);
  });

  test("ignores key-up events", () => {
    const res = routeTabsKey(keyUp(22), {
      focusedId: t1,
      activeZoneId: barId,
      zones: new Map([[barId, zone(barId, [t0, t1, t2], true)]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
      ]),
      pressableIds: new Set([t0, t1, t2]),
    });
    assert.equal(res, null);
  });

  test("left arrow moves focus and presses previous tab", () => {
    const res = routeTabsKey(keyDown(22), {
      focusedId: t1,
      activeZoneId: barId,
      zones: new Map([[barId, zone(barId, [t0, t1, t2], true)]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
      ]),
      pressableIds: new Set([t0, t1, t2]),
    });

    assert.deepEqual(res, {
      nextFocusedId: t0,
      nextZoneId: barId,
      action: { id: t0, action: "press" },
    });
  });

  test("right arrow wraps and presses next tab", () => {
    const res = routeTabsKey(keyDown(23), {
      focusedId: t2,
      activeZoneId: barId,
      zones: new Map([[barId, zone(barId, [t0, t1, t2], true)]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
      ]),
      pressableIds: new Set([t0, t1, t2]),
    });

    assert.deepEqual(res, {
      nextFocusedId: t0,
      nextZoneId: barId,
      action: { id: t0, action: "press" },
    });
  });

  test("arrow at edge returns no-op when zone does not wrap", () => {
    const res = routeTabsKey(keyDown(23), {
      focusedId: t2,
      activeZoneId: barId,
      zones: new Map([[barId, zone(barId, [t0, t1, t2], false)]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
      ]),
      pressableIds: new Set([t0, t1, t2]),
    });

    assert.deepEqual(res, {});
  });

  test("arrow movement can update focus without press when id is not pressable", () => {
    const res = routeTabsKey(keyDown(23), {
      focusedId: t0,
      activeZoneId: barId,
      zones: new Map([[barId, zone(barId, [t0, t1], true)]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
      ]),
      pressableIds: new Set([t0]),
    });

    assert.deepEqual(res, {
      nextFocusedId: t1,
      nextZoneId: barId,
    });
  });

  test("escape from content returns focus to last-focused tab", () => {
    const res = routeTabsKey(keyDown(1), {
      focusedId: "content-btn",
      activeZoneId: contentId,
      zones: new Map([
        [barId, zone(barId, [t0, t1, t2], true)],
        [contentId, zone(contentId, ["content-btn"], false)],
      ]),
      lastFocusedByZone: new Map([[barId, t2]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
        ["content-btn", true],
      ]),
      pressableIds: new Set([t0, t1, t2, "content-btn"]),
    });

    assert.deepEqual(res, {
      nextFocusedId: t2,
      nextZoneId: barId,
    });
  });

  test("escape from content falls back to first tab when last focus unknown", () => {
    const res = routeTabsKey(keyDown(1), {
      focusedId: "content-btn",
      activeZoneId: contentId,
      zones: new Map([
        [barId, zone(barId, [t0, t1, t2], true)],
        [contentId, zone(contentId, ["content-btn"], false)],
      ]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
        ["content-btn", true],
      ]),
      pressableIds: new Set([t0, t1, t2, "content-btn"]),
    });

    assert.deepEqual(res, {
      nextFocusedId: t0,
      nextZoneId: barId,
    });
  });

  test("escape outside tabs content returns null", () => {
    const res = routeTabsKey(keyDown(1), {
      focusedId: t1,
      activeZoneId: barId,
      zones: new Map([[barId, zone(barId, [t0, t1, t2], true)]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
      ]),
      pressableIds: new Set([t0, t1, t2]),
    });

    assert.equal(res, null);
  });

  test("escape from nested zone inside tab content returns focus to tab bar", () => {
    const nestedId = "nested-zone";
    const res = routeTabsKey(keyDown(1), {
      focusedId: "nested-btn",
      activeZoneId: nestedId,
      zones: new Map([
        [barId, zone(barId, [t0, t1, t2], true)],
        [contentId, zone(contentId, ["content-btn"], false)],
        [nestedId, zone(nestedId, ["nested-btn"], false, contentId)],
      ]),
      lastFocusedByZone: new Map([[barId, t1]]),
      enabledById: new Map([
        [t0, true],
        [t1, true],
        [t2, true],
        ["content-btn", true],
        ["nested-btn", true],
      ]),
      pressableIds: new Set([t0, t1, t2, "content-btn", "nested-btn"]),
    });

    assert.deepEqual(res, {
      nextFocusedId: t1,
      nextZoneId: barId,
    });
  });
});

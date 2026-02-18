import { assert, describe, test } from "@rezi-ui/testkit";
import {
  DEFAULT_BREADCRUMB_SEPARATOR,
  buildBreadcrumbChildren,
  createBreadcrumbVNode,
  getBreadcrumbItemId,
  getBreadcrumbZoneId,
  parseBreadcrumbItemId,
  resolveBreadcrumbClickableIndices,
  resolveBreadcrumbSeparator,
} from "../breadcrumb.js";
import { ui } from "../ui.js";

const props = {
  id: "crumbs-main",
  items: [
    { label: "Home", onPress: () => undefined },
    { label: "Docs", onPress: () => undefined },
    { label: "API" },
  ],
} as const;

describe("breadcrumb helpers", () => {
  test("resolveBreadcrumbSeparator defaults to required value", () => {
    assert.equal(resolveBreadcrumbSeparator(undefined), DEFAULT_BREADCRUMB_SEPARATOR);
  });

  test("resolveBreadcrumbSeparator keeps explicit separator", () => {
    assert.equal(resolveBreadcrumbSeparator(" / "), " / ");
  });

  test("getBreadcrumbZoneId encodes ids deterministically", () => {
    assert.equal(getBreadcrumbZoneId("a/b"), "__rezi_breadcrumb_zone__:a%2Fb");
  });

  test("item id round-trips with parser", () => {
    const id = getBreadcrumbItemId("a/b", 3);
    assert.deepEqual(parseBreadcrumbItemId(id), { breadcrumbId: "a/b", index: 3 });
  });

  test("parseBreadcrumbItemId rejects malformed ids", () => {
    assert.equal(parseBreadcrumbItemId("bad"), null);
    assert.equal(parseBreadcrumbItemId("__rezi_breadcrumb_item__:x"), null);
    assert.equal(parseBreadcrumbItemId("__rezi_breadcrumb_item__:%:1"), null);
  });

  test("resolveBreadcrumbClickableIndices excludes final item", () => {
    const clickable = resolveBreadcrumbClickableIndices(props.items);
    assert.deepEqual(clickable, [0, 1]);
  });

  test("resolveBreadcrumbClickableIndices requires onPress", () => {
    const clickable = resolveBreadcrumbClickableIndices([
      { label: "One" },
      { label: "Two", onPress: () => undefined },
      { label: "Three", onPress: () => undefined },
    ]);
    assert.deepEqual(clickable, [1]);
  });
});

describe("breadcrumb vnode construction", () => {
  test("buildBreadcrumbChildren builds focus-zone wrapped row", () => {
    const children = buildBreadcrumbChildren(props);
    assert.equal(children.length, 1);
    assert.equal(children[0]?.kind, "focusZone");
    if (children[0]?.kind !== "focusZone") return;
    assert.equal(children[0].children.length, 1);
    assert.equal(children[0].children[0]?.kind, "row");
  });

  test("last breadcrumb item is rendered as non-clickable text", () => {
    const children = buildBreadcrumbChildren(props);
    const zone = children[0];
    assert.equal(zone?.kind, "focusZone");
    if (zone?.kind !== "focusZone") return;
    const row = zone.children[0];
    assert.equal(row?.kind, "row");
    if (row?.kind !== "row") return;
    const last = row.children[row.children.length - 1];
    assert.equal(last?.kind, "text");
    if (last?.kind === "text") {
      assert.equal(last.text, "API");
    }
  });

  test("createBreadcrumbVNode emits breadcrumb kind", () => {
    const vnode = createBreadcrumbVNode(props);
    assert.equal(vnode.kind, "breadcrumb");
    assert.equal(vnode.children.length, 1);
  });

  test("createBreadcrumbVNode applies custom separator", () => {
    const vnode = createBreadcrumbVNode({ ...props, separator: " / " });
    assert.equal(vnode.kind, "breadcrumb");
    if (vnode.kind !== "breadcrumb") return;
    const zone = vnode.children[0];
    if (zone?.kind !== "focusZone") return;
    const row = zone.children[0];
    if (row?.kind !== "row") return;
    const sep = row.children[1];
    assert.equal(sep?.kind, "text");
    if (sep?.kind === "text") {
      assert.equal(sep.text, " / ");
    }
  });

  test("ui.breadcrumb returns a composite wrapper vnode", () => {
    const vnode = ui.breadcrumb({ items: props.items });
    assert.equal(vnode.kind, "column");
  });
});

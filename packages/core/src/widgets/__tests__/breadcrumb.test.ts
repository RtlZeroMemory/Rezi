import { assert, describe, test } from "@rezi-ui/testkit";
import {
  DEFAULT_BREADCRUMB_SEPARATOR,
  buildBreadcrumbChildren,
  getBreadcrumbItemId,
  getBreadcrumbZoneId,
  parseBreadcrumbItemId,
  resolveBreadcrumbClickableIndices,
  resolveBreadcrumbSeparator,
} from "../breadcrumb.js";

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
  test("buildBreadcrumbChildren includes clickable breadcrumb buttons before the current item", () => {
    const children = buildBreadcrumbChildren(props);
    assert.equal(children.length, 1);
    const row = children[0];
    assert.equal(row?.kind, "row");
    if (row?.kind !== "row") return;
    const first = row.children[0];
    const second = row.children[2];
    assert.equal(first?.kind, "button");
    assert.equal(second?.kind, "button");
    if (first?.kind === "button") {
      assert.equal(first.props.id, getBreadcrumbItemId(props.id, 0));
      assert.equal(first.props.label, "Home");
    }
    if (second?.kind === "button") {
      assert.equal(second.props.id, getBreadcrumbItemId(props.id, 1));
      assert.equal(second.props.label, "Docs");
    }
  });

  test("last breadcrumb item is rendered as non-clickable text", () => {
    const children = buildBreadcrumbChildren(props);
    const row = children[0];
    assert.equal(row?.kind, "row");
    if (row?.kind !== "row") return;
    const last = row.children[row.children.length - 1];
    assert.equal(last?.kind, "text");
    if (last?.kind === "text") {
      assert.equal(last.text, "API");
    }
  });

  test("createBreadcrumbVNode applies custom separator", () => {
    const children = buildBreadcrumbChildren({ ...props, separator: " / " });
    const row = children[0];
    if (row?.kind !== "row") return;
    const sep = row.children[1];
    assert.equal(sep?.kind, "text");
    if (sep?.kind === "text") {
      assert.equal(sep.text, " / ");
    }
  });
});

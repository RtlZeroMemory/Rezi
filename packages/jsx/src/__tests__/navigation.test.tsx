/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Accordion, Breadcrumb, Pagination, Tabs } from "../index.js";

function compositeProps(vnode: unknown): unknown {
  if (typeof vnode !== "object" || vnode === null) return undefined;
  return (vnode as { __composite?: { props?: unknown } }).__composite?.props;
}

describe("navigation widgets", () => {
  test("Tabs maps to matching VNodes", () => {
    const onChange = () => {};
    const tabs = [
      { key: "home", label: "Home", content: ui.text("home") },
      { key: "settings", label: "Settings", content: ui.text("settings") },
    ] as const;

    const vnode = (
      <Tabs
        id="tabs"
        key="tabs-key"
        tabs={tabs}
        activeTab="home"
        onChange={onChange}
        variant="line"
        position="top"
      />
    );
    const expected = ui.tabs({
      id: "tabs",
      key: "tabs-key",
      tabs,
      activeTab: "home",
      onChange,
      variant: "line",
      position: "top",
    });
    assert.equal(vnode.kind, "column");
    assert.equal(expected.kind, "column");
    assert.deepEqual(compositeProps(vnode), compositeProps(expected));
  });

  test("Accordion maps to matching VNodes", () => {
    const onChange = () => {};
    const items = [
      { key: "a", title: "First", content: ui.text("a") },
      { key: "b", title: "Second", content: ui.text("b") },
    ] as const;

    const vnode = (
      <Accordion
        id="acc"
        key="acc-key"
        items={items}
        expanded={["a"]}
        onChange={onChange}
        allowMultiple
      />
    );
    const expected = ui.accordion({
      id: "acc",
      key: "acc-key",
      items,
      expanded: ["a"],
      onChange,
      allowMultiple: true,
    });
    assert.equal(vnode.kind, "column");
    assert.equal(expected.kind, "column");
    assert.deepEqual(compositeProps(vnode), compositeProps(expected));
  });

  test("Breadcrumb and Pagination map to matching VNodes", () => {
    const onPress = () => {};
    const onPageChange = () => {};
    const items = [{ label: "Root", onPress }, { label: "Current" }] as const;

    const breadcrumb = <Breadcrumb id="crumbs" key="crumb-key" items={items} separator="/" />;
    const expectedBreadcrumb = ui.breadcrumb({
      id: "crumbs",
      key: "crumb-key",
      items,
      separator: "/",
    });
    assert.equal(breadcrumb.kind, "column");
    assert.equal(expectedBreadcrumb.kind, "column");
    assert.deepEqual(compositeProps(breadcrumb), compositeProps(expectedBreadcrumb));

    const pagination = (
      <Pagination
        id="pager"
        key="pager-key"
        page={2}
        totalPages={5}
        onChange={onPageChange}
        showFirstLast
      />
    );
    const expectedPagination = ui.pagination({
      id: "pager",
      key: "pager-key",
      page: 2,
      totalPages: 5,
      onChange: onPageChange,
      showFirstLast: true,
    });
    assert.equal(pagination.kind, "column");
    assert.equal(expectedPagination.kind, "column");
    assert.deepEqual(compositeProps(pagination), compositeProps(expectedPagination));
  });
});

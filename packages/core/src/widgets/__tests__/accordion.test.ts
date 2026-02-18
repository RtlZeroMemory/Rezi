import { assert, describe, test } from "@rezi-ui/testkit";
import {
  buildAccordionChildren,
  createAccordionVNode,
  getAccordionHeadersZoneId,
  getAccordionTriggerId,
  parseAccordionTriggerId,
  resolveAccordionExpanded,
  toggleAccordionExpanded,
} from "../accordion.js";
import { ui } from "../ui.js";

const baseProps = {
  id: "acc-main",
  items: [
    { key: "intro", title: "Intro", content: ui.text("intro-content") },
    { key: "api", title: "API", content: ui.text("api-content") },
    { key: "faq", title: "FAQ", content: ui.text("faq-content") },
  ],
  expanded: ["api"],
  onChange: () => undefined,
} as const;

describe("accordion id helpers", () => {
  test("headers zone id is deterministic", () => {
    assert.equal(getAccordionHeadersZoneId("a/b"), "__rezi_accordion_headers__:a%2Fb");
  });

  test("trigger id round-trips", () => {
    const id = getAccordionTriggerId("a/b", 2, "faq/advanced");
    assert.deepEqual(parseAccordionTriggerId(id), {
      accordionId: "a/b",
      index: 2,
      itemKey: "faq/advanced",
    });
  });

  test("parseAccordionTriggerId rejects malformed ids", () => {
    assert.equal(parseAccordionTriggerId("bad"), null);
    assert.equal(parseAccordionTriggerId("__rezi_accordion_trigger__:x"), null);
    assert.equal(parseAccordionTriggerId("__rezi_accordion_trigger__:x:y"), null);
    assert.equal(parseAccordionTriggerId("__rezi_accordion_trigger__:%:1:key"), null);
  });
});

describe("accordion expanded state", () => {
  test("resolveAccordionExpanded filters unknown keys", () => {
    assert.deepEqual(resolveAccordionExpanded(["x", "api"], ["intro", "api"], true), ["api"]);
  });

  test("resolveAccordionExpanded removes duplicates", () => {
    assert.deepEqual(resolveAccordionExpanded(["api", "api", "intro"], ["intro", "api"], true), [
      "api",
      "intro",
    ]);
  });

  test("resolveAccordionExpanded keeps first item in single mode", () => {
    assert.deepEqual(resolveAccordionExpanded(["faq", "api"], ["intro", "api", "faq"], false), [
      "faq",
    ]);
  });

  test("resolveAccordionExpanded empty when no valid keys", () => {
    assert.deepEqual(resolveAccordionExpanded(["x"], ["intro"], false), []);
  });

  test("toggleAccordionExpanded expands target in single mode", () => {
    assert.deepEqual(toggleAccordionExpanded([], "api", ["intro", "api", "faq"], false), ["api"]);
  });

  test("toggleAccordionExpanded collapses active key in single mode", () => {
    assert.deepEqual(toggleAccordionExpanded(["api"], "api", ["intro", "api", "faq"], false), []);
  });

  test("toggleAccordionExpanded in single mode replaces current key", () => {
    assert.deepEqual(toggleAccordionExpanded(["intro"], "faq", ["intro", "api", "faq"], false), [
      "faq",
    ]);
  });

  test("toggleAccordionExpanded adds key in multi mode using item order", () => {
    assert.deepEqual(toggleAccordionExpanded(["faq"], "intro", ["intro", "api", "faq"], true), [
      "intro",
      "faq",
    ]);
  });

  test("toggleAccordionExpanded removes key in multi mode", () => {
    assert.deepEqual(
      toggleAccordionExpanded(["intro", "api", "faq"], "api", ["intro", "api", "faq"], true),
      ["intro", "faq"],
    );
  });

  test("toggleAccordionExpanded ignores unknown keys", () => {
    assert.deepEqual(toggleAccordionExpanded(["intro"], "unknown", ["intro", "api", "faq"], true), [
      "intro",
    ]);
  });
});

describe("accordion vnode construction", () => {
  test("buildAccordionChildren creates headers zone as first child", () => {
    const children = buildAccordionChildren(baseProps);
    assert.equal(children[0]?.kind, "focusZone");
    if (children[0]?.kind !== "focusZone") return;
    assert.equal(children[0].props.id, getAccordionHeadersZoneId(baseProps.id));
    assert.equal(children[0].children.length, 3);
  });

  test("buildAccordionChildren appends expanded panel content", () => {
    const children = buildAccordionChildren({ ...baseProps, expanded: ["faq"] });
    assert.equal(children.length, 2);
    const content = children[1];
    assert.equal(content?.kind, "text");
    if (content?.kind === "text") {
      assert.equal(content.text, "faq-content");
    }
  });

  test("buildAccordionChildren in single mode keeps first expanded panel", () => {
    const children = buildAccordionChildren({
      ...baseProps,
      expanded: ["faq", "intro"],
      allowMultiple: false,
    });
    assert.equal(children.length, 2);
    const content = children[1];
    assert.equal(content?.kind, "text");
    if (content?.kind === "text") {
      assert.equal(content.text, "faq-content");
    }
  });

  test("createAccordionVNode emits accordion kind", () => {
    const vnode = createAccordionVNode(baseProps);
    assert.equal(vnode.kind, "accordion");
    assert.equal(vnode.children.length, 2);
  });

  test("ui.accordion returns a composite wrapper vnode", () => {
    const vnode = ui.accordion(baseProps);
    assert.equal(vnode.kind, "column");
  });
});

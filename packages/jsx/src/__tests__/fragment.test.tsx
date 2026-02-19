/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Fragment, Text } from "../index.js";

describe("Fragment", () => {
  test("Fragment wraps children in a column vnode", () => {
    const vnode = (
      <Fragment>
        <Text>A</Text>
        <Text>B</Text>
      </Fragment>
    );

    assert.deepEqual(vnode, ui.column({}, [ui.text("A"), ui.text("B")]));
  });

  test("Fragment shorthand works", () => {
    const vnode = (
      <>
        <Text>one</Text>
        <Text>two</Text>
      </>
    );

    assert.deepEqual(vnode, ui.column({}, [ui.text("one"), ui.text("two")]));
  });

  test("Fragment preserves key", () => {
    const vnode = (
      <Fragment key="frag-key">
        <Text>keyed</Text>
      </Fragment>
    );

    assert.deepEqual(vnode, ui.column({ key: "frag-key" }, [ui.text("keyed")]));
  });

  test("Fragment handles single/no/nested children", () => {
    assert.deepEqual(
      <Fragment>
        <Text>single</Text>
      </Fragment>,
      ui.column({}, [ui.text("single")]),
    );

    assert.deepEqual(<Fragment />, ui.column({}, []));

    assert.deepEqual(
      <Fragment>
        <Fragment>
          <Text>nested</Text>
        </Fragment>
      </Fragment>,
      ui.column({}, [ui.column({}, [ui.text("nested")])]),
    );
  });
});

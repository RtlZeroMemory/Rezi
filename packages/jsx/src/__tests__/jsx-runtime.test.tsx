/** @jsxImportSource @rezi-ui/jsx */

import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Button, Column, Text } from "../index.js";
import { jsxDEV } from "../jsx-dev-runtime.js";
import { jsx, jsxs } from "../jsx-runtime.js";

describe("jsx runtime", () => {
  test("jsx() supports function components", () => {
    function Greeting(props: { name: string }): VNode {
      return <Text>Hello {props.name}</Text>;
    }

    const vnode = jsx(Greeting, { name: "Rezi" });
    assert.deepEqual(vnode, ui.text("Hello Rezi"));
  });

  test("jsx() supports intrinsic string elements", () => {
    const vnode = jsx("button", { id: "ok", label: "OK" });
    assert.deepEqual(vnode, ui.button("ok", "OK"));
  });

  test("jsxs() handles multiple children", () => {
    const vnode = jsxs(Column, {
      gap: 1,
      children: [jsx(Text, { children: "A" }), jsx(Button, { id: "x", label: "X" })],
    });

    assert.deepEqual(vnode, ui.column({ gap: 1 }, [ui.text("A"), ui.button("x", "X")]));
  });

  test("key argument is injected into component props", () => {
    const vnode = jsx(Button, { id: "ok", label: "OK" }, "btn-key");
    assert.deepEqual(vnode, { kind: "button", props: { id: "ok", label: "OK", key: "btn-key" } });

    const keyedFn = jsx((props: { key?: string }) => ui.text(props.key ?? ""), {}, "fn-key");
    assert.deepEqual(keyedFn, ui.text("fn-key"));
  });

  test("key argument is preserved when intrinsic props are null", () => {
    const vnode = jsx("box", null, "box-key");
    assert.deepEqual(vnode, ui.box({ key: "box-key" }, []));
  });

  test("key argument takes precedence over props.key", () => {
    const intrinsicFromProps = jsx("button", { id: "ok", label: "OK", key: "props-key" });
    assert.deepEqual(intrinsicFromProps, ui.button("ok", "OK", { key: "props-key" }));

    const intrinsicFromArg = jsx("button", { id: "ok", label: "OK", key: "props-key" }, "arg-key");
    assert.deepEqual(intrinsicFromArg, ui.button("ok", "OK", { key: "arg-key" }));

    const functionFromArg = jsx(
      (props: { key?: string }) => ui.text(props.key ?? ""),
      { key: "props-key" },
      "arg-key",
    );
    assert.deepEqual(functionFromArg, ui.text("arg-key"));
  });

  test("unknown intrinsic element type throws", () => {
    assert.throws(() => jsx("does-not-exist", {}));
  });

  test("new intrinsic names route through the JSX runtime", () => {
    const onChange = () => {};
    const draw = () => undefined;
    const src = new Uint8Array([0, 0, 0, 0]);
    const series = [{ data: [1, 2, 3], color: "#4ecdc4" }] as const;
    const vnode = jsx("slider", { id: "volume", value: 15, onChange });
    assert.deepEqual(vnode, ui.slider({ id: "volume", value: 15, onChange }));
    assert.deepEqual(
      jsx("link", { url: "https://example.com", label: "Docs" }),
      ui.link("https://example.com", "Docs"),
    );
    assert.deepEqual(
      jsx("canvas", { width: 10, height: 4, draw }),
      ui.canvas({ width: 10, height: 4, draw }),
    );
    assert.deepEqual(
      jsx("image", { src, width: 6, height: 3 }),
      ui.image({ src, width: 6, height: 3 }),
    );
    assert.deepEqual(
      jsx("lineChart", { width: 18, height: 6, series }),
      ui.lineChart({ width: 18, height: 6, series }),
    );
  });

  test("jsxDEV() matches jsx() behavior", () => {
    const fromJsx = jsx(Text, { children: "dev" }, "k1");
    const fromDev = jsxDEV(Text, { children: "dev" }, "k1", false, undefined, undefined);
    assert.deepEqual(fromDev, fromJsx);
  });
});

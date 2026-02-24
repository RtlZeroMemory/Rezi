import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { layout, measure } from "../../layout/layout.js";
import {
  validateButtonProps,
  validateCheckboxProps,
  validateInputProps,
  validateRadioGroupProps,
  validateSelectProps,
  validateSliderProps,
} from "../../layout/validateProps.js";
import { ui } from "../ui.js";

function expectMeasureFatal(vnode: VNode, detail: string): void {
  const res = measure(vnode, 80, 24, "column");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
  assert.equal(res.fatal.detail, detail);
}

function expectLayoutFatal(vnode: VNode, detail: string): void {
  const res = layout(vnode, 0, 0, 80, 24, "column");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
  assert.equal(res.fatal.detail, detail);
}

describe("vnode interactive prop validation - button/input", () => {
  test("validateButtonProps accepts valid props", () => {
    const res = validateButtonProps({ id: "save", label: "Save" });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.value, { id: "save", label: "Save", disabled: false });
  });

  test("button id cannot be empty", () => {
    const res = validateButtonProps({ id: "", label: "Save" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.fatal.detail, "button.id must be a non-empty string");
  });

  test("button missing id fails in measure path", () => {
    expectMeasureFatal(
      { kind: "button", props: { label: "Save" } } as unknown as VNode,
      "button.id must be a string",
    );
  });

  test("button missing label fails in layout path", () => {
    expectLayoutFatal(
      { kind: "button", props: { id: "save" } } as unknown as VNode,
      "button.label must be a string",
    );
  });

  test("button disabled must be boolean", () => {
    expectMeasureFatal(
      { kind: "button", props: { id: "save", label: "Save", disabled: "yes" } } as unknown as VNode,
      "button.disabled must be a boolean",
    );
  });

  test("validateInputProps accepts valid props", () => {
    const res = validateInputProps({ id: "query", value: "" });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.value, {
      id: "query",
      value: "",
      disabled: false,
      multiline: false,
      rows: 1,
      wordWrap: false,
    });
  });

  test("input id cannot be empty", () => {
    expectMeasureFatal(
      { kind: "input", props: { id: "", value: "x" } } as unknown as VNode,
      "input.id must be a non-empty string",
    );
  });

  test("input missing value fails", () => {
    expectMeasureFatal(
      { kind: "input", props: { id: "query" } } as unknown as VNode,
      "input.value must be a string",
    );
  });

  test("input disabled must be boolean", () => {
    expectLayoutFatal(
      { kind: "input", props: { id: "query", value: "x", disabled: 1 } } as unknown as VNode,
      "input.disabled must be a boolean",
    );
  });
});

describe("vnode interactive prop validation - select", () => {
  test("validateSelectProps accepts valid props", () => {
    const res = validateSelectProps({
      id: "country",
      value: "us",
      options: [{ value: "us", label: "United States" }],
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.disabled, false);
    assert.equal(res.value.options.length, 1);
    assert.equal(res.value.options[0]?.disabled, false);
  });

  test("select id cannot be empty", () => {
    expectMeasureFatal(
      {
        kind: "select",
        props: { id: "", value: "us", options: [{ value: "us", label: "US" }] },
      } as unknown as VNode,
      "select.id must be a non-empty string",
    );
  });

  test("select missing id fails", () => {
    expectMeasureFatal(
      {
        kind: "select",
        props: { value: "us", options: [{ value: "us", label: "US" }] },
      } as unknown as VNode,
      "select.id must be a string",
    );
  });

  test("select allows empty options array and still measures deterministically", () => {
    const res = measure(ui.select({ id: "s", value: "", options: [] }), 80, 24, "column");
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.h, 1);
    assert.equal(res.value.w > 0, true);
  });

  test("select warns when an option uses empty-string value", () => {
    const res = validateSelectProps({
      id: "country",
      value: "",
      options: [{ value: "", label: "None" }],
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.warnings?.length, 1);
    assert.equal(res.warnings?.[0]?.includes('value ""'), true);
  });

  test("select missing options fails", () => {
    expectMeasureFatal(
      { kind: "select", props: { id: "s", value: "" } } as unknown as VNode,
      "select.options must be an array",
    );
  });

  test("select measurement uses placeholder width when value is stale", () => {
    const stale = measure(
      ui.select({
        id: "s",
        value: "stale-value",
        options: [{ value: "active", label: "Active" }],
        placeholder: "Pick one",
      }),
      80,
      24,
      "column",
    );
    const placeholder = measure(
      ui.select({
        id: "s",
        value: "",
        options: [{ value: "active", label: "Active" }],
        placeholder: "Pick one",
      }),
      80,
      24,
      "column",
    );
    assert.equal(stale.ok, true);
    assert.equal(placeholder.ok, true);
    if (!stale.ok || !placeholder.ok) return;
    assert.deepEqual(stale.value, placeholder.value);
  });

  test("select options must be array", () => {
    expectLayoutFatal(
      { kind: "select", props: { id: "s", value: "", options: "bad" } } as unknown as VNode,
      "select.options must be an array",
    );
  });

  test("select option value must be string", () => {
    expectMeasureFatal(
      {
        kind: "select",
        props: { id: "s", value: "", options: [{ label: "US" }] },
      } as unknown as VNode,
      "select.options[0].value must be a string",
    );
  });

  test("select placeholder must be string when provided", () => {
    expectMeasureFatal(
      {
        kind: "select",
        props: {
          id: "s",
          value: "",
          options: [{ value: "us", label: "US" }],
          placeholder: 123,
        },
      } as unknown as VNode,
      "select.placeholder must be a string",
    );
  });

  test("select disabled must be boolean", () => {
    expectLayoutFatal(
      {
        kind: "select",
        props: { id: "s", value: "", options: [{ value: "us", label: "US" }], disabled: "yes" },
      } as unknown as VNode,
      "select.disabled must be a boolean",
    );
  });
});

describe("vnode interactive prop validation - slider", () => {
  test("validateSliderProps accepts valid props and defaults", () => {
    const res = validateSliderProps({ id: "volume", value: 10 });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.min, 0);
    assert.equal(res.value.max, 100);
    assert.equal(res.value.step, 1);
    assert.equal(res.value.showValue, true);
    assert.equal(res.value.disabled, false);
    assert.equal(res.value.readOnly, false);
  });

  test("slider missing id fails", () => {
    expectMeasureFatal(
      { kind: "slider", props: { value: 1 } } as unknown as VNode,
      "slider.id must be a string",
    );
  });

  test("slider empty id fails", () => {
    expectLayoutFatal(
      { kind: "slider", props: { id: "", value: 1 } } as unknown as VNode,
      "slider.id must be a non-empty string",
    );
  });

  test("slider value must be finite", () => {
    expectMeasureFatal(
      { kind: "slider", props: { id: "s", value: Number.NaN } } as unknown as VNode,
      "slider.value must be a finite number",
    );
  });

  test("slider min cannot exceed max", () => {
    expectMeasureFatal(
      { kind: "slider", props: { id: "s", value: 1, min: 10, max: 0 } } as unknown as VNode,
      "slider.min must be <= slider.max",
    );
  });

  test("slider step must be > 0", () => {
    expectMeasureFatal(
      { kind: "slider", props: { id: "s", value: 1, step: 0 } } as unknown as VNode,
      "slider.step must be a finite number > 0",
    );
  });

  test("slider width must be non-negative int", () => {
    expectLayoutFatal(
      { kind: "slider", props: { id: "s", value: 1, width: -1 } } as unknown as VNode,
      "slider.width must be an int32 >= 0",
    );
  });

  test("slider finite numeric strings are accepted and normalized", () => {
    const res = validateSliderProps({
      id: "volume",
      value: "10.9" as unknown as number,
      min: "0" as unknown as number,
      max: "20.4" as unknown as number,
      step: "0.5" as unknown as number,
      width: "15.8" as unknown as number,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.value, 10.9);
    assert.equal(res.value.max, 20.4);
    assert.equal(res.value.step, 0.5);
    assert.equal(res.value.width, 15);
  });

  test("slider showValue must be boolean", () => {
    expectMeasureFatal(
      { kind: "slider", props: { id: "s", value: 1, showValue: "yes" } } as unknown as VNode,
      "slider.showValue must be a boolean",
    );
  });

  test("slider readOnly must be boolean", () => {
    expectLayoutFatal(
      { kind: "slider", props: { id: "s", value: 1, readOnly: "yes" } } as unknown as VNode,
      "slider.readOnly must be a boolean",
    );
  });

  test("slider values outside range are clamped during measurement behavior", () => {
    const outOfRange = measure(
      ui.slider({ id: "s1", value: 999, min: 0, max: 10, step: 1 }),
      80,
      24,
      "column",
    );
    const inRange = measure(
      ui.slider({ id: "s2", value: 10, min: 0, max: 10, step: 1 }),
      80,
      24,
      "column",
    );
    assert.equal(outOfRange.ok, true);
    assert.equal(inRange.ok, true);
    if (!outOfRange.ok || !inRange.ok) return;
    assert.deepEqual(outOfRange.value, inRange.value);
  });
});

describe("vnode interactive prop validation - checkbox/radioGroup", () => {
  test("validateCheckboxProps accepts valid props", () => {
    const res = validateCheckboxProps({ id: "remember", checked: true });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.disabled, false);
  });

  test("checkbox missing id fails", () => {
    expectMeasureFatal(
      { kind: "checkbox", props: { checked: true } } as unknown as VNode,
      "checkbox.id must be a string",
    );
  });

  test("checkbox checked must be boolean", () => {
    expectMeasureFatal(
      { kind: "checkbox", props: { id: "remember", checked: "true" } } as unknown as VNode,
      "checkbox.checked must be a boolean",
    );
  });

  test("checkbox disabled must be boolean", () => {
    expectLayoutFatal(
      {
        kind: "checkbox",
        props: { id: "remember", checked: true, disabled: "no" },
      } as unknown as VNode,
      "checkbox.disabled must be a boolean",
    );
  });

  test("validateRadioGroupProps accepts valid props", () => {
    const res = validateRadioGroupProps({
      id: "plan",
      value: "free",
      options: [{ value: "free", label: "Free" }],
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.direction, "vertical");
    assert.equal(res.value.disabled, false);
  });

  test("radioGroup missing id fails", () => {
    expectMeasureFatal(
      {
        kind: "radioGroup",
        props: { value: "free", options: [{ value: "free", label: "Free" }] },
      } as unknown as VNode,
      "radioGroup.id must be a string",
    );
  });

  test("radioGroup options must be non-empty", () => {
    expectMeasureFatal(
      { kind: "radioGroup", props: { id: "plan", value: "", options: [] } } as unknown as VNode,
      "radioGroup.options must be a non-empty array",
    );
  });

  test("radioGroup direction must be horizontal or vertical", () => {
    expectLayoutFatal(
      {
        kind: "radioGroup",
        props: {
          id: "plan",
          value: "",
          options: [{ value: "free", label: "Free" }],
          direction: "diag",
        },
      } as unknown as VNode,
      'radioGroup.direction must be one of "horizontal" | "vertical"',
    );
  });

  test("radioGroup direction accepts casing and whitespace variants", () => {
    const res = validateRadioGroupProps({
      id: "plan",
      value: "free",
      options: [{ value: "free", label: "Free" }],
      direction: " Horizontal ",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.value.direction, "horizontal");
  });

  test("radioGroup option label must be string", () => {
    expectMeasureFatal(
      {
        kind: "radioGroup",
        props: { id: "plan", value: "", options: [{ value: "free" }] },
      } as unknown as VNode,
      "radioGroup.options[0].label must be a string",
    );
  });

  test("radioGroup disabled must be boolean", () => {
    expectLayoutFatal(
      {
        kind: "radioGroup",
        props: { id: "plan", value: "", options: [{ value: "free", label: "Free" }], disabled: 1 },
      } as unknown as VNode,
      "radioGroup.disabled must be a boolean",
    );
  });
});

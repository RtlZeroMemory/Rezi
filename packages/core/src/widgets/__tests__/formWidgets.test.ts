/**
 * packages/core/src/widgets/__tests__/formWidgets.test.ts — Tests for form widgets.
 *
 * @see docs/recipes/form-validation.md (GitHub issue #119)
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import {
  CHECKBOX_CHECKED,
  CHECKBOX_DISABLED_CHECKED,
  CHECKBOX_DISABLED_UNCHECKED,
  CHECKBOX_UNCHECKED,
  buildCheckboxText,
  getCheckboxIndicator,
  toggleCheckbox,
} from "../checkbox.js";
import { REQUIRED_INDICATOR, buildFieldLabel, shouldShowError } from "../field.js";
import {
  RADIO_SELECTED,
  RADIO_UNSELECTED,
  buildRadioOptionText,
  findSelectedIndex,
  getNextRadioIndex,
  getPrevRadioIndex,
  getRadioIndicator,
  selectRadioAtIndex,
} from "../radioGroup.js";
import {
  DEFAULT_PLACEHOLDER,
  findOptionIndex,
  getNextOptionIndex,
  getPrevOptionIndex,
  getSelectDisplayText,
} from "../select.js";
import type { SelectOption } from "../types.js";
import { ui } from "../ui.js";

describe("field widget utilities", () => {
  test("buildFieldLabel without required", () => {
    const label = buildFieldLabel("Username");
    assert.equal(label, "Username");
  });

  test("buildFieldLabel with required", () => {
    const label = buildFieldLabel("Username", true);
    assert.equal(label, `Username ${REQUIRED_INDICATOR}`);
  });

  test("shouldShowError returns false for undefined", () => {
    assert.equal(shouldShowError(undefined), false);
  });

  test("shouldShowError returns false for empty string", () => {
    assert.equal(shouldShowError(""), false);
  });

  test("shouldShowError returns true for non-empty string", () => {
    assert.equal(shouldShowError("Required"), true);
  });
});

describe("select widget utilities", () => {
  const options: readonly SelectOption[] = [
    { value: "us", label: "United States" },
    { value: "uk", label: "United Kingdom" },
    { value: "ca", label: "Canada", disabled: true },
    { value: "au", label: "Australia" },
  ];

  test("getSelectDisplayText returns placeholder when no value", () => {
    const text = getSelectDisplayText("", options);
    assert.equal(text, DEFAULT_PLACEHOLDER);
  });

  test("getSelectDisplayText returns custom placeholder", () => {
    const text = getSelectDisplayText("", options, "Choose...");
    assert.equal(text, "Choose...");
  });

  test("getSelectDisplayText returns empty-option label when value is empty string", () => {
    const text = getSelectDisplayText(
      "",
      [
        { value: "", label: "None" },
        { value: "us", label: "United States" },
      ],
      "Choose...",
    );
    assert.equal(text, "None");
  });

  test("getSelectDisplayText returns label for valid value", () => {
    const text = getSelectDisplayText("uk", options);
    assert.equal(text, "United Kingdom");
  });

  test("getSelectDisplayText returns value for unknown value", () => {
    const text = getSelectDisplayText("unknown", options);
    assert.equal(text, "unknown");
  });

  test("findOptionIndex finds correct index", () => {
    assert.equal(findOptionIndex("us", options), 0);
    assert.equal(findOptionIndex("uk", options), 1);
    assert.equal(findOptionIndex("au", options), 3);
  });

  test("findOptionIndex returns -1 for not found", () => {
    assert.equal(findOptionIndex("unknown", options), -1);
  });

  test("getNextOptionIndex skips disabled options", () => {
    // From uk (index 1), next should be au (index 3), skipping disabled ca (index 2)
    assert.equal(getNextOptionIndex(1, options), 3);
  });

  test("getNextOptionIndex wraps around", () => {
    // From au (index 3), next should wrap to us (index 0)
    assert.equal(getNextOptionIndex(3, options), 0);
  });

  test("getNextOptionIndex does not wrap when wrapAround is false", () => {
    // From au (index 3), stay at 3 when not wrapping
    assert.equal(getNextOptionIndex(3, options, false), 3);
  });

  test("getPrevOptionIndex skips disabled options", () => {
    // From au (index 3), prev should be uk (index 1), skipping disabled ca (index 2)
    assert.equal(getPrevOptionIndex(3, options), 1);
  });

  test("getPrevOptionIndex wraps around", () => {
    // From us (index 0), prev should wrap to au (index 3)
    assert.equal(getPrevOptionIndex(0, options), 3);
  });

  test("getPrevOptionIndex does not wrap when wrapAround is false", () => {
    // From us (index 0), stay at 0 when not wrapping
    assert.equal(getPrevOptionIndex(0, options, false), 0);
  });
});

describe("checkbox widget utilities", () => {
  test("getCheckboxIndicator unchecked", () => {
    assert.equal(getCheckboxIndicator(false), CHECKBOX_UNCHECKED);
  });

  test("getCheckboxIndicator checked", () => {
    assert.equal(getCheckboxIndicator(true), CHECKBOX_CHECKED);
  });

  test("getCheckboxIndicator disabled unchecked", () => {
    assert.equal(getCheckboxIndicator(false, true), CHECKBOX_DISABLED_UNCHECKED);
  });

  test("getCheckboxIndicator disabled checked", () => {
    assert.equal(getCheckboxIndicator(true, true), CHECKBOX_DISABLED_CHECKED);
  });

  test("buildCheckboxText without label", () => {
    assert.equal(buildCheckboxText(false), CHECKBOX_UNCHECKED);
    assert.equal(buildCheckboxText(true), CHECKBOX_CHECKED);
  });

  test("buildCheckboxText with label", () => {
    assert.equal(buildCheckboxText(false, "Remember me"), `${CHECKBOX_UNCHECKED} Remember me`);
    assert.equal(buildCheckboxText(true, "Remember me"), `${CHECKBOX_CHECKED} Remember me`);
  });

  test("toggleCheckbox flips value", () => {
    assert.equal(toggleCheckbox(false), true);
    assert.equal(toggleCheckbox(true), false);
  });
});

describe("radioGroup widget utilities", () => {
  const options: readonly SelectOption[] = [
    { value: "free", label: "Free" },
    { value: "pro", label: "Pro", disabled: true },
    { value: "enterprise", label: "Enterprise" },
  ];

  test("getRadioIndicator unselected", () => {
    assert.equal(getRadioIndicator(false), RADIO_UNSELECTED);
  });

  test("getRadioIndicator selected", () => {
    assert.equal(getRadioIndicator(true), RADIO_SELECTED);
  });

  test("buildRadioOptionText", () => {
    assert.equal(buildRadioOptionText(false, "Free"), `${RADIO_UNSELECTED} Free`);
    assert.equal(buildRadioOptionText(true, "Free"), `${RADIO_SELECTED} Free`);
  });

  test("findSelectedIndex finds correct index", () => {
    assert.equal(findSelectedIndex("free", options), 0);
    assert.equal(findSelectedIndex("enterprise", options), 2);
    assert.equal(findSelectedIndex("unknown", options), -1);
  });

  test("getNextRadioIndex skips disabled options", () => {
    // From free (index 0), next should be enterprise (index 2), skipping disabled pro (index 1)
    assert.equal(getNextRadioIndex(0, options), 2);
  });

  test("getPrevRadioIndex skips disabled options", () => {
    // From enterprise (index 2), prev should be free (index 0), skipping disabled pro (index 1)
    assert.equal(getPrevRadioIndex(2, options), 0);
  });

  test("selectRadioAtIndex returns value for valid index", () => {
    assert.equal(selectRadioAtIndex(0, options), "free");
    assert.equal(selectRadioAtIndex(2, options), "enterprise");
  });

  test("selectRadioAtIndex returns undefined for disabled option", () => {
    assert.equal(selectRadioAtIndex(1, options), undefined);
  });

  test("selectRadioAtIndex returns undefined for invalid index", () => {
    assert.equal(selectRadioAtIndex(10, options), undefined);
    assert.equal(selectRadioAtIndex(-1, options), undefined);
  });
});

describe("ui helper functions", () => {
  test("ui.button supports shorthand and object overloads", () => {
    const short = ui.button("save", "Save", { disabled: true, px: 2 });
    assert.equal(short.kind, "button");
    assert.deepEqual(short.props, { id: "save", label: "Save", disabled: true, px: 2 });

    const full = ui.button({
      id: "cancel",
      label: "Cancel",
      style: { dim: true },
    });
    assert.equal(full.kind, "button");
    assert.deepEqual(full.props, { id: "cancel", label: "Cancel", style: { dim: true } });
  });

  test("ui.input supports shorthand and object overloads", () => {
    const short = ui.input("query", "", { disabled: true });
    assert.equal(short.kind, "input");
    assert.deepEqual(short.props, { id: "query", value: "", disabled: true });

    const full = ui.input({
      id: "path",
      value: "/tmp",
      style: { italic: true },
    });
    assert.equal(full.kind, "input");
    assert.deepEqual(full.props, { id: "path", value: "/tmp", style: { italic: true } });
  });

  test("ui.textarea creates multiline input vnode", () => {
    const vnode = ui.textarea({
      id: "notes",
      value: "line1\nline2",
      rows: 5,
    });
    assert.equal(vnode.kind, "input");
    assert.deepEqual(vnode.props, {
      id: "notes",
      value: "line1\nline2",
      rows: 5,
      multiline: true,
      wordWrap: true,
    });
  });

  test("ui.field creates field VNode", () => {
    const child = ui.text("input");
    const vnode = ui.field({
      label: "Username",
      required: true,
      error: "Required",
      hint: "Enter your username",
      children: child,
    });

    assert.equal(vnode.kind, "field");
    assert.equal(vnode.props.label, "Username");
    assert.equal(vnode.props.required, true);
    assert.equal(vnode.props.error, "Required");
    assert.equal(vnode.props.hint, "Enter your username");
    if (vnode.kind === "field") {
      assert.equal(vnode.children.length, 1);
    }
  });

  test("ui.select creates select VNode", () => {
    const vnode = ui.select({
      id: "country",
      value: "us",
      options: [
        { value: "us", label: "United States" },
        { value: "uk", label: "United Kingdom" },
      ],
      placeholder: "Select a country",
    });

    assert.equal(vnode.kind, "select");
    assert.equal(vnode.props.id, "country");
    assert.equal(vnode.props.value, "us");
    assert.equal(vnode.props.options.length, 2);
    assert.equal(vnode.props.placeholder, "Select a country");
  });

  test("ui.checkbox creates checkbox VNode", () => {
    const vnode = ui.checkbox({
      id: "remember",
      checked: true,
      label: "Remember me",
    });

    assert.equal(vnode.kind, "checkbox");
    assert.equal(vnode.props.id, "remember");
    assert.equal(vnode.props.checked, true);
    assert.equal(vnode.props.label, "Remember me");
  });

  test("ui.radioGroup creates radioGroup VNode", () => {
    const vnode = ui.radioGroup({
      id: "plan",
      value: "pro",
      options: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
      ],
      direction: "vertical",
    });

    assert.equal(vnode.kind, "radioGroup");
    assert.equal(vnode.props.id, "plan");
    assert.equal(vnode.props.value, "pro");
    assert.equal(vnode.props.options.length, 2);
    assert.equal(vnode.props.direction, "vertical");
  });
});

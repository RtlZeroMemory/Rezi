import { assert, describe, test } from "@rezi-ui/testkit";
import type { SliderProps } from "../../index.js";
import {
  adjustSliderValue,
  clampSliderValue,
  createSliderVNode,
  formatSliderValue,
  normalizeSliderRange,
  normalizeSliderState,
  normalizeSliderStep,
  quantizeSliderValue,
} from "../slider.js";
import { ui } from "../ui.js";

describe("slider widget utilities", () => {
  test("normalizeSliderRange defaults and swaps invalid bounds deterministically", () => {
    assert.deepEqual(normalizeSliderRange(undefined, undefined), { min: 0, max: 100 });
    assert.deepEqual(normalizeSliderRange(10, -5), { min: -5, max: 10 });
  });

  test("normalizeSliderStep clamps to span and handles collapsed ranges", () => {
    assert.equal(normalizeSliderStep(200, { min: 0, max: 10 }), 10);
    assert.equal(normalizeSliderStep(undefined, { min: 2, max: 2 }), 0);
  });

  test("quantizeSliderValue clamps and snaps to nearest step while preserving bounds", () => {
    const range = { min: 0, max: 10 } as const;
    assert.equal(quantizeSliderValue(-999, range, 3), 0);
    assert.equal(quantizeSliderValue(999, range, 3), 10);
    assert.equal(quantizeSliderValue(4.9, range, 2), 4);
    assert.equal(quantizeSliderValue(0.31, { min: 0, max: 1 }, 0.2), 0.4);
  });

  test("normalizeSliderState clamps value and validates non-finite input", () => {
    assert.deepEqual(normalizeSliderState({ value: Number.NaN, min: 5, max: 1, step: -2 }), {
      min: 1,
      max: 5,
      step: 2,
      value: 1,
    });
  });

  test("adjustSliderValue supports step/page/home/end with clamping", () => {
    const state = { min: 0, max: 10, step: 3 } as const;
    assert.equal(adjustSliderValue(0, state, "increase"), 3);
    assert.equal(adjustSliderValue(3, state, "increasePage"), 10);
    assert.equal(adjustSliderValue(10, state, "decreasePage"), 0);
    assert.equal(adjustSliderValue(7, state, "toMin"), 0);
    assert.equal(adjustSliderValue(7, state, "toMax"), 10);
  });

  test("clampSliderValue and formatSliderValue produce deterministic output", () => {
    assert.equal(clampSliderValue(15, 0, 10), 10);
    assert.equal(formatSliderValue(5, 1), "5");
    assert.equal(formatSliderValue(0.5, 0.1), "0.5");
  });
});

describe("slider widget API", () => {
  test("createSliderVNode and ui.slider preserve props", () => {
    const props: SliderProps = {
      id: "volume",
      value: 50,
      min: 0,
      max: 100,
      step: 5,
      width: 12,
      label: "Volume",
      showValue: true,
      disabled: false,
      readOnly: false,
      style: { bold: true },
    };

    const fromFactory = createSliderVNode(props);
    assert.equal(fromFactory.kind, "slider");
    assert.deepEqual(fromFactory.props, props);

    const fromUi = ui.slider(props);
    assert.equal(fromUi.kind, "slider");
    assert.deepEqual(fromUi.props, props);
  });
});

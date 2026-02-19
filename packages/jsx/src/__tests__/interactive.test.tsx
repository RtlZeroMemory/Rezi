/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Button, Checkbox, Input, RadioGroup, Select, Slider } from "../index.js";

describe("interactive widgets", () => {
  test("Button and Input map to matching VNodes", () => {
    assert.deepEqual(<Button id="ok" label="OK" />, ui.button("ok", "OK"));
    assert.deepEqual(
      <Button id="ok" label="OK" disabled />,
      ui.button("ok", "OK", { disabled: true }),
    );

    assert.deepEqual(<Input id="name" value="Alice" />, ui.input("name", "Alice"));
    assert.deepEqual(
      <Input id="name" value="" disabled />,
      ui.input("name", "", { disabled: true }),
    );
  });

  test("Select, Slider, Checkbox, RadioGroup map to matching VNodes", () => {
    const options = [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
    ] as const;

    assert.deepEqual(
      <Select id="country" value="us" options={options} />,
      ui.select({ id: "country", value: "us", options }),
    );

    assert.deepEqual(
      <Slider id="volume" value={25} min={0} max={100} step={5} label="Volume" showValue={false} />,
      ui.slider({ id: "volume", value: 25, min: 0, max: 100, step: 5, label: "Volume", showValue: false }),
    );

    assert.deepEqual(
      <Checkbox id="agree" checked label="I agree" />,
      ui.checkbox({ id: "agree", checked: true, label: "I agree" }),
    );

    assert.deepEqual(
      <RadioGroup id="plan" value="pro" options={options} direction="vertical" />,
      ui.radioGroup({ id: "plan", value: "pro", options, direction: "vertical" }),
    );
  });
});

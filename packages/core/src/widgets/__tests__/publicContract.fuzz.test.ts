import {
  assert,
  type Rng,
  chance,
  fuzzTest,
  pick,
  randomAsciiString,
  randomInt,
} from "@rezi-ui/testkit";
import {
  routeCheckboxKeyDown,
  routeRadioGroupKeyDown,
  routeSelectKeyDown,
} from "../../app/widgetRenderer/keyboardRouting.js";
import type { ZrevEvent } from "../../events.js";
import { type SelectOption, type VNode, createTestRenderer, ui } from "../../index.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import { routeKey } from "../../runtime/router.js";
import type { CheckboxProps, RadioGroupProps, SelectProps } from "../types.js";

const VIEWPORT = Object.freeze({ cols: 72, rows: 24 });
const TEXT_ALPHABET = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:/[]().";

function keyDown(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function fuzzText(rng: Rng, maxLength: number): string {
  return randomAsciiString(rng, {
    maxLength,
    alphabet: TEXT_ALPHABET,
  });
}

function makeWidgetId(prefix: string, iteration: number, index: number): string {
  return `${prefix}-${String(iteration)}-${String(index)}`;
}

function renderWidget(
  vnode: VNode,
  focusedId?: string,
): ReturnType<ReturnType<typeof createTestRenderer>["render"]> {
  return createTestRenderer({ viewport: VIEWPORT, focusedId: focusedId ?? null }).render(vnode);
}

function enabledValues(options: readonly SelectOption[]): readonly string[] {
  return options.filter((option) => option.disabled !== true).map((option) => option.value);
}

function expectedNextValue(
  options: readonly SelectOption[],
  value: string,
  direction: -1 | 1,
): string | null {
  const values = enabledValues(options);
  if (values.length === 0) return null;
  const current = values.indexOf(value);
  const nextIndex = current < 0 ? 0 : (current + direction + values.length) % values.length;
  return values[nextIndex] ?? null;
}

function randomOptions(rng: Rng, count: number): readonly SelectOption[] {
  const out: SelectOption[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      value: i === 0 && chance(rng, 20) ? "" : `value-${String(i)}-${fuzzText(rng, 6)}`,
      label: fuzzText(rng, randomInt(rng, 0, 18)),
      ...(chance(rng, 35) ? { disabled: true } : {}),
    });
  }
  return Object.freeze(out);
}

function chooseCurrentValue(rng: Rng, options: readonly SelectOption[]): string {
  if (options.length === 0 || chance(rng, 25)) return `missing-${fuzzText(rng, 6)}`;
  return pick(rng, options).value;
}

fuzzTest(
  "interactive button contracts route only enabled focused ids",
  { seed: 0xc011_7a01, iterations: 96 },
  (ctx) => {
    const count = randomInt(ctx.rng, 1, 8);
    const buttons = Array.from({ length: count }, (_, i) => {
      const id = makeWidgetId("button", ctx.iteration, i);
      const disabled = chance(ctx.rng, 35);
      return {
        id,
        disabled,
        vnode: ui.button({
          id,
          label: fuzzText(ctx.rng, randomInt(ctx.rng, 0, 28)),
          ...(disabled ? { disabled } : {}),
        }),
      };
    });
    const focused = pick(ctx.rng, buttons);
    const root = ui.column(
      { gap: 0 },
      buttons.map((button) => button.vnode),
    );
    const rendered = createTestRenderer({ viewport: VIEWPORT, focusedId: focused.id }).render(root);

    for (const button of buttons) {
      assert.equal(rendered.findById(button.id)?.kind, "button");
    }

    const result = routeKey(keyDown(pick(ctx.rng, [ZR_KEY_ENTER, ZR_KEY_SPACE] as const)), {
      focusedId: focused.id,
      focusList: buttons.filter((button) => !button.disabled).map((button) => button.id),
      enabledById: new Map(buttons.map((button) => [button.id, !button.disabled])),
      pressableIds: new Set(buttons.map((button) => button.id)),
    });

    if (focused.disabled) {
      assert.deepEqual(result, {});
      return;
    }
    assert.deepEqual(result.action, { id: focused.id, action: "press" });
  },
);

fuzzTest(
  "form choice widgets render type-valid unusual values and route bounded changes",
  { seed: 0xc011_7a02, iterations: 96 },
  (ctx) => {
    const selectId = makeWidgetId("select", ctx.iteration, 0);
    const selectOptions = randomOptions(ctx.rng, randomInt(ctx.rng, 0, 6));
    const selectValue = chooseCurrentValue(ctx.rng, selectOptions);
    const selectDisabled = chance(ctx.rng, 25);
    const selectChanges: string[] = [];
    const selectProps: SelectProps = {
      id: selectId,
      value: selectValue,
      options: selectOptions,
      placeholder: fuzzText(ctx.rng, randomInt(ctx.rng, 0, 12)),
      onChange: (next) => selectChanges.push(next),
      ...(selectDisabled ? { disabled: true } : {}),
    };

    const selectRendered = renderWidget(ui.select(selectProps), selectId);
    assert.equal(selectRendered.findById(selectId)?.kind, "select");

    const selectKey = pick(ctx.rng, [ZR_KEY_UP, ZR_KEY_DOWN, ZR_KEY_ENTER, ZR_KEY_SPACE] as const);
    const selectDirection = selectKey === ZR_KEY_UP ? -1 : 1;
    const selectExpected = expectedNextValue(selectOptions, selectValue, selectDirection);
    const selectResult = routeSelectKeyDown(keyDown(selectKey), {
      focusedId: selectId,
      selectById: new Map([[selectId, selectProps]]),
    });

    if (selectDisabled || selectExpected === null || selectExpected === selectValue) {
      assert.equal(selectResult, null);
      assert.deepEqual(selectChanges, []);
    } else {
      assert.deepEqual(selectResult, { needsRender: true });
      assert.deepEqual(selectChanges, [selectExpected]);
      assert.ok(enabledValues(selectOptions).includes(selectExpected));
    }

    const radioId = makeWidgetId("radio", ctx.iteration, 0);
    const radioOptions = randomOptions(ctx.rng, randomInt(ctx.rng, 1, 6));
    const radioValue = chooseCurrentValue(ctx.rng, radioOptions);
    const radioDisabled = chance(ctx.rng, 25);
    const direction = pick(ctx.rng, ["horizontal", "vertical"] as const);
    const radioChanges: string[] = [];
    const radioProps: RadioGroupProps = {
      id: radioId,
      value: radioValue,
      options: radioOptions,
      direction,
      onChange: (next) => radioChanges.push(next),
      ...(radioDisabled ? { disabled: true } : {}),
    };

    const radioRendered = renderWidget(ui.radioGroup(radioProps), radioId);
    assert.equal(radioRendered.findById(radioId)?.kind, "radioGroup");

    const forwardKey = direction === "horizontal" ? ZR_KEY_RIGHT : ZR_KEY_DOWN;
    const backKey = direction === "horizontal" ? ZR_KEY_LEFT : ZR_KEY_UP;
    const radioKey = chance(ctx.rng, 50) ? forwardKey : backKey;
    const radioDirection = radioKey === forwardKey ? 1 : -1;
    const radioExpected = expectedNextValue(radioOptions, radioValue, radioDirection);
    const radioResult = routeRadioGroupKeyDown(keyDown(radioKey), {
      focusedId: radioId,
      radioGroupById: new Map([[radioId, radioProps]]),
    });

    if (radioDisabled || radioExpected === null || radioExpected === radioValue) {
      assert.equal(radioResult, null);
      assert.deepEqual(radioChanges, []);
    } else {
      assert.deepEqual(radioResult?.action, {
        id: radioId,
        action: "change",
        value: radioExpected,
      });
      assert.deepEqual(radioChanges, [radioExpected]);
      assert.ok(enabledValues(radioOptions).includes(radioExpected));
    }
  },
);

fuzzTest(
  "checkbox contracts route toggle payloads and suppress disabled widgets",
  { seed: 0xc011_7a03, iterations: 64 },
  (ctx) => {
    const id = makeWidgetId("checkbox", ctx.iteration, 0);
    const checked = chance(ctx.rng, 50);
    const disabled = chance(ctx.rng, 35);
    const changes: boolean[] = [];
    const props: CheckboxProps = {
      id,
      checked,
      label: fuzzText(ctx.rng, randomInt(ctx.rng, 0, 32)),
      onChange: (next) => changes.push(next),
      ...(disabled ? { disabled: true } : {}),
    };

    const rendered = renderWidget(ui.checkbox(props), id);
    assert.equal(rendered.findById(id)?.kind, "checkbox");

    const result = routeCheckboxKeyDown(
      keyDown(pick(ctx.rng, [ZR_KEY_ENTER, ZR_KEY_SPACE] as const)),
      {
        focusedId: id,
        checkboxById: new Map([[id, props]]),
      },
    );

    if (disabled) {
      assert.equal(result, null);
      assert.deepEqual(changes, []);
      return;
    }

    assert.deepEqual(result?.action, { id, action: "toggle", checked: !checked });
    assert.deepEqual(changes, [!checked]);
  },
);

fuzzTest(
  "duplicate interactive ids fail during widget render commit",
  { seed: 0xc011_7a04, iterations: 48 },
  (ctx) => {
    const duplicateId = `dup-${String(ctx.iteration)}-${fuzzText(ctx.rng, 8) || "x"}`;
    const factories = [
      () => ui.button({ id: duplicateId, label: fuzzText(ctx.rng, 12) }),
      () => ui.input({ id: duplicateId, value: fuzzText(ctx.rng, 12) }),
      () => ui.select({ id: duplicateId, value: "", options: [] }),
      () => ui.checkbox({ id: duplicateId, checked: chance(ctx.rng, 50) }),
      () =>
        ui.radioGroup({
          id: duplicateId,
          value: "a",
          options: [{ value: "a", label: fuzzText(ctx.rng, 12) }],
        }),
      () => ui.slider({ id: duplicateId, value: randomInt(ctx.rng, 0, 100) }),
      () =>
        ui.virtualList({
          id: duplicateId,
          items: [1, 2],
          renderItem: (item) => ui.text(String(item)),
        }),
    ] as const;

    const first = pick(ctx.rng, factories)();
    const second = pick(ctx.rng, factories)();
    ctx.note(`id=${duplicateId}`);

    assert.throws(
      () => renderWidget(ui.column({ gap: 0 }, [first, second])),
      /ZRUI_DUPLICATE_ID|Duplicate interactive widget id/u,
    );
  },
);

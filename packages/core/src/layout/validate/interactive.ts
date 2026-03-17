import type { ConstraintExpr } from "../../constraints/types.js";
import type {
  Align,
  BoxProps,
  ButtonProps,
  CheckboxProps,
  InputProps,
  RadioGroupProps,
  SelectProps,
  SliderProps,
  SpacerProps,
  StackProps,
  TextProps,
} from "../../widgets/types.js";
import { resolveResponsiveValue } from "../responsive.js";
import type { LayoutConstraintPropBag, ValidatedLayoutConstraints } from "./layoutConstraints.js";
import { validateLayoutConstraints } from "./layoutConstraints.js";
import {
  normalizeStringToken,
  requireBoolean,
  requireFiniteNumber,
  requireFlex,
  requireIntNonNegative,
  requireNonEmptyString,
  requireOptionalFiniteNumber,
  requireOptionalIntNonNegative,
  requireOptionalString,
  requireOptionalTextMaxWidth,
  requireOverflow,
  requireSpacingIntNonNegative,
  requireString,
} from "./primitives.js";
import { type LayoutResult, invalid } from "./shared.js";
import type { ValidatedSpacingProps } from "./spacing.js";
import { validateSpacingProps } from "./spacing.js";

export type ValidatedStackProps = Readonly<
  {
    pad: number;
    gap: number;
    align: Align;
    justify: "start" | "end" | "center" | "between" | "around" | "evenly";
    overflow: "visible" | "hidden" | "scroll";
    scrollX: number;
    scrollY: number;
  } & ValidatedSpacingProps &
    ValidatedLayoutConstraints
>;

export type ValidatedBoxProps = Readonly<
  {
    pad: number;
    gap: number;
    border: "none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed";
    borderTop: boolean;
    borderRight: boolean;
    borderBottom: boolean;
    borderLeft: boolean;
    overflow: "visible" | "hidden" | "scroll";
    scrollX: number;
    scrollY: number;
  } & ValidatedSpacingProps &
    ValidatedLayoutConstraints
>;

export type ValidatedSpacerProps = Readonly<{ size: number; flex: number }>;
export type ValidatedButtonProps = Readonly<{ id: string; label: string; disabled: boolean }>;
export type ValidatedInputProps = Readonly<{
  id: string;
  value: string;
  disabled: boolean;
  readOnly: boolean;
  multiline: boolean;
  rows: number;
  wordWrap: boolean;
}>;
export type ValidatedSelectOption = Readonly<{ value: string; label: string; disabled: boolean }>;
export type ValidatedSelectProps = Readonly<{
  id: string;
  value: string;
  options: readonly ValidatedSelectOption[];
  disabled: boolean;
  placeholder?: string;
}>;
export type ValidatedSliderProps = Readonly<{
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  width?: number;
  label?: string;
  showValue: boolean;
  disabled: boolean;
  readOnly: boolean;
}>;
export type ValidatedCheckboxProps = Readonly<{
  id: string;
  checked: boolean;
  label?: string;
  disabled: boolean;
}>;
export type ValidatedRadioGroupProps = Readonly<{
  id: string;
  value: string;
  options: readonly ValidatedSelectOption[];
  direction: "horizontal" | "vertical";
  disabled: boolean;
}>;
export type ValidatedTextProps = Readonly<{
  maxWidth?: number | ConstraintExpr;
  wrap: boolean;
}>;

type StackPropBag = Readonly<
  {
    pad?: unknown;
    gap?: unknown;
    align?: unknown;
    items?: unknown;
    justify?: unknown;
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
    overflow?: unknown;
    scrollX?: unknown;
    scrollY?: unknown;
  } & LayoutConstraintPropBag
>;

type BoxPropBag = Readonly<
  {
    pad?: unknown;
    gap?: unknown;
    border?: unknown;
    borderTop?: unknown;
    borderRight?: unknown;
    borderBottom?: unknown;
    borderLeft?: unknown;
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
    overflow?: unknown;
    scrollX?: unknown;
    scrollY?: unknown;
  } & LayoutConstraintPropBag
>;

/** Validate Row/Column props: pad (default 0), gap (default 0), align (default "start"). */
export function validateStackProps(
  kind: "row" | "column",
  props: StackProps | unknown,
): LayoutResult<ValidatedStackProps> {
  const p = (props ?? {}) as StackPropBag;

  const padRes = requireSpacingIntNonNegative(kind, "pad", p.pad, 0);
  if (!padRes.ok) return padRes;
  const gapRes = requireSpacingIntNonNegative(kind, "gap", p.gap, 0);
  if (!gapRes.ok) return gapRes;

  const alignRaw = resolveResponsiveValue(p.items ?? p.align);
  const alignValue = alignRaw === undefined ? "start" : normalizeStringToken(alignRaw);
  if (
    alignValue !== "start" &&
    alignValue !== "center" &&
    alignValue !== "end" &&
    alignValue !== "stretch"
  ) {
    return invalid(`${kind}.align must be one of "start" | "center" | "end" | "stretch"`);
  }

  const justifySource = resolveResponsiveValue(p.justify);
  const justifyRaw = justifySource === undefined ? "start" : normalizeStringToken(justifySource);
  const justifyValue =
    justifyRaw === "space-between"
      ? "between"
      : justifyRaw === "space-around"
        ? "around"
        : justifyRaw === "space-evenly"
          ? "evenly"
          : justifyRaw;
  if (
    justifyValue !== "start" &&
    justifyValue !== "end" &&
    justifyValue !== "center" &&
    justifyValue !== "between" &&
    justifyValue !== "around" &&
    justifyValue !== "evenly"
  ) {
    return invalid(
      `${kind}.justify must be one of "start" | "end" | "center" | "between" | "around" | "evenly" (also accepts CSS aliases: "space-between" | "space-around" | "space-evenly")`,
    );
  }

  const lcRes = validateLayoutConstraints(kind, p);
  if (!lcRes.ok) return lcRes;
  const normalizedConstraints: ValidatedLayoutConstraints = { ...lcRes.value };
  const overflowRes = requireOverflow(kind, "overflow", p.overflow, "visible");
  if (!overflowRes.ok) return overflowRes;
  const scrollXRes = requireIntNonNegative(kind, "scrollX", p.scrollX, 0);
  if (!scrollXRes.ok) return scrollXRes;
  const scrollYRes = requireIntNonNegative(kind, "scrollY", p.scrollY, 0);
  if (!scrollYRes.ok) return scrollYRes;

  const spRes = validateSpacingProps(kind, p as unknown as Record<string, unknown>);
  if (!spRes.ok) return spRes;

  return {
    ok: true,
    value: {
      pad: padRes.value,
      gap: gapRes.value,
      align: alignValue,
      justify: justifyValue,
      overflow: overflowRes.value,
      scrollX: scrollXRes.value,
      scrollY: scrollYRes.value,
      ...spRes.value,
      ...normalizedConstraints,
    },
  };
}

/** Validate Box props: pad (default 0), border (default "single"). */
export function validateBoxProps(props: BoxProps | unknown): LayoutResult<ValidatedBoxProps> {
  const p = (props ?? {}) as BoxPropBag;

  const padRes = requireSpacingIntNonNegative("box", "pad", p.pad, 0);
  if (!padRes.ok) return padRes;
  const gapRes = requireSpacingIntNonNegative("box", "gap", p.gap, 0);
  if (!gapRes.ok) return gapRes;

  const borderValue = p.border === undefined ? "single" : normalizeStringToken(p.border);
  if (
    borderValue !== "none" &&
    borderValue !== "single" &&
    borderValue !== "double" &&
    borderValue !== "rounded" &&
    borderValue !== "heavy" &&
    borderValue !== "dashed" &&
    borderValue !== "heavy-dashed"
  ) {
    return invalid(
      'box.border must be one of "none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed"',
    );
  }

  const defaultSide = borderValue !== "none";
  const topRes = requireBoolean("box", "borderTop", p.borderTop, defaultSide);
  if (!topRes.ok) return topRes;
  const rightRes = requireBoolean("box", "borderRight", p.borderRight, defaultSide);
  if (!rightRes.ok) return rightRes;
  const bottomRes = requireBoolean("box", "borderBottom", p.borderBottom, defaultSide);
  if (!bottomRes.ok) return bottomRes;
  const leftRes = requireBoolean("box", "borderLeft", p.borderLeft, defaultSide);
  if (!leftRes.ok) return leftRes;

  const lcRes = validateLayoutConstraints("box", p);
  if (!lcRes.ok) return lcRes;
  const overflowRes = requireOverflow("box", "overflow", p.overflow, "visible");
  if (!overflowRes.ok) return overflowRes;
  const scrollXRes = requireIntNonNegative("box", "scrollX", p.scrollX, 0);
  if (!scrollXRes.ok) return scrollXRes;
  const scrollYRes = requireIntNonNegative("box", "scrollY", p.scrollY, 0);
  if (!scrollYRes.ok) return scrollYRes;

  const spRes = validateSpacingProps("box", p as unknown as Record<string, unknown>);
  if (!spRes.ok) return spRes;

  return {
    ok: true,
    value: {
      pad: padRes.value,
      gap: gapRes.value,
      border: borderValue,
      borderTop: topRes.value,
      borderRight: rightRes.value,
      borderBottom: bottomRes.value,
      borderLeft: leftRes.value,
      overflow: overflowRes.value,
      scrollX: scrollXRes.value,
      scrollY: scrollYRes.value,
      ...spRes.value,
      ...lcRes.value,
    },
  };
}

/** Validate Spacer props: size (default 1). */
export function validateSpacerProps(
  props: SpacerProps | unknown,
): LayoutResult<ValidatedSpacerProps> {
  const p = (props ?? {}) as { size?: unknown; flex?: unknown };
  const flexRes = requireFlex("spacer", p.flex);
  if (!flexRes.ok) return flexRes;
  const flex = flexRes.value ?? 0;
  const defaultSize = flex > 0 ? 0 : 1;
  const sizeRes = requireIntNonNegative("spacer", "size", p.size, defaultSize);
  if (!sizeRes.ok) return sizeRes;
  return { ok: true, value: { size: sizeRes.value, flex } };
}

/** Validate Button props: id (required), label (required), disabled (default false). */
export function validateButtonProps(
  props: ButtonProps | unknown,
): LayoutResult<ValidatedButtonProps> {
  const p = (props ?? {}) as { id?: unknown; label?: unknown; disabled?: unknown };
  const idRes = requireNonEmptyString("button", "id", p.id);
  if (!idRes.ok) return idRes;
  const labelRes = requireString("button", "label", p.label);
  if (!labelRes.ok) return labelRes;
  const disabledRes = requireBoolean("button", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  return {
    ok: true,
    value: { id: idRes.value, label: labelRes.value, disabled: disabledRes.value },
  };
}

/** Validate Input props: id (required, non-empty), value (required), disabled (default false). */
export function validateInputProps(props: InputProps | unknown): LayoutResult<ValidatedInputProps> {
  const p = (props ?? {}) as {
    id?: unknown;
    value?: unknown;
    disabled?: unknown;
    readOnly?: unknown;
    multiline?: unknown;
    rows?: unknown;
    wordWrap?: unknown;
  };
  const idRes = requireNonEmptyString("input", "id", p.id);
  if (!idRes.ok) return idRes;
  const valueRes = requireString("input", "value", p.value);
  if (!valueRes.ok) return valueRes;
  const disabledRes = requireBoolean("input", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  const readOnlyRes = requireBoolean("input", "readOnly", p.readOnly, false);
  if (!readOnlyRes.ok) return readOnlyRes;
  const multilineRes = requireBoolean("input", "multiline", p.multiline, false);
  if (!multilineRes.ok) return multilineRes;
  const rowsRes = requireOptionalIntNonNegative("input", "rows", p.rows);
  if (!rowsRes.ok) return rowsRes;
  const wordWrapRes = requireBoolean("input", "wordWrap", p.wordWrap, true);
  if (!wordWrapRes.ok) return wordWrapRes;

  const multiline = multilineRes.value;
  const rows = multiline ? Math.max(1, rowsRes.value ?? 3) : 1;
  const wordWrap = multiline ? wordWrapRes.value : false;
  return {
    ok: true,
    value: {
      id: idRes.value,
      value: valueRes.value,
      disabled: disabledRes.value,
      readOnly: readOnlyRes.value,
      multiline,
      rows,
      wordWrap,
    },
  };
}

function validateInteractiveOptions(
  kind: "select" | "radioGroup",
  options: unknown,
  requireNonEmpty: boolean,
): LayoutResult<readonly ValidatedSelectOption[]> {
  if (!Array.isArray(options)) {
    return invalid(`${kind}.options must be an array`);
  }
  if (requireNonEmpty && options.length === 0) {
    return invalid(`${kind}.options must be a non-empty array`);
  }
  const validated: ValidatedSelectOption[] = [];
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (typeof option !== "object" || option === null || Array.isArray(option)) {
      return invalid(`${kind}.options[${i}] must be an object`);
    }
    const p = option as { value?: unknown; label?: unknown; disabled?: unknown };
    const valueRes = requireString(`${kind}.options[${i}]`, "value", p.value);
    if (!valueRes.ok) return valueRes;
    const labelRes = requireString(`${kind}.options[${i}]`, "label", p.label);
    if (!labelRes.ok) return labelRes;
    const disabledRes = requireBoolean(`${kind}.options[${i}]`, "disabled", p.disabled, false);
    if (!disabledRes.ok) return disabledRes;
    validated.push({ value: valueRes.value, label: labelRes.value, disabled: disabledRes.value });
  }
  return { ok: true, value: validated };
}

/** Validate Select props: id/value/options required; options may be empty. */
export function validateSelectProps(
  props: SelectProps | unknown,
): LayoutResult<ValidatedSelectProps> {
  const p = (props ?? {}) as {
    id?: unknown;
    value?: unknown;
    options?: unknown;
    disabled?: unknown;
    placeholder?: unknown;
  };
  const idRes = requireNonEmptyString("select", "id", p.id);
  if (!idRes.ok) return idRes;
  const valueRes = requireString("select", "value", p.value);
  if (!valueRes.ok) return valueRes;
  const optionsRes = validateInteractiveOptions("select", p.options, false);
  if (!optionsRes.ok) return optionsRes;
  const disabledRes = requireBoolean("select", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  const placeholderRes = requireOptionalString("select", "placeholder", p.placeholder);
  if (!placeholderRes.ok) return placeholderRes;

  const hasEmptyValueOption = optionsRes.value.some((option) => option.value === "");
  return {
    ok: true,
    value: {
      id: idRes.value,
      value: valueRes.value,
      options: optionsRes.value,
      disabled: disabledRes.value,
      ...(placeholderRes.value === undefined ? {} : { placeholder: placeholderRes.value }),
    },
    ...(hasEmptyValueOption
      ? {
          warnings: Object.freeze([
            'select.options contains value "". Empty-string values are treated as unselected unless an explicit empty option is present in display logic.',
          ]),
        }
      : {}),
  };
}

/** Validate Slider props: id/value required; finite range with min<=max and step>0. */
export function validateSliderProps(
  props: SliderProps | unknown,
): LayoutResult<ValidatedSliderProps> {
  const p = (props ?? {}) as {
    id?: unknown;
    value?: unknown;
    min?: unknown;
    max?: unknown;
    step?: unknown;
    width?: unknown;
    label?: unknown;
    showValue?: unknown;
    disabled?: unknown;
    readOnly?: unknown;
  };
  const idRes = requireNonEmptyString("slider", "id", p.id);
  if (!idRes.ok) return idRes;
  const valueRes = requireFiniteNumber("slider", "value", p.value);
  if (!valueRes.ok) return valueRes;
  const minRes = requireOptionalFiniteNumber("slider", "min", p.min);
  if (!minRes.ok) return minRes;
  const maxRes = requireOptionalFiniteNumber("slider", "max", p.max);
  if (!maxRes.ok) return maxRes;
  const stepRes = requireOptionalFiniteNumber("slider", "step", p.step);
  if (!stepRes.ok) return stepRes;
  const widthRes = requireOptionalIntNonNegative("slider", "width", p.width);
  if (!widthRes.ok) return widthRes;
  const labelRes = requireOptionalString("slider", "label", p.label);
  if (!labelRes.ok) return labelRes;
  const showValueRes = requireBoolean("slider", "showValue", p.showValue, true);
  if (!showValueRes.ok) return showValueRes;
  const disabledRes = requireBoolean("slider", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  const readOnlyRes = requireBoolean("slider", "readOnly", p.readOnly, false);
  if (!readOnlyRes.ok) return readOnlyRes;

  const min = minRes.value ?? 0;
  const max = maxRes.value ?? 100;
  if (min > max) {
    return invalid("slider.min must be <= slider.max");
  }

  const step = stepRes.value ?? 1;
  if (step <= 0) {
    return invalid("slider.step must be a finite number > 0");
  }

  return {
    ok: true,
    value: {
      id: idRes.value,
      value: valueRes.value,
      min,
      max,
      step,
      ...(widthRes.value === undefined ? {} : { width: widthRes.value }),
      ...(labelRes.value === undefined ? {} : { label: labelRes.value }),
      showValue: showValueRes.value,
      disabled: disabledRes.value,
      readOnly: readOnlyRes.value,
    },
  };
}

/** Validate Checkbox props: id and checked required. */
export function validateCheckboxProps(
  props: CheckboxProps | unknown,
): LayoutResult<ValidatedCheckboxProps> {
  const p = (props ?? {}) as {
    id?: unknown;
    checked?: unknown;
    label?: unknown;
    disabled?: unknown;
  };
  const idRes = requireNonEmptyString("checkbox", "id", p.id);
  if (!idRes.ok) return idRes;
  if (typeof p.checked !== "boolean") {
    return invalid("checkbox.checked must be a boolean");
  }
  const labelRes = requireOptionalString("checkbox", "label", p.label);
  if (!labelRes.ok) return labelRes;
  const disabledRes = requireBoolean("checkbox", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  return {
    ok: true,
    value: {
      id: idRes.value,
      checked: p.checked,
      ...(labelRes.value === undefined ? {} : { label: labelRes.value }),
      disabled: disabledRes.value,
    },
  };
}

/** Validate RadioGroup props: id/value/options required; options must be non-empty. */
export function validateRadioGroupProps(
  props: RadioGroupProps | unknown,
): LayoutResult<ValidatedRadioGroupProps> {
  const p = (props ?? {}) as {
    id?: unknown;
    value?: unknown;
    options?: unknown;
    direction?: unknown;
    disabled?: unknown;
  };
  const idRes = requireNonEmptyString("radioGroup", "id", p.id);
  if (!idRes.ok) return idRes;
  const valueRes = requireString("radioGroup", "value", p.value);
  if (!valueRes.ok) return valueRes;
  const optionsRes = validateInteractiveOptions("radioGroup", p.options, true);
  if (!optionsRes.ok) return optionsRes;
  const directionValue = p.direction === undefined ? "vertical" : normalizeStringToken(p.direction);
  if (directionValue !== "horizontal" && directionValue !== "vertical") {
    return invalid('radioGroup.direction must be one of "horizontal" | "vertical"');
  }
  const disabledRes = requireBoolean("radioGroup", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  return {
    ok: true,
    value: {
      id: idRes.value,
      value: valueRes.value,
      options: optionsRes.value,
      direction: directionValue,
      disabled: disabledRes.value,
    },
  };
}

/** Validate Text props (`maxWidth` affects measurement; style/overflow are renderer concerns). */
export function validateTextProps(props: TextProps | unknown): LayoutResult<ValidatedTextProps> {
  const p = (props ?? {}) as { maxWidth?: unknown; wrap?: unknown };
  const maxWidthRes = requireOptionalTextMaxWidth("text", "maxWidth", p.maxWidth);
  if (!maxWidthRes.ok) return maxWidthRes;
  const wrapRes = requireBoolean("text", "wrap", p.wrap, false);
  if (!wrapRes.ok) return wrapRes;

  return {
    ok: true,
    value: {
      ...(maxWidthRes.value === undefined ? {} : { maxWidth: maxWidthRes.value }),
      wrap: wrapRes.value,
    },
  };
}

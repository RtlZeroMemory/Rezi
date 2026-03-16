import type { TextStyle } from "../style.js";
import type { BoxProps, ButtonProps, ColumnProps, RowProps, TextProps, VNode } from "../types.js";

export type UiChild = VNode | false | null | undefined | readonly UiChild[];

export type PanelOptions = Readonly<{
  id?: string;
  key?: string;
  title?: string;
  variant?: BoxProps["border"];
  p?: BoxProps["p"];
  gap?: ColumnProps["gap"];
  style?: BoxProps["style"];
}>;

export type FormOptions = Readonly<{
  id?: string;
  key?: string;
  gap?: ColumnProps["gap"];
}>;

export type ActionsOptions = Readonly<{
  id?: string;
  key?: string;
  gap?: RowProps["gap"];
}>;

export type CenterOptions = Readonly<{
  id?: string;
  key?: string;
  p?: ColumnProps["p"];
}>;

export type KeybindingHelpOptions = Readonly<{
  key?: string;
  title?: string;
  emptyText?: string;
  showMode?: boolean;
  sort?: boolean;
}>;

export function isUiChildren(value: unknown): value is readonly UiChild[] {
  return Array.isArray(value);
}

export function filterChildren(children: readonly UiChild[]): readonly VNode[] {
  const out: VNode[] = [];
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    if (isUiChildren(child)) {
      out.push(...filterChildren(child));
      continue;
    }
    out.push(child as VNode);
  }
  return out;
}

export function maybeReverseChildren(
  children: readonly VNode[],
  reverse: boolean | undefined,
): readonly VNode[] {
  if (reverse !== true || children.length <= 1) return children;
  return Object.freeze([...children].reverse());
}

export function isTextProps(v: TextStyle | TextProps): v is TextProps {
  return (
    typeof v === "object" &&
    v !== null &&
    ("style" in v ||
      "id" in v ||
      "key" in v ||
      "variant" in v ||
      "textOverflow" in v ||
      "maxWidth" in v ||
      "wrap" in v)
  );
}

export function resolveButtonIntent(props: ButtonProps): ButtonProps {
  if (props.intent === undefined || props.dsVariant !== undefined) return props;
  switch (props.intent) {
    case "primary":
      return { ...props, dsVariant: "solid", dsTone: props.dsTone ?? "primary" };
    case "secondary":
      return { ...props, dsVariant: "soft", dsTone: props.dsTone ?? "default" };
    case "danger":
      return { ...props, dsVariant: "outline", dsTone: props.dsTone ?? "danger" };
    case "success":
      return { ...props, dsVariant: "soft", dsTone: props.dsTone ?? "success" };
    case "warning":
      return { ...props, dsVariant: "soft", dsTone: props.dsTone ?? "warning" };
    case "link":
      return {
        ...props,
        dsVariant: "ghost",
        dsTone: props.dsTone ?? "default",
        dsSize: props.dsSize ?? "sm",
      };
  }
}

export function resolveBoxPreset(props: BoxProps): BoxProps {
  const { preset, ...rest } = props;
  if (preset === undefined) return props;
  switch (preset) {
    case "card":
      return { preset, border: "rounded", p: 1, ...rest };
    case "surface":
      return { preset, border: "none", p: 1, ...rest };
    case "well":
      return { preset, border: "single", p: 1, ...rest };
    case "elevated":
      return { preset, border: "single", p: 1, shadow: { density: "light" }, ...rest };
  }
}

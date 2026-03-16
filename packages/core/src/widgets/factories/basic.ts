import type { TextStyle } from "../style.js";
import type {
  BoxProps,
  ColumnProps,
  DividerProps,
  GridProps,
  RowProps,
  ScopedThemeOverride,
  SpacerProps,
  TextProps,
  VNode,
} from "../types.js";
import {
  type UiChild,
  filterChildren,
  isTextProps,
  maybeReverseChildren,
  resolveBoxPreset,
} from "./helpers.js";

const EMPTY_TEXT_PROPS = Object.freeze({}) as TextProps;
const DEFAULT_STACK_GAP = 1;

export function text(content: string): VNode;
export function text(content: string, style: TextStyle): VNode;
export function text(content: string, props: TextProps): VNode;
export function text(content: string, styleOrProps?: TextStyle | TextProps): VNode {
  if (styleOrProps === undefined) return { kind: "text", text: content, props: EMPTY_TEXT_PROPS };
  if (isTextProps(styleOrProps)) return { kind: "text", text: content, props: styleOrProps };
  return { kind: "text", text: content, props: { style: styleOrProps } };
}

export function box(props: BoxProps = {}, children: readonly UiChild[] = []): VNode {
  return { kind: "box", props: resolveBoxPreset(props), children: filterChildren(children) };
}

export function row(props: RowProps = {}, children: readonly UiChild[] = []): VNode {
  const resolved = props.gap === undefined ? { gap: DEFAULT_STACK_GAP, ...props } : props;
  const filtered = filterChildren(children);
  return {
    kind: "row",
    props: resolved,
    children: maybeReverseChildren(filtered, resolved.reverse),
  };
}

export function column(props: ColumnProps = {}, children: readonly UiChild[] = []): VNode {
  const resolved = props.gap === undefined ? { gap: DEFAULT_STACK_GAP, ...props } : props;
  const filtered = filterChildren(children);
  return {
    kind: "column",
    props: resolved,
    children: maybeReverseChildren(filtered, resolved.reverse),
  };
}

export function themed(
  themeOverride: ScopedThemeOverride,
  children: readonly UiChild[] = [],
): VNode {
  return { kind: "themed", props: { theme: themeOverride }, children: filterChildren(children) };
}

export function grid(props: GridProps, ...children: UiChild[]): VNode {
  return { kind: "grid", props, children: filterChildren(children) };
}

export function spacer(props: SpacerProps = {}): VNode {
  return { kind: "spacer", props };
}

export function divider(props: DividerProps = {}): VNode {
  return { kind: "divider", props };
}

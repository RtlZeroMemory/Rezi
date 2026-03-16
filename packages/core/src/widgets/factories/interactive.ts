import type {
  ButtonProps,
  CheckboxProps,
  FieldProps,
  FocusAnnouncerProps,
  FocusTrapProps,
  FocusZoneProps,
  InputProps,
  RadioGroupProps,
  SelectProps,
  SliderProps,
  TextareaProps,
  VNode,
  VirtualListProps,
} from "../types.js";
import { type UiChild, filterChildren, resolveButtonIntent } from "./helpers.js";

export function button(props: ButtonProps): VNode {
  return { kind: "button", props: resolveButtonIntent(props) };
}

export function input(props: InputProps): VNode {
  return { kind: "input", props };
}

export function textarea(props: TextareaProps): VNode {
  return {
    kind: "input",
    props: {
      ...props,
      multiline: true,
      rows: props.rows ?? 3,
      wordWrap: props.wordWrap ?? true,
    },
  };
}

export function focusAnnouncer(props: FocusAnnouncerProps = {}): VNode {
  return { kind: "focusAnnouncer", props };
}

export function focusZone(props: FocusZoneProps, children: readonly UiChild[] = []): VNode {
  return { kind: "focusZone", props, children: filterChildren(children) };
}

export function focusTrap(props: FocusTrapProps, children: readonly UiChild[] = []): VNode {
  return { kind: "focusTrap", props, children: filterChildren(children) };
}

export function virtualList<T>(props: VirtualListProps<T>): VNode {
  return { kind: "virtualList", props: props as VirtualListProps<unknown> };
}

export function field(props: FieldProps): VNode {
  return { kind: "field", props, children: Object.freeze([props.children]) };
}

export function select(props: SelectProps): VNode {
  return { kind: "select", props };
}

export function slider(props: SliderProps): VNode {
  return { kind: "slider", props };
}

export function checkbox(props: CheckboxProps): VNode {
  return { kind: "checkbox", props };
}

export function radioGroup(props: RadioGroupProps): VNode {
  return { kind: "radioGroup", props };
}

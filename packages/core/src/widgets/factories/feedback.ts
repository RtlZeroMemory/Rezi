import type { RegisteredBinding } from "../../keybindings/index.js";
import type {
  BadgeProps,
  CalloutProps,
  EmptyProps,
  ErrorBoundaryProps,
  ErrorDisplayProps,
  GaugeProps,
  IconProps,
  KbdProps,
  LinkProps,
  ProgressProps,
  RichTextProps,
  RichTextSpan,
  SkeletonProps,
  SpinnerProps,
  StatusProps,
  TagProps,
  VNode,
} from "../types.js";
import { column, divider, row, text } from "./basic.js";
import type { KeybindingHelpOptions } from "./helpers.js";

export function icon(iconPath: string, props: Omit<IconProps, "icon"> = {}): VNode {
  return { kind: "icon", props: { icon: iconPath, ...props } };
}

export function spinner(props: SpinnerProps = {}): VNode {
  return { kind: "spinner", props };
}

export function progress(value: number, props: Omit<ProgressProps, "value"> = {}): VNode {
  return { kind: "progress", props: { value, ...props } };
}

export function skeleton(width: number, props: Omit<SkeletonProps, "width"> = {}): VNode {
  return { kind: "skeleton", props: { width, ...props } };
}

export function richText(
  spans: readonly RichTextSpan[],
  props: Omit<RichTextProps, "spans"> = {},
): VNode {
  return { kind: "richText", props: { spans, ...props } };
}

export function kbd(keys: string | readonly string[], props: Omit<KbdProps, "keys"> = {}): VNode {
  return { kind: "kbd", props: { keys, ...props } };
}

function keybindingSequenceToKbdInput(sequence: string): string | readonly string[] {
  const normalized = sequence.trim();
  if (normalized.length === 0) return "";
  const parts = normalized.split(/\s+/);
  if (parts.length <= 1) return normalized;
  return Object.freeze(parts);
}

function keybindingComparator(a: RegisteredBinding, b: RegisteredBinding): number {
  const byMode = a.mode.localeCompare(b.mode);
  if (byMode !== 0) return byMode;
  return a.sequence.localeCompare(b.sequence);
}

export function keybindingHelp(
  bindings: readonly RegisteredBinding[],
  options: KeybindingHelpOptions = {},
): VNode {
  const title = options.title ?? "Keyboard Shortcuts";
  const emptyText = options.emptyText ?? "No shortcuts registered.";
  const showMode =
    options.showMode ??
    (() => {
      const firstMode = bindings[0]?.mode;
      if (firstMode === undefined) return false;
      return bindings.some((binding) => binding.mode !== firstMode);
    })();

  const rows = options.sort === false ? [...bindings] : [...bindings].sort(keybindingComparator);

  return column(
    {
      gap: 1,
      ...(options.key === undefined ? {} : { key: options.key }),
    },
    [
      text(title, { style: { bold: true } }),
      divider({ char: "·" }),
      rows.length > 0
        ? column(
            { gap: 0 },
            rows.map((binding, i) => {
              const keyTokens = keybindingSequenceToKbdInput(binding.sequence);
              const sequenceNode = Array.isArray(keyTokens)
                ? kbd(keyTokens, { separator: " " })
                : kbd(keyTokens);
              const descriptionNode =
                binding.description === undefined
                  ? text("No description", { dim: true })
                  : text(binding.description);
              return row(
                {
                  key: `keybinding-help-${binding.mode}-${binding.sequence}-${String(i)}`,
                  gap: 1,
                  items: "center",
                  wrap: true,
                },
                [
                  sequenceNode,
                  showMode ? text(`[${binding.mode}]`, { dim: true }) : null,
                  descriptionNode,
                ],
              );
            }),
          )
        : text(emptyText, { dim: true }),
    ],
  );
}

export function badge(textValue: string, props: Omit<BadgeProps, "text"> = {}): VNode {
  return { kind: "badge", props: { text: textValue, ...props } };
}

export function status(
  statusValue: StatusProps["status"],
  props: Omit<StatusProps, "status"> = {},
): VNode {
  return { kind: "status", props: { status: statusValue, ...props } };
}

export function tag(textValue: string, props: Omit<TagProps, "text"> = {}): VNode {
  return { kind: "tag", props: { text: textValue, ...props } };
}

export function gauge(value: number, props: Omit<GaugeProps, "value"> = {}): VNode {
  return { kind: "gauge", props: { value, ...props } };
}

export function empty(title: string, props: Omit<EmptyProps, "title"> = {}): VNode {
  return { kind: "empty", props: { title, ...props } };
}

export function errorDisplay(
  message: string,
  props: Omit<ErrorDisplayProps, "message"> = {},
): VNode {
  return { kind: "errorDisplay", props: { message, ...props } };
}

export function errorBoundary(props: ErrorBoundaryProps): VNode {
  return { kind: "errorBoundary", props };
}

export function callout(message: string, props: Omit<CalloutProps, "message"> = {}): VNode {
  return { kind: "callout", props: { message, ...props } };
}

export function link(props: LinkProps): VNode {
  return { kind: "link", props };
}

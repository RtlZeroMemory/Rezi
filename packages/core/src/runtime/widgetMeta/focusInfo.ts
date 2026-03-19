import { getSelectDisplayText } from "../../widgets/select.js";
import type { RuntimeInstance } from "../commit.js";
import { readNonEmptyString } from "./helpers.js";

/** Structured accessibility/focus semantics for a focusable widget. */
export type FocusInfo = Readonly<{
  id: string | null;
  kind: RuntimeInstance["vnode"]["kind"] | null;
  accessibleLabel: string | null;
  visibleLabel: string | null;
  required: boolean;
  errors: readonly string[];
  announcement: string | null;
}>;

export type FieldContext = Readonly<{
  label: string | null;
  required: boolean;
  error: string | null;
}>;

const EMPTY_ERRORS: readonly string[] = Object.freeze([]);

function readFocusableVisibleLabel(vnode: RuntimeInstance["vnode"]): string | null {
  switch (vnode.kind) {
    case "button":
      return readNonEmptyString((vnode.props as { label?: unknown }).label);
    case "link": {
      const props = vnode.props as { label?: unknown; url?: unknown };
      return readNonEmptyString(props.label) ?? readNonEmptyString(props.url);
    }
    case "slider":
      return readNonEmptyString((vnode.props as { label?: unknown }).label);
    case "checkbox":
      return readNonEmptyString((vnode.props as { label?: unknown }).label);
    case "select": {
      const props = vnode.props as {
        value?: unknown;
        options?: unknown;
        placeholder?: unknown;
      };
      const value = typeof props.value === "string" ? props.value : "";
      const options = Array.isArray(props.options)
        ? (props.options as readonly { value?: unknown; label?: unknown }[])
        : [];
      return readNonEmptyString(
        getSelectDisplayText(
          value,
          options as readonly { value: string; label: string; disabled?: boolean }[],
          readNonEmptyString(props.placeholder) ?? undefined,
        ),
      );
    }
    case "radioGroup": {
      const props = vnode.props as { value?: unknown; options?: unknown };
      const value = typeof props.value === "string" ? props.value : "";
      const options = Array.isArray(props.options)
        ? (props.options as readonly { value?: unknown; label?: unknown }[])
        : [];
      for (const option of options) {
        if (
          typeof option?.value === "string" &&
          option.value === value &&
          typeof option.label === "string"
        ) {
          return readNonEmptyString(option.label);
        }
      }
      return null;
    }
    case "commandPalette":
      return readNonEmptyString((vnode.props as { placeholder?: unknown }).placeholder);
    case "filePicker":
      return readNonEmptyString((vnode.props as { rootPath?: unknown }).rootPath);
    case "diffViewer": {
      const diff = (vnode.props as { diff?: { newPath?: unknown; oldPath?: unknown } }).diff;
      if (diff && typeof diff === "object") {
        return readNonEmptyString(diff.newPath) ?? readNonEmptyString(diff.oldPath);
      }
      return null;
    }
    case "toolApprovalDialog": {
      const request = (vnode.props as { request?: { toolName?: unknown } }).request;
      if (request && typeof request === "object") {
        return readNonEmptyString(request.toolName);
      }
      return null;
    }
    default:
      return null;
  }
}

function kindToAnnouncementPrefix(kind: RuntimeInstance["vnode"]["kind"]): string {
  switch (kind) {
    case "button":
      return "Button";
    case "link":
      return "Link";
    case "input":
      return "Input";
    case "slider":
      return "Slider";
    case "virtualList":
      return "List";
    case "table":
      return "Table";
    case "tree":
      return "Tree";
    case "select":
      return "Select";
    case "checkbox":
      return "Checkbox";
    case "radioGroup":
      return "Radio group";
    case "commandPalette":
      return "Command palette";
    case "filePicker":
      return "File picker";
    case "fileTreeExplorer":
      return "File tree explorer";
    case "codeEditor":
      return "Code editor";
    case "diffViewer":
      return "Diff viewer";
    case "toolApprovalDialog":
      return "Tool approval dialog";
    case "logsConsole":
      return "Logs console";
    default:
      return "Widget";
  }
}

export function readFieldContext(vnode: RuntimeInstance["vnode"]): FieldContext | null {
  if (vnode.kind !== "field") return null;
  const props = vnode.props as {
    label?: unknown;
    required?: unknown;
    error?: unknown;
  };
  return Object.freeze({
    label: readNonEmptyString(props.label),
    required: props.required === true,
    error: readNonEmptyString(props.error),
  });
}

function resolveFieldLabel(fieldStack: readonly FieldContext[]): string | null {
  for (let i = fieldStack.length - 1; i >= 0; i--) {
    const label = fieldStack[i]?.label;
    if (label) return label;
  }
  return null;
}

function resolveFieldRequired(fieldStack: readonly FieldContext[]): boolean {
  for (let i = fieldStack.length - 1; i >= 0; i--) {
    if (fieldStack[i]?.required === true) return true;
  }
  return false;
}

function resolveFieldErrors(fieldStack: readonly FieldContext[]): readonly string[] {
  if (fieldStack.length === 0) return EMPTY_ERRORS;
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = fieldStack.length - 1; i >= 0; i--) {
    const error = fieldStack[i]?.error;
    if (!error || seen.has(error)) continue;
    seen.add(error);
    out.push(error);
  }
  return out.length > 0 ? Object.freeze(out) : EMPTY_ERRORS;
}

function buildFocusAnnouncement(
  primary: string,
  required: boolean,
  errors: readonly string[],
): string {
  const parts: string[] = [primary];
  if (required) parts.push("Required");
  if (errors.length === 1) {
    const first = errors[0];
    if (first) parts.push(first);
  } else if (errors.length > 1) {
    parts.push(`${String(errors.length)} validation errors`);
  }
  return parts.join(" — ");
}

export function buildFocusInfo(
  vnode: RuntimeInstance["vnode"],
  id: string,
  fieldStack: readonly FieldContext[],
): FocusInfo {
  const accessibleLabel = readNonEmptyString(
    (vnode.props as { accessibleLabel?: unknown }).accessibleLabel,
  );
  const widgetLabel = readFocusableVisibleLabel(vnode);
  const fieldLabel = resolveFieldLabel(fieldStack);
  const visibleLabel = widgetLabel ?? fieldLabel;
  const required = resolveFieldRequired(fieldStack);
  const errors = resolveFieldErrors(fieldStack);
  const primary =
    accessibleLabel ?? visibleLabel ?? `${kindToAnnouncementPrefix(vnode.kind)} ${id}`;
  return Object.freeze({
    id,
    kind: vnode.kind,
    accessibleLabel,
    visibleLabel,
    required,
    errors,
    announcement: buildFocusAnnouncement(primary, required, errors),
  });
}

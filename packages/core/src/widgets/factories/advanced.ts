import type {
  CodeEditorProps,
  CommandPaletteProps,
  DialogProps,
  DiffViewerProps,
  DropdownProps,
  FilePickerProps,
  FileTreeExplorerProps,
  LayerProps,
  LogsConsoleProps,
  ModalProps,
  PanelGroupProps,
  ResizablePanelProps,
  SplitPaneProps,
  TableProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  TreeProps,
  VNode,
} from "../types.js";
import { text } from "./basic.js";
import { type UiChild, filterChildren } from "./helpers.js";
import { button } from "./interactive.js";

export function dialog(props: DialogProps): VNode {
  const { message, actions, onClose, ...modalProps } = props;
  const baseId = modalProps.id ?? "dialog";
  return {
    kind: "modal",
    props: {
      ...modalProps,
      ...(onClose !== undefined ? { onClose } : {}),
      content: typeof message === "string" ? text(message) : message,
      actions: actions.map((action, index) => {
        const intentProps = action.intent === undefined ? {} : { intent: action.intent };
        return button({
          id: action.id ?? `${baseId}-action-${String(index)}`,
          label: action.label,
          onPress: action.onPress,
          ...intentProps,
          ...(action.disabled === true ? { disabled: true } : {}),
          ...(action.focusable === false ? { focusable: false } : {}),
        });
      }),
    },
  };
}

export function modal(props: ModalProps): VNode {
  return { kind: "modal", props };
}

export function dropdown(props: DropdownProps): VNode {
  return { kind: "dropdown", props };
}

export function layer(props: LayerProps): VNode {
  return { kind: "layer", props };
}

export function table<T>(props: TableProps<T>): VNode {
  return { kind: "table", props: props as TableProps<unknown> };
}

export function tree<T>(props: TreeProps<T>): VNode {
  return { kind: "tree", props: props as TreeProps<unknown> };
}

export function commandPalette(props: CommandPaletteProps): VNode {
  return { kind: "commandPalette", props };
}

export function filePicker(props: FilePickerProps): VNode {
  return { kind: "filePicker", props };
}

export function fileTreeExplorer(props: FileTreeExplorerProps): VNode {
  return { kind: "fileTreeExplorer", props };
}

export function splitPane(props: SplitPaneProps, children: readonly UiChild[] = []): VNode {
  return { kind: "splitPane", props, children: filterChildren(children) };
}

export function panelGroup(props: PanelGroupProps, children: readonly UiChild[] = []): VNode {
  return { kind: "panelGroup", props, children: filterChildren(children) };
}

export function resizablePanel(
  props: ResizablePanelProps = {},
  children: readonly UiChild[] = [],
): VNode {
  return { kind: "resizablePanel", props, children: filterChildren(children) };
}

export function codeEditor(props: CodeEditorProps): VNode {
  return { kind: "codeEditor", props };
}

export function diffViewer(props: DiffViewerProps): VNode {
  return { kind: "diffViewer", props };
}

export function toolApprovalDialog(props: ToolApprovalDialogProps): VNode {
  return { kind: "toolApprovalDialog", props };
}

export function logsConsole(props: LogsConsoleProps): VNode {
  return { kind: "logsConsole", props };
}

export function toastContainer(props: ToastContainerProps): VNode {
  return { kind: "toastContainer", props };
}

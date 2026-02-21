/**
 * packages/core/src/widgets/dialogs/types.ts — Dialog prop types.
 */

export type { DialogAction, DialogActionIntent, DialogProps } from "../types.js";

export type ConfirmDialogProps = Readonly<{
  id: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}>;

export type PromptDialogProps = Readonly<{
  id: string;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}>;

export type AlertDialogProps = Readonly<{
  id: string;
  title: string;
  message: string;
  intent?: "info" | "success" | "warning" | "danger";
  onClose: () => void;
}>;

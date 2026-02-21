/**
 * packages/core/src/widgets/dialogs/confirm.ts — Confirm dialog factory.
 */

import type { VNode } from "../types.js";
import { dialog } from "./dialog.js";
import type { ConfirmDialogProps } from "./types.js";

export function confirmDialog(props: ConfirmDialogProps): VNode {
  const {
    id,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    intent = "primary",
    onConfirm,
    onCancel,
  } = props;

  void intent;

  return dialog({
    id,
    title,
    message,
    actions: [
      {
        id: `${id}-confirm`,
        label: confirmLabel,
        intent,
        onPress: onConfirm,
      },
      {
        id: `${id}-cancel`,
        label: cancelLabel,
        onPress: onCancel,
      },
    ],
    onClose: onCancel,
  });
}

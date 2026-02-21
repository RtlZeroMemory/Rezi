/**
 * packages/core/src/widgets/dialogs/index.ts — Dialog exports.
 */

export type {
  AlertDialogProps,
  ConfirmDialogProps,
  DialogAction,
  DialogActionIntent,
  DialogProps,
  PromptDialogProps,
} from "./types.js";
export { alertDialog } from "./alert.js";
export { confirmDialog } from "./confirm.js";
export { dialog } from "./dialog.js";
export { promptDialog } from "./prompt.js";

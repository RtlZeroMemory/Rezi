/**
 * packages/core/src/widgets/dialogs/dialog.ts — Declarative dialog factory.
 */

import type { VNode } from "../types.js";
import { ui } from "../ui.js";
import type { DialogProps } from "./types.js";

export function dialog(props: DialogProps): VNode {
  return ui.dialog(props);
}

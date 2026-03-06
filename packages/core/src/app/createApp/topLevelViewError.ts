import type { ZrevEvent } from "../../events.js";
import { describeThrown } from "../../debug/describeThrown.js";
import { ZR_MOD_ALT, ZR_MOD_CTRL, ZR_MOD_META, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";

export interface TopLevelViewError {
  readonly code: "ZRUI_USER_CODE_THROW";
  readonly detail: string;
  readonly message: string;
  readonly stack?: string;
}

const KEY_Q = 81;
const KEY_R = 82;
const KEY_C = 67;
const KEY_LOWER_Q = 113;
const KEY_LOWER_R = 114;
const CTRL_C_CODEPOINT = 3;

function isUnmodifiedLetterKey(mods: number): boolean {
  return (mods & (ZR_MOD_CTRL | ZR_MOD_ALT | ZR_MOD_META)) === 0;
}

export function captureTopLevelViewError(value: unknown): TopLevelViewError {
  if (value instanceof Error) {
    return Object.freeze({
      code: "ZRUI_USER_CODE_THROW",
      detail: `${value.name}: ${value.message}`,
      message: value.message,
      ...(typeof value.stack === "string" && value.stack.length > 0 ? { stack: value.stack } : {}),
    });
  }
  const detail = describeThrown(value);
  return Object.freeze({
    code: "ZRUI_USER_CODE_THROW",
    detail,
    message: detail,
  });
}

export function buildTopLevelViewErrorScreen(error: TopLevelViewError): VNode {
  const lines = [`Code: ${error.code}`, `Message: ${error.message}`];
  if (error.stack === undefined || error.stack.length === 0) {
    lines.push(`Detail: ${error.detail}`);
  }
  return ui.column({ width: "full", height: "full", justify: "center", align: "center", p: 1 }, [
    ui.box(
      {
        width: "full",
        height: "full",
        border: "single",
        title: "Runtime Error",
        p: 1,
      },
      [
        ui.errorDisplay(lines.join("\n"), {
          title: "Top-level view() threw",
          ...(error.stack === undefined || error.stack.length === 0
            ? {}
            : { stack: error.stack, showStack: true }),
        }),
        ui.callout("Press R to retry, Q to quit", { variant: "warning" }),
      ],
    ),
  ]);
}

export function isTopLevelRetryEvent(ev: ZrevEvent): boolean {
  if (ev.kind === "key") {
    return ev.action === "down" && isUnmodifiedLetterKey(ev.mods) && ev.key === KEY_R;
  }
  if (ev.kind === "text") {
    return ev.codepoint === KEY_R || ev.codepoint === KEY_LOWER_R;
  }
  return false;
}

export function isTopLevelQuitEvent(ev: ZrevEvent): boolean {
  if (ev.kind === "key") {
    return ev.action === "down" && isUnmodifiedLetterKey(ev.mods) && ev.key === KEY_Q;
  }
  if (ev.kind === "text") {
    return ev.codepoint === KEY_Q || ev.codepoint === KEY_LOWER_Q;
  }
  return false;
}

export function isUnmodifiedTextQuitEvent(ev: ZrevEvent): boolean {
  if (ev.kind !== "text") return false;
  return (
    ev.codepoint === KEY_Q || ev.codepoint === KEY_LOWER_Q || ev.codepoint === CTRL_C_CODEPOINT
  );
}

export function isUnhandledCtrlCKeyEvent(ev: ZrevEvent): boolean {
  if (ev.kind !== "key") return false;
  if (ev.action !== "down") return false;
  if (ev.key !== KEY_C) return false;
  const hasCtrl = (ev.mods & ZR_MOD_CTRL) !== 0;
  if (!hasCtrl) return false;
  return (ev.mods & (ZR_MOD_SHIFT | ZR_MOD_ALT | ZR_MOD_META)) === 0;
}

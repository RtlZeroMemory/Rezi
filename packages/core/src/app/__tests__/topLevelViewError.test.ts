import { assert, test } from "@rezi-ui/testkit";
import { ZR_MOD_CTRL, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { isUnhandledCtrlCKeyEvent } from "../createApp/topLevelViewError.js";

test("isUnhandledCtrlCKeyEvent matches plain Ctrl+C only", () => {
  assert.equal(
    isUnhandledCtrlCKeyEvent({
      kind: "key",
      timeMs: 1,
      key: 67,
      mods: ZR_MOD_CTRL,
      action: "down",
    }),
    true,
  );

  assert.equal(
    isUnhandledCtrlCKeyEvent({
      kind: "key",
      timeMs: 1,
      key: 67,
      mods: ZR_MOD_CTRL | ZR_MOD_SHIFT,
      action: "down",
    }),
    false,
  );
});

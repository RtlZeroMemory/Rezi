import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_DOWN, ZR_KEY_UP } from "../../keybindings/keyCodes.js";
import type { SelectProps } from "../../widgets/types.js";
import { routeSelectKeyDown } from "../widgetRenderer/keyboardRouting.js";

function keyDown(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function createSelect(
  value: string,
  onChange?: (next: string) => void,
): SelectProps {
  return {
    id: "theme",
    value,
    options: Object.freeze([
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light", disabled: true },
      { value: "system", label: "System" },
    ]),
    ...(onChange ? { onChange } : {}),
  };
}

function route(
  event: ZrevEvent,
  props: SelectProps,
): ReturnType<typeof routeSelectKeyDown> {
  return routeSelectKeyDown(event, {
    focusedId: props.id,
    selectById: new Map([[props.id, props]]),
  });
}

describe("select routing contracts", () => {
  test("ArrowUp and ArrowDown wrap across enabled options at the boundaries", () => {
    const wrapDownChanges: string[] = [];
    const downFromLast = route(
      keyDown(ZR_KEY_DOWN),
      createSelect("system", (next) => wrapDownChanges.push(next)),
    );
    assert.deepEqual(downFromLast, { needsRender: true });
    assert.deepEqual(wrapDownChanges, ["dark"]);

    const upChanges: string[] = [];
    const upFromFirst = route(
      keyDown(ZR_KEY_UP),
      createSelect("dark", (next) => upChanges.push(next)),
    );
    assert.deepEqual(upFromFirst, { needsRender: true });
    assert.deepEqual(upChanges, ["system"]);
  });

  test("select without onChange ignores arrow-key cycling commands", () => {
    assert.equal(route(keyDown(ZR_KEY_DOWN), createSelect("dark")), null);
    assert.equal(route(keyDown(ZR_KEY_UP), createSelect("dark")), null);
  });
});

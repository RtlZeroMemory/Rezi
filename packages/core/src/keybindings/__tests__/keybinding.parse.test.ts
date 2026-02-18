import { assert, describe, test } from "@rezi-ui/testkit";
import * as keyCodes from "../keyCodes.js";
import { parseKeySequence } from "../parser.js";

const NO_MODS: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean } = Object.freeze({
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
});

function mods(overrides: Partial<typeof NO_MODS>) {
  return Object.freeze({ ...NO_MODS, ...overrides });
}

function expectSingle(input: string, key: number, expectedMods: typeof NO_MODS = NO_MODS): void {
  const result = parseKeySequence(input);
  assert.equal(result.ok, true, `expected "${input}" to parse`);
  if (!result.ok) return;
  assert.deepEqual(result.value.keys, [{ key, mods: expectedMods }]);
}

function expectError(
  input: string,
  expectedCode?: "INVALID_KEY" | "EMPTY_SEQUENCE" | "INVALID_MODIFIER",
): void {
  const result = parseKeySequence(input);
  assert.equal(result.ok, false, `expected "${input}" to be invalid`);
  if (result.ok) return;
  if (expectedCode !== undefined) {
    assert.equal(result.error.code, expectedCode);
  }
}

describe("parseKeySequence area A", () => {
  describe("modifier combinations and order invariance", () => {
    test("parses ctrl+a", () => {
      expectSingle("ctrl+a", 65, mods({ ctrl: true }));
    });

    test("parses shift+a", () => {
      expectSingle("shift+a", 65, mods({ shift: true }));
    });

    test("parses alt+a", () => {
      expectSingle("alt+a", 65, mods({ alt: true }));
    });

    test("parses meta+a", () => {
      expectSingle("meta+a", 65, mods({ meta: true }));
    });

    test("parses ctrl+shift+a with both modifiers set", () => {
      expectSingle("ctrl+shift+a", 65, mods({ ctrl: true, shift: true }));
    });

    test("parses ctrl+alt+a", () => {
      expectSingle("ctrl+alt+a", 65, mods({ ctrl: true, alt: true }));
    });

    test("parses ctrl+shift+alt+a", () => {
      expectSingle("ctrl+shift+alt+a", 65, mods({ ctrl: true, shift: true, alt: true }));
    });

    test("parses ctrl+shift+alt+meta+a", () => {
      expectSingle(
        "ctrl+shift+alt+meta+a",
        65,
        mods({ ctrl: true, shift: true, alt: true, meta: true }),
      );
    });

    test("modifier order does not change parse result for ctrl and shift", () => {
      const a = parseKeySequence("ctrl+shift+a");
      const b = parseKeySequence("shift+ctrl+a");
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      if (!a.ok || !b.ok) return;
      assert.deepEqual(a.value, b.value);
    });

    test("modifier order does not change parse result across all modifiers", () => {
      const a = parseKeySequence("meta+alt+ctrl+shift+z");
      const b = parseKeySequence("shift+ctrl+alt+meta+z");
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      if (!a.ok || !b.ok) return;
      assert.deepEqual(a.value, b.value);
    });

    test("meta aliases parse to the same result", () => {
      const parsed = ["meta", "cmd", "command", "win", "super"].map((alias) =>
        parseKeySequence(`${alias}+q`),
      );

      for (const result of parsed) {
        assert.equal(result.ok, true);
      }
      if (parsed.some((result) => !result.ok)) return;

      const baseline = parsed[0];
      if (!baseline || !baseline.ok) return;
      for (const result of parsed.slice(1)) {
        if (!result.ok) return;
        assert.deepEqual(result.value, baseline.value);
      }
    });

    test("control alias parses to the same result as ctrl", () => {
      const ctrl = parseKeySequence("ctrl+c");
      const control = parseKeySequence("control+c");
      assert.equal(ctrl.ok, true);
      assert.equal(control.ok, true);
      if (!ctrl.ok || !control.ok) return;
      assert.deepEqual(ctrl.value, control.value);
    });

    test("ctrl+A and ctrl+shift+a differ only by shift modifier", () => {
      const ctrlA = parseKeySequence("ctrl+A");
      const ctrlShiftA = parseKeySequence("ctrl+shift+a");
      assert.equal(ctrlA.ok, true);
      assert.equal(ctrlShiftA.ok, true);
      if (!ctrlA.ok || !ctrlShiftA.ok) return;

      const a = ctrlA.value.keys[0];
      const b = ctrlShiftA.value.keys[0];
      assert.equal(a?.key, b?.key);
      assert.equal(a?.mods.ctrl, true);
      assert.equal(b?.mods.ctrl, true);
      assert.equal(a?.mods.shift, false);
      assert.equal(b?.mods.shift, true);
    });

    test("ctrl+A and ctrl+a parse identically", () => {
      const upper = parseKeySequence("ctrl+A");
      const lower = parseKeySequence("ctrl+a");
      assert.equal(upper.ok, true);
      assert.equal(lower.ok, true);
      if (!upper.ok || !lower.ok) return;
      assert.deepEqual(upper.value, lower.value);
    });
  });

  describe("function keys f1-f12", () => {
    const fnCases: ReadonlyArray<readonly [string, number]> = [
      ["f1", keyCodes.ZR_KEY_F1],
      ["f2", keyCodes.ZR_KEY_F2],
      ["f3", keyCodes.ZR_KEY_F3],
      ["f4", keyCodes.ZR_KEY_F4],
      ["f5", keyCodes.ZR_KEY_F5],
      ["f6", keyCodes.ZR_KEY_F6],
      ["f7", keyCodes.ZR_KEY_F7],
      ["f8", keyCodes.ZR_KEY_F8],
      ["f9", keyCodes.ZR_KEY_F9],
      ["f10", keyCodes.ZR_KEY_F10],
      ["f11", keyCodes.ZR_KEY_F11],
      ["f12", keyCodes.ZR_KEY_F12],
    ];

    for (const [input, expectedCode] of fnCases) {
      test(`parses ${input}`, () => {
        expectSingle(input, expectedCode);
      });
    }
  });

  describe("special keys", () => {
    test("escape aliases parse to the same key", () => {
      expectSingle("escape", keyCodes.ZR_KEY_ESCAPE);
      expectSingle("esc", keyCodes.ZR_KEY_ESCAPE);
    });

    test("enter aliases parse to the same key", () => {
      expectSingle("enter", keyCodes.ZR_KEY_ENTER);
      expectSingle("return", keyCodes.ZR_KEY_ENTER);
    });

    test("parses tab, backspace, and space", () => {
      expectSingle("tab", keyCodes.ZR_KEY_TAB);
      expectSingle("backspace", keyCodes.ZR_KEY_BACKSPACE);
      expectSingle("space", keyCodes.ZR_KEY_SPACE);
    });

    test("parses insert and delete aliases", () => {
      expectSingle("insert", keyCodes.ZR_KEY_INSERT);
      expectSingle("delete", keyCodes.ZR_KEY_DELETE);
      expectSingle("del", keyCodes.ZR_KEY_DELETE);
    });

    test("parses home/end/pageup/pagedown", () => {
      expectSingle("home", keyCodes.ZR_KEY_HOME);
      expectSingle("end", keyCodes.ZR_KEY_END);
      expectSingle("pageup", keyCodes.ZR_KEY_PAGE_UP);
      expectSingle("pagedown", keyCodes.ZR_KEY_PAGE_DOWN);
    });

    test("parses arrow keys", () => {
      expectSingle("up", keyCodes.ZR_KEY_UP);
      expectSingle("down", keyCodes.ZR_KEY_DOWN);
      expectSingle("left", keyCodes.ZR_KEY_LEFT);
      expectSingle("right", keyCodes.ZR_KEY_RIGHT);
    });
  });

  describe("case behavior", () => {
    test("treats key names and modifier names as case-insensitive", () => {
      const mixed = parseKeySequence("CtRl+ShIfT+EsCaPe");
      const lower = parseKeySequence("ctrl+shift+escape");
      assert.equal(mixed.ok, true);
      assert.equal(lower.ok, true);
      if (!mixed.ok || !lower.ok) return;
      assert.deepEqual(mixed.value, lower.value);
    });

    test("uppercase and lowercase letters parse to same key code", () => {
      const upper = parseKeySequence("A");
      const lower = parseKeySequence("a");
      assert.equal(upper.ok, true);
      assert.equal(lower.ok, true);
      if (!upper.ok || !lower.ok) return;
      assert.deepEqual(upper.value, lower.value);
    });

    test("function key names are case-insensitive", () => {
      const upper = parseKeySequence("F12");
      const lower = parseKeySequence("f12");
      assert.equal(upper.ok, true);
      assert.equal(lower.ok, true);
      if (!upper.ok || !lower.ok) return;
      assert.deepEqual(upper.value, lower.value);
    });
  });

  describe("whitespace behavior", () => {
    test("trims leading and trailing whitespace", () => {
      expectSingle("   ctrl+s   ", 83, mods({ ctrl: true }));
    });

    test("splits chord parts on mixed whitespace", () => {
      const result = parseKeySequence("ctrl+k\tctrl+c\nctrl+u");
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.value.keys, [
        { key: 75, mods: mods({ ctrl: true }) },
        { key: 67, mods: mods({ ctrl: true }) },
        { key: 85, mods: mods({ ctrl: true }) },
      ]);
    });

    test("multiple spaces between chord keys are allowed", () => {
      const result = parseKeySequence("g    g");
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.value.keys, [
        { key: 71, mods: NO_MODS },
        { key: 71, mods: NO_MODS },
      ]);
    });

    test("whitespace-only input is rejected", () => {
      expectError("   \t\n", "EMPTY_SEQUENCE");
    });

    test("whitespace around + is rejected (ctrl +a)", () => {
      expectError("ctrl +a", "INVALID_KEY");
    });

    test("whitespace around + is rejected (ctrl+ a)", () => {
      expectError("ctrl+ a", "INVALID_KEY");
    });

    test("whitespace around + is rejected ( ctrl + a )", () => {
      expectError(" ctrl + a ");
    });
  });

  describe("numeric keys", () => {
    test("parses digit 0", () => {
      expectSingle("0", 48);
    });

    test("parses digit 9", () => {
      expectSingle("9", 57);
    });

    test("parses ctrl+5", () => {
      expectSingle("ctrl+5", 53, mods({ ctrl: true }));
    });
  });

  describe("punctuation keys", () => {
    test("parses dash and equals", () => {
      expectSingle("-", "-".charCodeAt(0));
      expectSingle("=", "=".charCodeAt(0));
    });

    test("parses semicolon", () => {
      expectSingle(";", ";".charCodeAt(0));
    });

    test("parses quote and comma", () => {
      expectSingle("'", "'".charCodeAt(0));
      expectSingle(",", ",".charCodeAt(0));
    });

    test("parses slash", () => {
      expectSingle("/", "/".charCodeAt(0));
    });

    test("parses bracket keys", () => {
      expectSingle("[", "[".charCodeAt(0));
      expectSingle("]", "]".charCodeAt(0));
    });

    test("parses backslash", () => {
      expectSingle("\\", "\\".charCodeAt(0));
    });

    test("parses ctrl+.", () => {
      expectSingle("ctrl+.", ".".charCodeAt(0), mods({ ctrl: true }));
    });
  });

  describe("invalid inputs", () => {
    test("rejects duplicate modifier ctrl+ctrl+a", () => {
      expectError("ctrl+ctrl+a");
    });

    test("rejects duplicate modifier via alias ctrl+control+a", () => {
      expectError("ctrl+control+a");
    });

    test("rejects duplicate modifier shift+shift+a", () => {
      expectError("shift+shift+a");
    });

    test("rejects malformed empty component ctrl++a", () => {
      expectError("ctrl++a", "INVALID_KEY");
    });

    test("rejects malformed key starting with +", () => {
      expectError("+a", "INVALID_KEY");
    });

    test("rejects malformed key ending with +", () => {
      expectError("ctrl+", "INVALID_KEY");
    });

    test("rejects empty input string", () => {
      expectError("", "EMPTY_SEQUENCE");
    });

    test("rejects modifier-only input", () => {
      expectError("alt", "INVALID_KEY");
    });

    test("rejects non-modifier in modifier position", () => {
      expectError("a+ctrl", "INVALID_MODIFIER");
    });

    test("rejects unknown function key f13", () => {
      expectError("f13", "INVALID_KEY");
    });

    test("rejects unknown key name", () => {
      expectError("notakey", "INVALID_KEY");
    });

    test("rejects plus sign literal because + is separator", () => {
      expectError("+", "INVALID_KEY");
    });

    test("throws when parseKeySequence is called with a non-string", () => {
      assert.throws(() => parseKeySequence(42 as unknown as string));
    });

    test("throws when parseKeySequence is called with null", () => {
      assert.throws(() => parseKeySequence(null as unknown as string));
    });

    test("throws when parseKeySequence is called with undefined", () => {
      assert.throws(() => parseKeySequence(undefined as unknown as string));
    });
  });
});

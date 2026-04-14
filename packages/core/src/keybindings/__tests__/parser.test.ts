import { assert, describe, test } from "@rezi-ui/testkit";
import {
  EMPTY_MODS,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_F1,
  ZR_KEY_F12,
  ZR_KEY_SPACE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
} from "../keyCodes.js";
import { keyToString, keysEqual, parseKeySequence, sequenceToString } from "../parser.js";
import type { Modifiers, ParsedKey } from "../types.js";

describe("parseKeySequence", () => {
  describe("single letter keys", () => {
    test("lowercase letter", () => {
      const result = parseKeySequence("a");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(result.value.keys.length, 1);
      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;

      // 'a' should be converted to uppercase ASCII (65)
      assert.equal(key.key, 65);
      assert.equal(key.mods.shift, false);
      assert.equal(key.mods.ctrl, false);
      assert.equal(key.mods.alt, false);
      assert.equal(key.mods.meta, false);
    });

    test("uppercase letter", () => {
      const result = parseKeySequence("A");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, 65);
      assert.equal(key.mods.shift, true);
    });

    test("digit", () => {
      const result = parseKeySequence("5");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      // '5' = ASCII 53
      assert.equal(key.key, 53);
    });
  });

  describe("named keys", () => {
    test("escape", () => {
      const result = parseKeySequence("escape");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_ESCAPE);
    });

    test("esc (alias)", () => {
      const result = parseKeySequence("esc");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_ESCAPE);
    });

    test("enter", () => {
      const result = parseKeySequence("enter");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_ENTER);
    });

    test("return (alias)", () => {
      const result = parseKeySequence("return");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_ENTER);
    });

    test("tab", () => {
      const result = parseKeySequence("tab");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_TAB);
    });

    test("space", () => {
      const result = parseKeySequence("space");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_SPACE);
    });

    test("up arrow", () => {
      const result = parseKeySequence("up");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_UP);
    });
  });

  describe("function keys", () => {
    test("f1", () => {
      const result = parseKeySequence("f1");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_F1);
    });

    test("f12", () => {
      const result = parseKeySequence("f12");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_F12);
    });
  });

  describe("with modifiers", () => {
    test("ctrl+s", () => {
      const result = parseKeySequence("ctrl+s");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, 83); // 'S'
      assert.equal(key.mods.ctrl, true);
      assert.equal(key.mods.shift, false);
      assert.equal(key.mods.alt, false);
      assert.equal(key.mods.meta, false);
    });

    test("shift+a", () => {
      const result = parseKeySequence("shift+a");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, 65); // 'A'
      assert.equal(key.mods.shift, true);
      assert.equal(key.mods.ctrl, false);
    });

    test("ctrl+shift+z", () => {
      const result = parseKeySequence("ctrl+shift+z");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, 90); // 'Z'
      assert.equal(key.mods.ctrl, true);
      assert.equal(key.mods.shift, true);
      assert.equal(key.mods.alt, false);
      assert.equal(key.mods.meta, false);
    });

    test("alt+f4", () => {
      const result = parseKeySequence("alt+f4");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.key, ZR_KEY_F1 + 3); // f4
      assert.equal(key.mods.alt, true);
    });

    test("meta+q (cmd/command/win/super aliases)", () => {
      for (const mod of ["meta", "cmd", "command", "win", "super"]) {
        const result = parseKeySequence(`${mod}+q`);
        assert.equal(result.ok, true, `${mod}+q should parse`);
        if (!result.ok) continue;

        const key = result.value.keys[0];
        assert.ok(key);
        if (!key) continue;
        assert.equal(key.mods.meta, true, `${mod} should set meta flag`);
      }
    });

    test("control (alias for ctrl)", () => {
      const result = parseKeySequence("control+c");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const key = result.value.keys[0];
      assert.ok(key);
      if (!key) return;
      assert.equal(key.mods.ctrl, true);
    });
  });

  describe("chord sequences", () => {
    test("g g", () => {
      const result = parseKeySequence("g g");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(result.value.keys.length, 2);

      const key0 = result.value.keys[0];
      const key1 = result.value.keys[1];
      assert.ok(key0);
      assert.ok(key1);
      if (!key0 || !key1) return;

      assert.equal(key0.key, 71); // 'G'
      assert.equal(key1.key, 71); // 'G'
    });

    test("ctrl+k ctrl+c", () => {
      const result = parseKeySequence("ctrl+k ctrl+c");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(result.value.keys.length, 2);

      const key0 = result.value.keys[0];
      const key1 = result.value.keys[1];
      assert.ok(key0);
      assert.ok(key1);
      if (!key0 || !key1) return;

      assert.equal(key0.key, 75); // 'K'
      assert.equal(key0.mods.ctrl, true);
      assert.equal(key1.key, 67); // 'C'
      assert.equal(key1.mods.ctrl, true);
    });

    test("g t t", () => {
      const result = parseKeySequence("g t t");
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(result.value.keys.length, 3);
    });
  });

  describe("case insensitivity", () => {
    test("bare uppercase letter implies shift", () => {
      const upper = parseKeySequence("J");
      const explicit = parseKeySequence("shift+j");

      assert.equal(upper.ok, true);
      assert.equal(explicit.ok, true);
      if (!upper.ok || !explicit.ok) return;

      assert.deepEqual(upper.value, explicit.value);
    });

    test("CTRL+S equals ctrl+s", () => {
      const upper = parseKeySequence("CTRL+S");
      const lower = parseKeySequence("ctrl+s");

      assert.equal(upper.ok, true);
      assert.equal(lower.ok, true);
      if (!upper.ok || !lower.ok) return;

      const keyU = upper.value.keys[0];
      const keyL = lower.value.keys[0];
      assert.ok(keyU);
      assert.ok(keyL);
      if (!keyU || !keyL) return;

      assert.equal(keyU.key, keyL.key);
      assert.equal(keyU.mods.ctrl, keyL.mods.ctrl);
    });
  });

  describe("error cases", () => {
    test("empty string", () => {
      const result = parseKeySequence("");
      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.error.code, "EMPTY_SEQUENCE");
    });

    test("whitespace only", () => {
      const result = parseKeySequence("   ");
      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.error.code, "EMPTY_SEQUENCE");
    });

    test("invalid key name", () => {
      const result = parseKeySequence("notakey");
      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.error.code, "INVALID_KEY");
    });

    test("modifier only (no key)", () => {
      const result = parseKeySequence("ctrl");
      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.error.code, "INVALID_KEY");
    });

    test("invalid modifier", () => {
      const result = parseKeySequence("foo+a");
      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.error.code, "INVALID_MODIFIER");
    });

    test("empty component (ctrl++s)", () => {
      const result = parseKeySequence("ctrl++s");
      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.error.code, "INVALID_KEY");
    });
  });
});

describe("keysEqual", () => {
  test("identical keys are equal", () => {
    const a: ParsedKey = { key: 65, mods: { shift: false, ctrl: true, alt: false, meta: false } };
    const b: ParsedKey = { key: 65, mods: { shift: false, ctrl: true, alt: false, meta: false } };
    assert.equal(keysEqual(a, b), true);
  });

  test("different key codes are not equal", () => {
    const a: ParsedKey = { key: 65, mods: EMPTY_MODS };
    const b: ParsedKey = { key: 66, mods: EMPTY_MODS };
    assert.equal(keysEqual(a, b), false);
  });

  test("different modifiers are not equal", () => {
    const a: ParsedKey = { key: 65, mods: { shift: true, ctrl: false, alt: false, meta: false } };
    const b: ParsedKey = { key: 65, mods: { shift: false, ctrl: true, alt: false, meta: false } };
    assert.equal(keysEqual(a, b), false);
  });
});

describe("keyToString", () => {
  test("simple key", () => {
    const key: ParsedKey = { key: 65, mods: EMPTY_MODS };
    assert.equal(keyToString(key), "a");
  });

  test("key with ctrl", () => {
    const key: ParsedKey = { key: 83, mods: { shift: false, ctrl: true, alt: false, meta: false } };
    assert.equal(keyToString(key), "ctrl+s");
  });

  test("key with multiple modifiers", () => {
    const key: ParsedKey = { key: 90, mods: { shift: true, ctrl: true, alt: false, meta: false } };
    assert.equal(keyToString(key), "ctrl+shift+z");
  });

  test("named key", () => {
    const key: ParsedKey = { key: ZR_KEY_ESCAPE, mods: EMPTY_MODS };
    assert.equal(keyToString(key), "escape");
  });
});

describe("sequenceToString", () => {
  test("single key", () => {
    const result = parseKeySequence("ctrl+s");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(sequenceToString(result.value), "ctrl+s");
  });

  test("chord sequence", () => {
    const result = parseKeySequence("g g");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(sequenceToString(result.value), "g g");
  });
});

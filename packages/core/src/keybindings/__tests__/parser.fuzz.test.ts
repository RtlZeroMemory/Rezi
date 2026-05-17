import { assert, test } from "@rezi-ui/testkit";
import { type Rng, chance, pick, randomAsciiString, randomInt, runFuzz } from "@rezi-ui/testkit";
import { keyToString, keysEqual, parseKeySequence, sequenceToString } from "../parser.js";
import type { ParsedKey } from "../types.js";

const KEY_NAMES = [
  "a",
  "z",
  "A",
  "Z",
  "0",
  "9",
  "escape",
  "enter",
  "tab",
  "space",
  "backspace",
  "delete",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  "f1",
  "f12",
] as const;

const MODIFIER_SETS = [
  [] as const,
  ["ctrl"] as const,
  ["alt"] as const,
  ["shift"] as const,
  ["meta"] as const,
  ["ctrl", "shift"] as const,
  ["ctrl", "alt"] as const,
  ["alt", "shift"] as const,
  ["ctrl", "alt", "shift"] as const,
  ["ctrl", "alt", "shift", "meta"] as const,
] as const;

function buildKeyPart(rng: Rng): string {
  const mods = pick(rng, MODIFIER_SETS);
  const key = pick(rng, KEY_NAMES);
  const parts: string[] = chance(rng, 25) ? [...mods].reverse() : [...mods];
  parts.push(key);
  return parts.join("+");
}

function assertSameSequence(a: readonly ParsedKey[], b: readonly ParsedKey[]): void {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    assert.ok(left);
    assert.ok(right);
    if (!left || !right) continue;
    assert.equal(keysEqual(left, right), true);
  }
}

test("keybinding parser fuzz: valid public syntax round-trips through canonical strings", async () => {
  await runFuzz(
    { label: "keybinding-valid-roundtrip", seed: 0x6b3d_0001, iterations: 260 },
    (ctx) => {
      const chordLength = randomInt(ctx.rng, 1, 8);
      const input = Array.from({ length: chordLength }, () => buildKeyPart(ctx.rng)).join(
        chance(ctx.rng, 35) ? "   " : " ",
      );

      const parsed = parseKeySequence(chance(ctx.rng, 25) ? `  ${input}  ` : input);
      assert.equal(parsed.ok, true, input);
      if (!parsed.ok) return;

      const canonical = sequenceToString(parsed.value);
      const reparsed = parseKeySequence(canonical);
      assert.equal(reparsed.ok, true, canonical);
      if (!reparsed.ok) return;

      assertSameSequence(parsed.value.keys, reparsed.value.keys);

      for (const key of parsed.value.keys) {
        const keyString = keyToString(key);
        const single = parseKeySequence(keyString);
        assert.equal(single.ok, true, keyString);
        if (!single.ok) continue;
        assert.equal(single.value.keys.length, 1);
        const singleKey = single.value.keys[0];
        assert.ok(singleKey);
        if (singleKey) assert.equal(keysEqual(key, singleKey), true);
      }
    },
  );
});

test("keybinding parser fuzz: malformed syntax is rejected with structured errors", async () => {
  await runFuzz(
    { label: "keybinding-invalid-structured", seed: 0x6b3d_0002, iterations: 200 },
    (ctx) => {
      const invalid = pick(ctx.rng, [
        "",
        "   ",
        "ctrl",
        "alt+",
        "+a",
        "ctrl+ctrl+a",
        "a+ctrl",
        "unknownKey",
        "ctrl+unknownKey",
        "g g g g g g g g g",
        randomAsciiString(ctx.rng, { minLength: 2, maxLength: 12, alphabet: "+ " }),
        `${randomAsciiString(ctx.rng, { minLength: 1, maxLength: 6, alphabet: "!@#$%^&*" })}+a`,
      ]);

      assert.doesNotThrow(() => parseKeySequence(invalid));
      const parsed = parseKeySequence(invalid);
      assert.equal(parsed.ok, false, invalid);
      if (parsed.ok) return;
      assert.ok(
        ["EMPTY_SEQUENCE", "INVALID_KEY", "INVALID_MODIFIER"].includes(parsed.error.code),
        parsed.error.detail,
      );
      assert.equal(typeof parsed.error.detail, "string");
      assert.ok(parsed.error.detail.length > 0);
    },
  );
});

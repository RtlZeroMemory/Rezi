import { assert, describe, test } from "@rezi-ui/testkit";
import { CHORD_TIMEOUT_MS, buildTrie, matchKey, resetChordState } from "../chordMatcher.js";
import { parseKeySequence } from "../parser.js";
import type { KeyBinding, ParsedKey } from "../types.js";

type TestContext = { tag: string };

function makeBinding(sequence: string, priority = 0): KeyBinding<TestContext> {
  const parsed = parseKeySequence(sequence);
  if (!parsed.ok) throw new Error(`Invalid sequence: ${sequence}`);

  return Object.freeze({
    sequence: parsed.value,
    priority,
    handler: () => {},
  });
}

function makeKey(keyStr: string): ParsedKey {
  const parsed = parseKeySequence(keyStr);
  if (!parsed.ok) throw new Error(`Invalid key: ${keyStr}`);
  if (parsed.value.keys.length !== 1) throw new Error(`Expected one key: ${keyStr}`);

  const key = parsed.value.keys[0];
  if (!key) throw new Error(`No key found: ${keyStr}`);
  return key;
}

function reset() {
  return resetChordState();
}

describe("keybinding chord area B", () => {
  test("empty chord string is rejected by parser", () => {
    const parsed = parseKeySequence("");
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.error.code, "EMPTY_SEQUENCE");
  });

  describe("simple and deep chords", () => {
    test("returns pending for first key in a two-key chord", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");
      const r1 = matchKey(trie, reset(), g, 10);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r1.nextState.pendingKeys.length, 1);
      assert.equal(r1.nextState.startTimeMs, 10);
    });

    test("matches a two-key chord within timeout window", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");
      const r1 = matchKey(trie, reset(), g, 100);
      const r2 = matchKey(trie, r1.nextState, g, 200);

      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, gg);
      assert.equal(r2.nextState.pendingKeys.length, 0);
    });

    test("keeps pending through intermediate steps of a three-key chord", () => {
      const gtt = makeBinding("g t t");
      const trie = buildTrie([gtt]);

      const g = makeKey("g");
      const t = makeKey("t");

      const r1 = matchKey(trie, reset(), g, 0);
      const r2 = matchKey(trie, r1.nextState, t, 50);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "pending");
      assert.equal(r2.nextState.pendingKeys.length, 2);
      assert.equal(r2.nextState.startTimeMs, 0);
    });

    test("matches a three-key chord", () => {
      const gtt = makeBinding("g t t");
      const trie = buildTrie([gtt]);

      const g = makeKey("g");
      const t = makeKey("t");

      const r1 = matchKey(trie, reset(), g, 5);
      const r2 = matchKey(trie, r1.nextState, t, 15);
      const r3 = matchKey(trie, r2.nextState, t, 25);

      assert.equal(r3.result.kind, "matched");
      if (r3.result.kind !== "matched") return;
      assert.equal(r3.result.binding, gtt);
    });

    test("matches a four-key deep chord", () => {
      const gtyz = makeBinding("g t y z");
      const trie = buildTrie([gtyz]);

      const g = makeKey("g");
      const t = makeKey("t");
      const y = makeKey("y");
      const z = makeKey("z");

      const r1 = matchKey(trie, reset(), g, 1000);
      const r2 = matchKey(trie, r1.nextState, t, 1001);
      const r3 = matchKey(trie, r2.nextState, y, 1002);
      const r4 = matchKey(trie, r3.nextState, z, 1003);

      assert.equal(r4.result.kind, "matched");
      if (r4.result.kind !== "matched") return;
      assert.equal(r4.result.binding, gtyz);
    });

    test("matches deep chord under rapid input with identical timestamps", () => {
      const qwe = makeBinding("q w e");
      const trie = buildTrie([qwe]);

      const q = makeKey("q");
      const w = makeKey("w");
      const e = makeKey("e");

      const r1 = matchKey(trie, reset(), q, 777);
      const r2 = matchKey(trie, r1.nextState, w, 777);
      const r3 = matchKey(trie, r2.nextState, e, 777);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "pending");
      assert.equal(r3.result.kind, "matched");
    });
  });

  describe("timeout behavior", () => {
    test("resets pending chord when gap is greater than CHORD_TIMEOUT_MS", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");

      const r1 = matchKey(trie, reset(), g, 0);
      const r2 = matchKey(trie, r1.nextState, g, CHORD_TIMEOUT_MS + 1);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "pending");
      assert.equal(r2.nextState.pendingKeys.length, 1);
      assert.equal(r2.nextState.startTimeMs, CHORD_TIMEOUT_MS + 1);
    });

    test("does not timeout at exactly CHORD_TIMEOUT_MS boundary", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");

      const r1 = matchKey(trie, reset(), g, 100);
      const r2 = matchKey(trie, r1.nextState, g, 100 + CHORD_TIMEOUT_MS);

      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, gg);
    });

    test("preserves original start time while sequence is still pending", () => {
      const gtt = makeBinding("g t t");
      const trie = buildTrie([gtt]);

      const g = makeKey("g");
      const t = makeKey("t");

      const r1 = matchKey(trie, reset(), g, 50);
      const r2 = matchKey(trie, r1.nextState, t, 900);
      const r3 = matchKey(trie, r2.nextState, t, 50 + CHORD_TIMEOUT_MS);

      assert.equal(r2.result.kind, "pending");
      assert.equal(r2.nextState.startTimeMs, 50);
      assert.equal(r3.result.kind, "matched");
    });

    test("timeout followed by unrelated key returns none and clears state", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");
      const x = makeKey("x");

      const r1 = matchKey(trie, reset(), g, 0);
      const r2 = matchKey(trie, r1.nextState, x, CHORD_TIMEOUT_MS + 5);

      assert.equal(r2.result.kind, "none");
      assert.equal(r2.nextState.pendingKeys.length, 0);
      assert.equal(r2.nextState.startTimeMs, 0);
    });
  });

  describe("pending cancellation and recovery", () => {
    test("cancels pending chord on unrelated key", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");
      const x = makeKey("x");

      const r1 = matchKey(trie, reset(), g, 1);
      const r2 = matchKey(trie, r1.nextState, x, 2);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "none");
      assert.equal(r2.nextState.pendingKeys.length, 0);
    });

    test("cancellation can fresh-match a single-key binding", () => {
      const gg = makeBinding("g g");
      const x = makeBinding("x");
      const trie = buildTrie([gg, x]);

      const g = makeKey("g");
      const xKey = makeKey("x");

      const r1 = matchKey(trie, reset(), g, 10);
      const r2 = matchKey(trie, r1.nextState, xKey, 11);

      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, x);
    });

    test("cancellation can restart as a different pending chord", () => {
      const gg = makeBinding("g g");
      const xy = makeBinding("x y");
      const trie = buildTrie([gg, xy]);

      const g = makeKey("g");
      const x = makeKey("x");

      const r1 = matchKey(trie, reset(), g, 1);
      const r2 = matchKey(trie, r1.nextState, x, 2);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "pending");
      assert.equal(r2.nextState.pendingKeys.length, 1);
      assert.equal(r2.nextState.pendingKeys[0]?.key, x.key);
      assert.equal(r2.nextState.startTimeMs, 2);
    });

    test("chord can restart after cancellation failure", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");
      const x = makeKey("x");

      const r1 = matchKey(trie, reset(), g, 100);
      const r2 = matchKey(trie, r1.nextState, x, 200);
      const r3 = matchKey(trie, r2.nextState, g, 300);

      assert.equal(r2.result.kind, "none");
      assert.equal(r3.result.kind, "pending");
      assert.equal(r3.nextState.pendingKeys.length, 1);
    });

    test("reset helper returns initial empty chord state", () => {
      const state = reset();
      assert.equal(state.pendingKeys.length, 0);
      assert.equal(state.startTimeMs, 0);
    });
  });

  describe("shared prefixes", () => {
    test("selects first branch under shared prefix", () => {
      const gt = makeBinding("g t");
      const gg = makeBinding("g g");
      const trie = buildTrie([gt, gg]);

      const g = makeKey("g");
      const t = makeKey("t");

      const r1 = matchKey(trie, reset(), g, 0);
      const r2 = matchKey(trie, r1.nextState, t, 1);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, gt);
    });

    test("selects second branch under shared prefix", () => {
      const gt = makeBinding("g t");
      const gg = makeBinding("g g");
      const trie = buildTrie([gt, gg]);

      const g = makeKey("g");

      const r1 = matchKey(trie, reset(), g, 0);
      const r2 = matchKey(trie, r1.nextState, g, 1);

      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, gg);
    });

    test("stays pending at ambiguous intermediate shared prefix", () => {
      const gtx = makeBinding("g t x");
      const gty = makeBinding("g t y");
      const trie = buildTrie([gtx, gty]);

      const g = makeKey("g");
      const t = makeKey("t");

      const r1 = matchKey(trie, reset(), g, 40);
      const r2 = matchKey(trie, r1.nextState, t, 50);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "pending");
      assert.equal(r2.nextState.pendingKeys.length, 2);
    });

    test("resolves ambiguous shared prefix on final key", () => {
      const gtx = makeBinding("g t x");
      const gty = makeBinding("g t y");
      const trie = buildTrie([gtx, gty]);

      const g = makeKey("g");
      const t = makeKey("t");
      const y = makeKey("y");

      const r1 = matchKey(trie, reset(), g, 10);
      const r2 = matchKey(trie, r1.nextState, t, 20);
      const r3 = matchKey(trie, r2.nextState, y, 30);

      assert.equal(r3.result.kind, "matched");
      if (r3.result.kind !== "matched") return;
      assert.equal(r3.result.binding, gty);
    });
  });

  describe("modifier chords", () => {
    test("matches chord with modifiers on each key", () => {
      const ctrlKCtrlC = makeBinding("ctrl+k ctrl+c");
      const trie = buildTrie([ctrlKCtrlC]);

      const ctrlK = makeKey("ctrl+k");
      const ctrlC = makeKey("ctrl+c");

      const r1 = matchKey(trie, reset(), ctrlK, 0);
      const r2 = matchKey(trie, r1.nextState, ctrlC, 1);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, ctrlKCtrlC);
    });

    test("matches chord with mixed modifiers", () => {
      const ctrlKShiftX = makeBinding("ctrl+k shift+x");
      const trie = buildTrie([ctrlKShiftX]);

      const ctrlK = makeKey("ctrl+k");
      const shiftX = makeKey("shift+x");

      const r1 = matchKey(trie, reset(), ctrlK, 0);
      const r2 = matchKey(trie, r1.nextState, shiftX, 1);

      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, ctrlKShiftX);
    });

    test("matches chord where first key has ctrl and second key does not", () => {
      const ctrlKC = makeBinding("ctrl+k c");
      const trie = buildTrie([ctrlKC]);

      const ctrlK = makeKey("ctrl+k");
      const c = makeKey("c");

      const r1 = matchKey(trie, reset(), ctrlK, 0);
      const r2 = matchKey(trie, r1.nextState, c, 1);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, ctrlKC);
    });

    test("fails when later key modifier differs", () => {
      const ctrlKCtrlC = makeBinding("ctrl+k ctrl+c");
      const trie = buildTrie([ctrlKCtrlC]);

      const ctrlK = makeKey("ctrl+k");
      const plainC = makeKey("c");

      const r1 = matchKey(trie, reset(), ctrlK, 100);
      const r2 = matchKey(trie, r1.nextState, plainC, 150);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "none");
      assert.equal(r2.nextState.pendingKeys.length, 0);
    });

    test("modifier mismatch can still fresh-match another binding", () => {
      const ctrlKCtrlC = makeBinding("ctrl+k ctrl+c");
      const plainC = makeBinding("c");
      const trie = buildTrie([ctrlKCtrlC, plainC]);

      const ctrlK = makeKey("ctrl+k");
      const c = makeKey("c");

      const r1 = matchKey(trie, reset(), ctrlK, 0);
      const r2 = matchKey(trie, r1.nextState, c, 2);

      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, plainC);
    });
  });

  describe("reset and single-vs-prefix conflict", () => {
    test("single-key sequence behaves the same as a non-chord binding", () => {
      const single = makeBinding("a");
      const trie = buildTrie([single]);

      const a = makeKey("a");
      const r = matchKey(trie, reset(), a, 12);

      assert.equal(r.result.kind, "matched");
      if (r.result.kind !== "matched") return;
      assert.equal(r.result.binding, single);
    });

    test("resets after successful chord match", () => {
      const gg = makeBinding("g g");
      const trie = buildTrie([gg]);

      const g = makeKey("g");

      const r1 = matchKey(trie, reset(), g, 10);
      const r2 = matchKey(trie, r1.nextState, g, 20);
      const r3 = matchKey(trie, r2.nextState, g, 30);

      assert.equal(r2.result.kind, "matched");
      assert.equal(r3.result.kind, "pending");
      assert.equal(r3.nextState.pendingKeys.length, 1);
    });

    test("resets after failure and allows next match", () => {
      const gg = makeBinding("g g");
      const h = makeBinding("h");
      const trie = buildTrie([gg, h]);

      const g = makeKey("g");
      const x = makeKey("x");
      const hKey = makeKey("h");

      const r1 = matchKey(trie, reset(), g, 0);
      const r2 = matchKey(trie, r1.nextState, x, 1);
      const r3 = matchKey(trie, r2.nextState, hKey, 2);

      assert.equal(r2.result.kind, "none");
      assert.equal(r3.result.kind, "matched");
      if (r3.result.kind !== "matched") return;
      assert.equal(r3.result.binding, h);
    });

    test("prefers single-key binding when also a prefix", () => {
      const g = makeBinding("g");
      const gg = makeBinding("g g");
      const trie = buildTrie([g, gg]);

      const gKey = makeKey("g");
      const r1 = matchKey(trie, reset(), gKey, 500);

      assert.equal(r1.result.kind, "matched");
      if (r1.result.kind !== "matched") return;
      assert.equal(r1.result.binding, g);
      assert.equal(r1.nextState.pendingKeys.length, 0);
    });

    test("repeated key produces repeated single-key matches in prefix conflict", () => {
      const g = makeBinding("g");
      const gg = makeBinding("g g");
      const trie = buildTrie([g, gg]);

      const gKey = makeKey("g");

      const r1 = matchKey(trie, reset(), gKey, 0);
      const r2 = matchKey(trie, r1.nextState, gKey, 1);

      assert.equal(r1.result.kind, "matched");
      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, g);
    });

    test("fresh fallback also prefers single-key over prefix", () => {
      const xy = makeBinding("x y");
      const g = makeBinding("g");
      const gg = makeBinding("g g");
      const trie = buildTrie([xy, g, gg]);

      const x = makeKey("x");
      const gKey = makeKey("g");

      const r1 = matchKey(trie, reset(), x, 100);
      const r2 = matchKey(trie, r1.nextState, gKey, 110);

      assert.equal(r1.result.kind, "pending");
      assert.equal(r2.result.kind, "matched");
      if (r2.result.kind !== "matched") return;
      assert.equal(r2.result.binding, g);
      assert.equal(r2.nextState.pendingKeys.length, 0);
    });
  });
});

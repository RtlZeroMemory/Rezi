import { assert, describe, test } from "@rezi-ui/testkit";
import { kittyFlags, kittyModifiers } from "../index.js";

describe("kitty keyboard exports", () => {
  test("kittyFlags values match Ink v6.7.0", () => {
    assert.equal(kittyFlags.disambiguateEscapeCodes, 1);
    assert.equal(kittyFlags.reportEventTypes, 2);
    assert.equal(kittyFlags.reportAlternateKeys, 4);
    assert.equal(kittyFlags.reportAllKeysAsEscapeCodes, 8);
    assert.equal(kittyFlags.reportAssociatedText, 16);
  });

  test("kittyModifiers values match Ink v6.7.0", () => {
    assert.equal(kittyModifiers.shift, 1);
    assert.equal(kittyModifiers.alt, 2);
    assert.equal(kittyModifiers.ctrl, 4);
    assert.equal(kittyModifiers.super, 8);
    assert.equal(kittyModifiers.hyper, 16);
    assert.equal(kittyModifiers.meta, 32);
    assert.equal(kittyModifiers.capsLock, 64);
    assert.equal(kittyModifiers.numLock, 128);
  });
});


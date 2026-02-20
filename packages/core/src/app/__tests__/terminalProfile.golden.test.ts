import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import type { TerminalCaps } from "../../terminalCaps.js";
import type { TerminalProfile } from "../../terminalProfile.js";
import { terminalProfileFromCaps } from "../../terminalProfile.js";

type TerminalProfileFixtureCase = Readonly<{
  name: string;
  caps: TerminalCaps;
  expect: TerminalProfile;
}>;

type TerminalProfileFixture = Readonly<{
  schemaVersion: 1;
  cases: readonly TerminalProfileFixtureCase[];
}>;

async function loadFixture(): Promise<TerminalProfileFixture> {
  const bytes = await readFixture("terminal/profile_from_caps.json");
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as TerminalProfileFixture;
}

describe("terminal profile derivation (locked) - golden fixtures", () => {
  test("profile_from_caps.json", async () => {
    const fixture = await loadFixture();
    assert.equal(fixture.schemaVersion, 1);

    for (const item of fixture.cases) {
      const first = terminalProfileFromCaps(item.caps);
      const second = terminalProfileFromCaps(item.caps);
      assert.deepEqual(first, item.expect, item.name);
      assert.deepEqual(second, item.expect, `${item.name} second pass`);
      assert.deepEqual(second, first, `${item.name} deterministic`);
    }
  });
});

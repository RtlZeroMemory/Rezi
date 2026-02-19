import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import { ZRUI_TEXT_MEASURE_VERSION } from "../../index.js";
import { measureTextCells } from "../textMeasure.js";

type TextMeasureCase = Readonly<{ name: string; text: string; width: number }>;
type TextMeasureFixture = Readonly<{ schemaVersion: 1; cases: readonly TextMeasureCase[] }>;

async function loadJson(rel: string): Promise<TextMeasureFixture> {
  const bytes = await readFixture(`text-measure/${rel}`);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as TextMeasureFixture;
}

function assertFixture(f: TextMeasureFixture, rel: string): void {
  assert.equal(f.schemaVersion, 1, `${rel}: schemaVersion`);
  for (const c of f.cases) {
    assert.equal(measureTextCells(c.text), c.width, `${rel}: ${c.name}`);
  }
}

describe("measureTextCells (pinned) - golden fixtures", () => {
  test("ZRUI_TEXT_MEASURE_VERSION is pinned", () => {
    assert.equal(ZRUI_TEXT_MEASURE_VERSION, 2);
  });

  test("graphemes.json", async () => {
    const f = await loadJson("graphemes.json");
    assertFixture(f, "graphemes.json");
  });

  test("strings.json", async () => {
    const f = await loadJson("strings.json");
    assertFixture(f, "strings.json");
  });

  test("invalid-surrogates.json", async () => {
    const f = await loadJson("invalid-surrogates.json");
    assertFixture(f, "invalid-surrogates.json");
  });
});

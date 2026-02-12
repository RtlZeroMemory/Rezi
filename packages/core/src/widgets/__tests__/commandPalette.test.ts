import { assert, test } from "@rezi-ui/testkit";
import { computeCommandPaletteWindow, getFilteredItems, sortByScore } from "../commandPalette.js";

test("commandPalette: computeCommandPaletteWindow keeps selection visible", () => {
  assert.deepEqual(computeCommandPaletteWindow(0, 0, 10), { start: 0, count: 0 });
  assert.deepEqual(computeCommandPaletteWindow(0, 5, 10), { start: 0, count: 5 });

  assert.deepEqual(computeCommandPaletteWindow(0, 20, 10), { start: 0, count: 10 });
  assert.deepEqual(computeCommandPaletteWindow(5, 20, 10), { start: 0, count: 10 });
  assert.deepEqual(computeCommandPaletteWindow(10, 20, 10), { start: 5, count: 10 });
  assert.deepEqual(computeCommandPaletteWindow(15, 20, 10), { start: 10, count: 10 });

  assert.deepEqual(computeCommandPaletteWindow(-5, 20, 10), { start: 0, count: 10 });
  assert.deepEqual(computeCommandPaletteWindow(999, 20, 10), { start: 10, count: 10 });
});

test('commandPalette: fuzzy query "cmd" matches "Command Palette"', async () => {
  const source = {
    id: "commands",
    name: "Commands",
    getItems: () =>
      [
        { id: "cmd-palette", label: "Command Palette", sourceId: "commands" },
        { id: "open-file", label: "Open File", sourceId: "commands" },
      ] as const,
  };

  const results = await getFilteredItems([source], "cmd");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.label, "Command Palette");
});

test("commandPalette: sortByScore keeps original order for equal scores", () => {
  const items = [
    { id: "open", label: "Open", sourceId: "commands" },
    { id: "opal", label: "Opal", sourceId: "commands" },
  ] as const;

  const sorted = sortByScore(items, "op");
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["open", "opal"],
  );
});

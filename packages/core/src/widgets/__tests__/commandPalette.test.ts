import { assert, test } from "@rezi-ui/testkit";
import { computeCommandPaletteWindow, getFilteredItems, sortByScore } from "../commandPalette.js";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
  };
}

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

test("commandPalette: async sources keep declared source order regardless of resolution order", async () => {
  const commands =
    createDeferred<readonly Readonly<{ id: string; label: string; sourceId: string }>[]>();
  const symbols =
    createDeferred<readonly Readonly<{ id: string; label: string; sourceId: string }>[]>();

  const sources = [
    {
      id: "commands",
      name: "Commands",
      getItems: () => commands.promise,
    },
    {
      id: "symbols",
      name: "Symbols",
      getItems: () => symbols.promise,
    },
  ] as const;

  const pending = getFilteredItems(sources, "");

  symbols.resolve([{ id: "sym-1", label: "Symbol One", sourceId: "symbols" }] as const);
  commands.resolve([
    { id: "cmd-1", label: "Command One", sourceId: "commands" },
    { id: "cmd-2", label: "Command Two", sourceId: "commands" },
  ] as const);

  const items = await pending;
  assert.deepEqual(
    items.map((item) => item.id),
    ["cmd-1", "cmd-2", "sym-1"],
  );
});

test('commandPalette: longest prefix match routes ">> foo" to ">>" source', async () => {
  let shortPrefixCalls = 0;
  let longPrefixQuery = "";

  const sources = [
    {
      id: "short",
      name: "Short",
      prefix: ">",
      getItems: () => {
        shortPrefixCalls++;
        return [{ id: "short-item", label: "Short Item", sourceId: "short" }] as const;
      },
    },
    {
      id: "long",
      name: "Long",
      prefix: ">>",
      getItems: (query: string) => {
        longPrefixQuery = query;
        return [{ id: "long-item", label: "Foo command", sourceId: "long" }] as const;
      },
    },
  ] as const;

  const items = await getFilteredItems(sources, ">> foo");
  assert.equal(shortPrefixCalls, 0);
  assert.equal(longPrefixQuery, "foo");
  assert.deepEqual(
    items.map((item) => item.id),
    ["long-item"],
  );
});

test("commandPalette: rejected source does not hide successful source results", async () => {
  const sources = [
    {
      id: "ok",
      name: "OK",
      getItems: async () => [{ id: "ok-1", label: "Alpha", sourceId: "ok" }] as const,
    },
    {
      id: "bad",
      name: "Bad",
      getItems: async () => {
        throw new Error("source failed");
      },
    },
  ] as const;

  const items = await getFilteredItems(sources, "alp");
  assert.deepEqual(
    items.map((item) => item.id),
    ["ok-1"],
  );
});

test("commandPalette: higher-priority source wins score ties", async () => {
  const sources = [
    {
      id: "low",
      name: "Low",
      priority: 1,
      getItems: () => [{ id: "low-1", label: "Same", sourceId: "low" }] as const,
    },
    {
      id: "high",
      name: "High",
      priority: 10,
      getItems: () => [{ id: "high-1", label: "Same", sourceId: "high" }] as const,
    },
  ] as const;

  const items = await getFilteredItems(sources, "");
  assert.deepEqual(
    items.map((item) => item.id),
    ["high-1", "low-1"],
  );
});

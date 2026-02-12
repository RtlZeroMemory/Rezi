import { assert, describe, test } from "@rezi-ui/testkit";
import type { StaticProps } from "../index.js";

describe("StaticProps type parity", () => {
  test("items is mutable array in the type surface", () => {
    // Compile-time coverage: Ink types use `T[]` (mutable) for items.
    assert.ok(true);
  });
});

const _mutable: StaticProps<string> = { items: ["a"], children: (item) => item };
void _mutable;

const _readonlyItems = ["a"] as const;
// @ts-expect-error Ink types require `items: T[]` (mutable), not readonly arrays.
const _readonly: StaticProps<string> = { items: _readonlyItems, children: (item) => item };
void _readonly;


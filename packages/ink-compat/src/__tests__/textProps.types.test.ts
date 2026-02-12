import { assert, describe, test } from "@rezi-ui/testkit";
import type { TextProps } from "../index.js";

describe("TextProps type parity", () => {
  test("accepts Ink-style color strings", () => {
    // Compile-time coverage: this file exists to ensure TS accepts Ink's
    // documented color string forms.
    assert.ok(true);
  });
});

const _ok1: TextProps = { color: "red", backgroundColor: "#ff00ff", children: "x" };
const _ok2: TextProps = { color: "rgb(1,2,3)", backgroundColor: "ansi256(123)", children: "x" };

void _ok1;
void _ok2;


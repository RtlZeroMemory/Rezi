import assert from "node:assert/strict";
import test from "node:test";
import { createTestRenderer } from "@rezi-ui/core/testing";
import { renderStressExampleWidget } from "../helpers/test-examples.js";

test("stress example widget renders expected labels", () => {
  const renderer = createTestRenderer({ viewport: { cols: 60, rows: 10 } });
  const output = renderer.render(renderStressExampleWidget({ phase: 3, turbo: true })).toText();
  assert.match(output, /Stress Template Test Widget/);
  assert.match(output, /Phase: 3/);
});

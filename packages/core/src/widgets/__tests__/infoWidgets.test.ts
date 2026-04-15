import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../testing/index.js";
import { ui } from "../ui.js";

describe("informational widgets - visible behavior", () => {
  test("empty renders title, description, and action affordance", () => {
    const output = createTestRenderer({ viewport: { cols: 40, rows: 10 } })
      .render(
        ui.empty("No results", {
          description: "Try changing your filters.",
          action: ui.button({ id: "retry", label: "Retry" }),
        }),
      )
      .toText();

    assert.equal(output.includes("No results"), true);
    assert.equal(output.includes("Try changing your filters."), true);
    assert.equal(output.includes("[Retry]"), true);
  });

  test("empty with empty title and description still shows its action affordance", () => {
    const output = createTestRenderer({ viewport: { cols: 40, rows: 10 } })
      .render(
        ui.empty("", {
          description: "",
          action: ui.button({ id: "retry", label: "Retry" }),
        }),
      )
      .toText();

    assert.equal(output.trim(), "[Retry]");
  });

  test("errorDisplay renders title, message, stack, and retry affordance when enabled", () => {
    const output = createTestRenderer({ viewport: { cols: 40, rows: 10 } })
      .render(
        ui.errorDisplay("Build failed", {
          title: "Build error",
          stack: "line1\nline2",
          showStack: true,
          onRetry: () => undefined,
        }),
      )
      .toText();

    assert.equal(output.includes("✗ Build error"), true);
    assert.equal(output.includes("Build failed"), true);
    assert.equal(output.includes("line1"), true);
    assert.equal(output.includes("line2"), true);
    assert.equal(output.includes("[Retry]"), true);
  });

  test("errorDisplay omits stack rows when showStack is true but stack is empty", () => {
    const output = createTestRenderer({ viewport: { cols: 40, rows: 10 } })
      .render(
        ui.errorDisplay("boom", {
          title: "Oops",
          showStack: true,
        }),
      )
      .toText();

    const visibleLines = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    assert.deepEqual(visibleLines, ["✗ Oops", "boom"]);
  });

  test("callout renders the override icon, title, and message", () => {
    const output = createTestRenderer({ viewport: { cols: 40, rows: 10 } })
      .render(
        ui.callout("Saved successfully", {
          title: "Done",
          icon: "status.info",
        }),
      )
      .toText();

    assert.equal(output.includes("[i]"), true);
    assert.equal(output.includes("Done"), true);
    assert.equal(output.includes("Saved successfully"), true);
  });
});

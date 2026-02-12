import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveAppConfig } from "../createApp.js";

describe("resolveAppConfig: incrementalRendering", () => {
  test("defaults to enabled", () => {
    const cfg = resolveAppConfig(undefined);
    assert.equal(cfg.incrementalRendering, true);
  });

  test("accepts explicit toggle", () => {
    const disabled = resolveAppConfig({ incrementalRendering: false });
    const enabled = resolveAppConfig({ incrementalRendering: true });

    assert.equal(disabled.incrementalRendering, false);
    assert.equal(enabled.incrementalRendering, true);
  });
});

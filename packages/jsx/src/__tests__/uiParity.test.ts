import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import * as components from "../components.js";
import * as jsxIndex from "../index.js";

/**
 * The JSX component layer in components.ts is maintained by hand. These tests
 * pin it to the `ui.*` factory surface in @rezi-ui/core so the two cannot
 * drift apart silently.
 */

/** JSX exports with no `ui.*` counterpart, by design. */
const JSX_ONLY = new Set(["Fragment"]);

/** `ui.*` factories with no JSX component, by design. */
const UI_ONLY = new Set<string>();

function toComponentName(factoryName: string): string {
  return factoryName.charAt(0).toUpperCase() + factoryName.slice(1);
}

const factoryNames = Object.keys(ui).filter(
  (name) => typeof (ui as Record<string, unknown>)[name] === "function" && !UI_ONLY.has(name),
);

const componentNames = Object.keys(components).filter(
  (name) => typeof (components as Record<string, unknown>)[name] === "function",
);

describe("jsx ui parity", () => {
  test("every ui.* factory has a JSX component", () => {
    const missing = factoryNames
      .map(toComponentName)
      .filter((name) => !componentNames.includes(name));
    assert.deepEqual(missing, []);
  });

  test("every JSX component maps back to a ui.* factory", () => {
    const factories = new Set(factoryNames.map(toComponentName));
    const orphans = componentNames.filter((name) => !JSX_ONLY.has(name) && !factories.has(name));
    assert.deepEqual(orphans, []);
  });

  test("every JSX component is re-exported from the package index", () => {
    const notReexported = componentNames.filter((name) => !(name in jsxIndex));
    assert.deepEqual(notReexported, []);
  });
});

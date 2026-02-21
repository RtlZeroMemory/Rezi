import { assert, describe, test } from "@rezi-ui/testkit";
import { extendTheme } from "../extend.js";
import type { ThemeOverrides } from "../extend.js";
import { darkTheme, lightTheme } from "../presets.js";
import { color } from "../tokens.js";
import type { ThemeDefinition } from "../tokens.js";

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return JSON.parse(JSON.stringify(theme)) as ThemeDefinition;
}

describe("theme.extend", () => {
  test("single token override updates only that token", () => {
    const next = extendTheme(darkTheme, {
      colors: {
        accent: {
          primary: color(1, 2, 3),
        },
      },
    });

    assert.deepEqual(next.colors.accent.primary, { r: 1, g: 2, b: 3 });
    assert.deepEqual(next.colors.accent.secondary, darkTheme.colors.accent.secondary);
    assert.deepEqual(next.colors.bg.base, darkTheme.colors.bg.base);
  });

  test("empty overrides inherit all tokens", () => {
    const next = extendTheme(darkTheme, {});

    assert.notEqual(next, darkTheme);
    assert.deepEqual(next, darkTheme);
  });

  test("calling without overrides returns a new equivalent theme", () => {
    const next = extendTheme(darkTheme);

    assert.notEqual(next, darkTheme);
    assert.deepEqual(next, darkTheme);
  });

  test("full overrides replace all tokens", () => {
    const next = extendTheme(darkTheme, {
      name: "light-copy",
      colors: lightTheme.colors,
    });

    assert.equal(next.name, "light-copy");
    assert.deepEqual(next.colors, lightTheme.colors);
  });

  test("partial RGB override merges channel-level values", () => {
    const next = extendTheme(darkTheme, {
      colors: {
        accent: {
          primary: {
            r: 200,
          },
        },
      },
    });

    assert.deepEqual(next.colors.accent.primary, {
      r: 200,
      g: darkTheme.colors.accent.primary.g,
      b: darkTheme.colors.accent.primary.b,
    });
  });

  test("invalid overrides are rejected by validation (null colors)", () => {
    assert.throws(
      () =>
        extendTheme(darkTheme, {
          colors: null as unknown as ThemeDefinition["colors"],
        }),
      () => true,
    );
  });

  test("invalid overrides are rejected by validation (non-finite channel)", () => {
    assert.throws(
      () =>
        extendTheme(darkTheme, {
          colors: {
            success: {
              r: Number.NaN,
            },
          },
        }),
      () => true,
    );
  });

  test("base theme is never mutated", () => {
    const before = cloneTheme(darkTheme);

    extendTheme(darkTheme, {
      colors: {
        bg: {
          base: color(12, 34, 56),
        },
      },
    });

    assert.deepEqual(darkTheme, before);
  });

  test("extended theme does not share nested object references with mutable base", () => {
    const mutableBase = cloneTheme(darkTheme);
    const extended = extendTheme(mutableBase, {
      colors: {
        accent: {
          primary: color(1, 2, 3),
        },
      },
    });

    assert.notEqual(extended.colors, mutableBase.colors);
    assert.notEqual(extended.colors.bg, mutableBase.colors.bg);
    assert.notEqual(extended.colors.bg.base, mutableBase.colors.bg.base);
    assert.equal(mutableBase.colors.bg.base.r, darkTheme.colors.bg.base.r);
  });

  test("undefined override branches do not freeze caller-owned base objects", () => {
    const mutableBase = cloneTheme(darkTheme);
    const overrides = {
      colors: {
        accent: undefined,
      },
    } as unknown as ThemeOverrides;

    extendTheme(mutableBase, overrides);

    assert.equal(Object.isFrozen(mutableBase.colors), false);
    assert.equal(Object.isFrozen(mutableBase.colors.accent), false);
    assert.equal(Object.isFrozen(mutableBase.colors.accent.primary), false);
  });

  test("extended theme is deeply frozen", () => {
    const extended = extendTheme(darkTheme, {
      colors: {
        accent: {
          primary: color(1, 2, 3),
        },
      },
    });

    assert.equal(Object.isFrozen(extended), true);
    assert.equal(Object.isFrozen(extended.colors), true);
    assert.equal(Object.isFrozen(extended.colors.accent), true);
    assert.equal(Object.isFrozen(extended.colors.accent.primary), true);
  });

  test("nested extension preserves prior overrides", () => {
    const one = extendTheme(darkTheme, {
      colors: {
        fg: {
          primary: color(11, 22, 33),
        },
      },
    });
    const two = extendTheme(one, {
      colors: {
        border: {
          strong: color(44, 55, 66),
        },
      },
    });

    assert.deepEqual(two.colors.fg.primary, { r: 11, g: 22, b: 33 });
    assert.deepEqual(two.colors.border.strong, { r: 44, g: 55, b: 66 });
    assert.deepEqual(two.colors.accent.secondary, darkTheme.colors.accent.secondary);
  });

  test("nested extension can override the same token again", () => {
    const one = extendTheme(darkTheme, {
      colors: {
        accent: {
          primary: color(10, 20, 30),
        },
      },
    });
    const two = extendTheme(one, {
      colors: {
        accent: {
          primary: {
            r: 99,
          },
        },
      },
    });

    assert.deepEqual(two.colors.accent.primary, { r: 99, g: 20, b: 30 });
  });

  test("nested extensions keep inherited tokens unless overridden", () => {
    const one = extendTheme(darkTheme, {
      name: "custom-1",
    });
    const two = extendTheme(one, {
      colors: {
        info: color(1, 1, 1),
      },
    });

    assert.equal(two.name, "custom-1");
    assert.deepEqual(two.colors.info, { r: 1, g: 1, b: 1 });
    assert.deepEqual(two.colors.warning, darkTheme.colors.warning);
  });

  test("unrelated overrides preserve inherited diagnostic tokens", () => {
    const next = extendTheme(darkTheme, {
      colors: {
        fg: {
          primary: color(20, 30, 40),
        },
      },
    });

    assert.deepEqual(next.colors.diagnostic, darkTheme.colors.diagnostic);
  });

  test("each extension call returns a distinct object", () => {
    const one = extendTheme(darkTheme, {
      colors: {
        warning: color(9, 9, 9),
      },
    });
    const two = extendTheme(one, {
      colors: {
        warning: color(8, 8, 8),
      },
    });

    assert.notEqual(one, darkTheme);
    assert.notEqual(two, one);
    assert.notEqual(two, darkTheme);
  });
});

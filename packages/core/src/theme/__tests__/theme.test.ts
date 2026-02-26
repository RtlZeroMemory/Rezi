import { assert, describe, test } from "@rezi-ui/testkit";
import { rgbB, rgbG, rgbR } from "../../widgets/style.js";
import { createTheme, defaultTheme, resolveColor, resolveSpacing } from "../index.js";

describe("theme", () => {
  test("createTheme merges colors and spacing", () => {
    const t = createTheme({
      colors: { primary: (1 << 16) | (2 << 8) | 3 },
      spacing: [0, 2, 4],
    });

    assert.equal(rgbR(t.colors.primary), 1);
    assert.equal(rgbG(t.colors.primary), 2);
    assert.equal(rgbB(t.colors.primary), 3);
    assert.equal(rgbR(t.colors.fg), rgbR(defaultTheme.colors.fg));
    assert.deepEqual(t.spacing, [0, 2, 4]);
  });

  test("resolveColor returns theme color or fg fallback", () => {
    assert.deepEqual(resolveColor(defaultTheme, "primary"), defaultTheme.colors.primary);
    assert.deepEqual(resolveColor(defaultTheme, "missing"), defaultTheme.colors.fg);
    assert.deepEqual(
      resolveColor(defaultTheme, (9 << 16) | (8 << 8) | 7),
      (9 << 16) | (8 << 8) | 7,
    );
  });

  test("resolveSpacing maps indices and allows raw values", () => {
    const t = createTheme({ spacing: [0, 10, 20] });
    assert.equal(resolveSpacing(t, 0), 0);
    assert.equal(resolveSpacing(t, 1), 10);
    assert.equal(resolveSpacing(t, 2), 20);
    assert.equal(resolveSpacing(t, 5), 5);
  });
});

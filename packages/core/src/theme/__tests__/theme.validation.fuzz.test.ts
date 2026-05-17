import { assert, test } from "@rezi-ui/testkit";
import {
  type FuzzIterationContext,
  chance,
  pick,
  randomAsciiString,
  randomInt,
  runFuzz,
} from "@rezi-ui/testkit";
import { darkTheme } from "../presets.js";
import {
  isValidColorPath,
  resolveColorOrRgb,
  resolveColorToken,
  tryResolveColorToken,
} from "../resolve.js";
import { validateTheme } from "../validate.js";

const COLOR_PATHS = [
  "bg.base",
  "bg.elevated",
  "bg.overlay",
  "bg.subtle",
  "fg.primary",
  "fg.secondary",
  "fg.muted",
  "fg.inverse",
  "accent.primary",
  "accent.secondary",
  "accent.tertiary",
  "success",
  "warning",
  "error",
  "info",
  "focus.ring",
  "focus.bg",
  "selected.bg",
  "selected.fg",
  "disabled.fg",
  "disabled.bg",
  "diagnostic.error",
  "diagnostic.warning",
  "diagnostic.info",
  "diagnostic.hint",
  "border.subtle",
  "border.default",
  "border.strong",
  "widget.syntax.keyword",
  "widget.diff.addBg",
  "widget.logs.error",
  "widget.toast.warning",
  "widget.chart.danger",
] as const;

const MUTABLE_REQUIRED_PATHS = [
  "name",
  "colors.bg.base",
  "colors.fg.primary",
  "colors.accent.primary",
  "colors.success",
  "colors.focus.ring",
  "colors.selected.bg",
  "colors.disabled.fg",
  "colors.diagnostic.error",
  "colors.border.default",
  "widget.syntax.keyword",
  "widget.diff.addBg",
  "widget.logs.error",
  "widget.toast.warning",
  "widget.chart.danger",
  "spacing.xs",
  "spacing.md",
  "spacing.2xl",
  "focusIndicator.bold",
  "focusIndicator.underline",
] as const;

function cloneTheme(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(darkTheme)) as Record<string, unknown>;
}

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      throw new Error(`test fixture path is not an object: ${path}`);
    }
    cursor = next as Record<string, unknown>;
  }
  const key = parts[parts.length - 1];
  if (!key) throw new Error(`invalid path: ${path}`);
  cursor[key] = value;
}

function deletePath(root: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      throw new Error(`test fixture path is not an object: ${path}`);
    }
    cursor = next as Record<string, unknown>;
  }
  const key = parts[parts.length - 1];
  if (key) delete cursor[key];
}

function randomInvalidToken(ctx: FuzzIterationContext): unknown {
  return pick(ctx.rng, [
    -1,
    0x01_000000,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "",
    "255",
    true,
    null,
    {},
    [],
  ]);
}

test("theme validation fuzz: valid token mutations preserve strict theme contract", async () => {
  await runFuzz(
    { label: "theme-valid-token-mutations", seed: 0x7e4a_0001, iterations: 180 },
    (ctx) => {
      const theme = cloneTheme();
      const edits = randomInt(ctx.rng, 1, 12);
      for (let i = 0; i < edits; i++) {
        const path = pick(ctx.rng, MUTABLE_REQUIRED_PATHS);
        if (path === "name") {
          setPath(
            theme,
            path,
            `fuzz-${randomAsciiString(ctx.rng, { minLength: 1, maxLength: 12 })}`,
          );
        } else if (path.startsWith("spacing.")) {
          setPath(theme, path, randomInt(ctx.rng, 0, 12));
        } else if (path.startsWith("focusIndicator.")) {
          setPath(theme, path, chance(ctx.rng, 50));
        } else {
          setPath(theme, path, randomInt(ctx.rng, 0, 0xffffff));
        }
      }

      const validated = validateTheme(theme);

      for (const path of COLOR_PATHS) {
        assert.equal(isValidColorPath(path), true);
        const resolved = resolveColorToken(validated, path);
        assert.equal(typeof resolved, "number");
        assert.ok(resolved >= 0 && resolved <= 0xffffff);
        assert.deepEqual(tryResolveColorToken(validated, path), { ok: true, value: resolved });
        assert.equal(resolveColorOrRgb(validated, path, 0), resolved);
      }
    },
  );
});

test("theme validation fuzz: invalid or missing required tokens fail before use", async () => {
  await runFuzz(
    { label: "theme-invalid-token-rejection", seed: 0x7e4a_0002, iterations: 180 },
    (ctx) => {
      const theme = cloneTheme();
      const path = pick(ctx.rng, MUTABLE_REQUIRED_PATHS);
      if (chance(ctx.rng, 35)) {
        deletePath(theme, path);
      } else if (path === "name") {
        setPath(theme, path, "");
      } else if (path.startsWith("spacing.")) {
        setPath(theme, path, pick(ctx.rng, [-1, 1.5, Number.NaN, "1", null]));
      } else if (path.startsWith("focusIndicator.")) {
        setPath(theme, path, pick(ctx.rng, [0, 1, "true", null, {}]));
      } else {
        setPath(theme, path, randomInvalidToken(ctx));
      }

      assert.throws(
        () => validateTheme(theme),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /^Theme validation failed/u);
          return true;
        },
      );
    },
  );
});

test("theme color resolver fuzz: unknown paths return fallback instead of accidental tokens", async () => {
  await runFuzz(
    { label: "theme-invalid-color-paths", seed: 0x7e4a_0003, iterations: 160 },
    (ctx) => {
      const path = `${randomAsciiString(ctx.rng, {
        minLength: 1,
        maxLength: 10,
        alphabet: "abcdefghijklmnopqrstuvwxyz.",
      })}.${randomInt(ctx.rng, 0, 99)}`;

      if (isValidColorPath(path)) return;

      assert.equal(resolveColorToken(darkTheme, path), null);
      assert.deepEqual(tryResolveColorToken(darkTheme, path), {
        ok: false,
        error: `Invalid color path: ${path}`,
      });
      assert.equal(resolveColorOrRgb(darkTheme, path, 0xabcdef), 0xabcdef);
    },
  );
});

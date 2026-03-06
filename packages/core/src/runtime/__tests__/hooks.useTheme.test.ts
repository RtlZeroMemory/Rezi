import { assert, describe, test } from "@rezi-ui/testkit";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { extendTheme } from "../../theme/extend.js";
import { getColorTokens } from "../../theme/extract.js";
import { mergeThemeOverride } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { compileTheme, type Theme } from "../../theme/theme.js";
import type { ColorTokens } from "../../theme/tokens.js";
import { defineWidget } from "../../widgets/composition.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";
import { type CommitOk, type RuntimeInstance, commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";
import { createCompositeInstanceRegistry } from "../instances.js";

type CompositeCommitOptions = Readonly<{
  colorTokens?: ColorTokens;
  theme?: Theme;
  getColorTokens?: (theme: Theme) => ColorTokens;
}>;

type CompositeHarness<State> = Readonly<{
  commit: (vnode: VNode, appState: State, options?: CompositeCommitOptions) => CommitOk;
}>;

function createCompositeHarness<State>(): CompositeHarness<State> {
  const allocator = createInstanceIdAllocator(1);
  const registry = createCompositeInstanceRegistry();
  let prevRoot: RuntimeInstance | null = null;

  return Object.freeze({
    commit: (vnode: VNode, appState: State, options: CompositeCommitOptions = {}): CommitOk => {
      const res = commitVNodeTree(prevRoot, vnode, {
        allocator,
        composite: {
          registry,
          appState,
          colorTokens: options.colorTokens ?? defaultTheme.definition.colors,
          ...(options.theme ? { theme: options.theme } : {}),
          ...(options.getColorTokens ? { getColorTokens: options.getColorTokens } : {}),
          viewport: { width: 80, height: 24, breakpoint: "md" },
          onInvalidate: () => {},
        },
      });

      if (!res.ok) {
        throw new Error(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
      }

      prevRoot = res.value.root;
      return res.value;
    },
  });
}

describe("runtime hooks - useTheme", () => {
  test("provides composite color tokens from commit context", () => {
    const tokens = getColorTokens(compileTheme(darkTheme));
    let seenTokens: ColorTokens | undefined;

    const Widget = defineWidget<{ key?: string }, Record<string, never>>((_props, ctx) => {
      seenTokens = ctx.useTheme();
      return ui.text("ok");
    });

    const h = createCompositeHarness<Record<string, never>>();
    h.commit(Widget({}), Object.freeze({}), { colorTokens: tokens });

    assert.equal(seenTokens, tokens);
  });

  test("falls back to default theme tokens when composite context does not provide one", () => {
    let seenTokens: ColorTokens | undefined;

    const Widget = defineWidget<{ key?: string }, Record<string, never>>((_props, ctx) => {
      seenTokens = ctx.useTheme();
      return ui.text("ok");
    });

    const h = createCompositeHarness<Record<string, never>>();
    h.commit(Widget({}), Object.freeze({}));

    assert.deepEqual(seenTokens, defaultTheme.definition.colors);
  });

  test("reads latest tokens on rerender", () => {
    const firstTokens = getColorTokens(compileTheme(darkTheme));
    const secondTokens = getColorTokens(
      compileTheme(
        extendTheme(darkTheme, {
          colors: {
            accent: {
              primary: (250 << 16) | (20 << 8) | 20,
            },
          },
        }),
      ),
    );

    const seen: ColorTokens[] = [];

    const Widget = defineWidget<{ key?: string }, Readonly<{ count: number }>>((_props, ctx) => {
      ctx.useAppState((state) => state.count);
      seen.push(ctx.useTheme());
      return ui.text("ok");
    });

    const h = createCompositeHarness<Readonly<{ count: number }>>();
    h.commit(Widget({}), Object.freeze({ count: 1 }), { colorTokens: firstTokens });
    h.commit(Widget({}), Object.freeze({ count: 2 }), { colorTokens: secondTokens });

    assert.equal(seen.length, 2);
    assert.equal(seen[0], firstTokens);
    assert.equal(seen[1], secondTokens);
  });

  test("resolves scoped themed overrides for composites", () => {
    const baseTheme = compileTheme(darkTheme);
    const override = Object.freeze({
      colors: { accent: { primary: (18 << 16) | (164 << 8) | 245 } },
      focusIndicator: { bold: false },
    });
    const scopedTheme = mergeThemeOverride(baseTheme, override);
    let seenTokens: ColorTokens | undefined;

    const Widget = defineWidget<{ key?: string }, Record<string, never>>((_props, ctx) => {
      seenTokens = ctx.useTheme();
      return ui.text("ok");
    });

    const h = createCompositeHarness<Record<string, never>>();
    h.commit(ui.themed(override, [Widget({})]), Object.freeze({}), {
      colorTokens: getColorTokens(baseTheme),
      theme: baseTheme,
      getColorTokens,
    });

    assert.deepEqual(seenTokens, scopedTheme.definition.colors);
  });
});

/**
 * Widget Gallery — "TUI Storybook"
 *
 * Renders every widget in every state and variant across themes.
 *
 * Interactive mode:
 *   npx tsx examples/gallery/src/index.ts
 *
 * Headless mode (for CI snapshot capture):
 *   npx tsx examples/gallery/src/index.ts --headless
 *   npx tsx examples/gallery/src/index.ts --headless --scene button-matrix
 */

import {
  type ThemeDefinition,
  type VNode,
  createApp,
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
  ui,
} from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import { type Scene, getScene, scenes } from "./scenes.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ThemeName = "dark" | "light" | "nord" | "dracula" | "dimmed" | "high-contrast";

const THEMES: Record<ThemeName, ThemeDefinition> = {
  dark: darkTheme,
  light: lightTheme,
  nord: nordTheme,
  dracula: draculaTheme,
  dimmed: dimmedTheme,
  "high-contrast": highContrastTheme,
};

const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

type State = {
  activeScene: number;
  themeName: ThemeName;
};

const MAX_VISIBLE_SCENE_TABS = 6;

// ---------------------------------------------------------------------------
// Headless mode
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isHeadless = args.includes("--headless");
const sceneArg = args.find((_, i) => args[i - 1] === "--scene");

if (isHeadless) {
  // Headless: render scene(s) and exit
  const { createTestRenderer, coerceToLegacyTheme } = await import("@rezi-ui/core");

  const scenesToRender = sceneArg ? [getScene(sceneArg)].filter(Boolean) : scenes;

  if (scenesToRender.length === 0) {
    console.error(`Scene not found: ${sceneArg}`);
    console.error(`Available scenes: ${scenes.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  for (const scene of scenesToRender) {
    if (!scene) continue;
    console.log(`\n=== ${scene.title} (${scene.name}) ===\n`);

    for (const themeName of THEME_NAMES) {
      const theme = coerceToLegacyTheme(THEMES[themeName]);
      const renderer = createTestRenderer({ viewport: { cols: 80, rows: 40 }, theme });
      const result = renderer.render(scene.render());
      console.log(`--- Theme: ${themeName} ---`);
      console.log(result.toText());
      console.log();
    }
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Interactive mode
// ---------------------------------------------------------------------------

const app = createApp<State>({
  // Inline mode avoids worker/native crash during live theme switches in demo flow.
  backend: createNodeBackend({ executionMode: "inline" }),
  theme: THEMES.dark,
  initialState: {
    activeScene: 0,
    themeName: "dark",
  },
});

function resolveSceneTabWindow(
  activeScene: number,
  total: number,
): Readonly<{ start: number; end: number }> {
  if (total <= MAX_VISIBLE_SCENE_TABS) return { start: 0, end: total };
  const half = Math.floor(MAX_VISIBLE_SCENE_TABS / 2);
  let start = Math.max(0, activeScene - half);
  let end = start + MAX_VISIBLE_SCENE_TABS;
  if (end > total) {
    end = total;
    start = Math.max(0, end - MAX_VISIBLE_SCENE_TABS);
  }
  return { start, end };
}

function galleryView(state: State): VNode {
  const scene = scenes[state.activeScene];
  if (!scene) return ui.text("No scene selected");

  const sceneContent = scene.render();
  const tabWindow = resolveSceneTabWindow(state.activeScene, scenes.length);
  const visibleScenes = scenes.slice(tabWindow.start, tabWindow.end);

  return ui.column({ p: 0, gap: 0 }, [
    // Header bar
    ui.row({ gap: 2, p: 1 }, [
      ui.text("Widget Gallery", { style: { bold: true } }),
      ui.text(`Theme: ${state.themeName}`, { style: { dim: true } }),
      ui.text(`Scene: ${scene.title}`, { style: { dim: true } }),
    ]),
    ui.divider(),

    // Scene selector
    ui.row({ gap: 1, px: 1 }, [
      ...(tabWindow.start > 0 ? [ui.text("...", { style: { dim: true } })] : []),
      ...visibleScenes.map((s, offset) => {
        const i = tabWindow.start + offset;
        return ui.button({
          id: `scene-${s.name}`,
          label: s.navLabel,
          dsVariant: i === state.activeScene ? "solid" : "ghost",
          dsSize: "sm",
          key: s.name,
          onPress: () => app.update((st) => ({ ...st, activeScene: i })),
        });
      }),
      ...(tabWindow.end < scenes.length ? [ui.text("...", { style: { dim: true } })] : []),
    ]),
    ui.divider(),

    // Scene content
    sceneContent,

    // Footer
    ui.divider(),
    ui.row({ gap: 2, px: 1 }, [
      ui.kbd("←/→"),
      ui.text("Switch scene", { style: { dim: true } }),
      ui.kbd("t"),
      ui.text("Cycle theme", { style: { dim: true } }),
      ui.kbd("q"),
      ui.text("Quit", { style: { dim: true } }),
    ]),
  ]);
}

app.view(galleryView);

app.keys({
  right: () =>
    app.update((s) => ({
      ...s,
      activeScene: (s.activeScene + 1) % scenes.length,
    })),
  left: () =>
    app.update((s) => ({
      ...s,
      activeScene: (s.activeScene - 1 + scenes.length) % scenes.length,
    })),
  t: (ctx) => {
    const i = THEME_NAMES.indexOf(ctx.state.themeName);
    const nextIndex = (i + 1 + THEME_NAMES.length) % THEME_NAMES.length;
    const next = THEME_NAMES[nextIndex];
    if (!next) return;
    app.setTheme(THEMES[next]);
    ctx.update({ ...ctx.state, themeName: next });
  },
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
});

await app.start();

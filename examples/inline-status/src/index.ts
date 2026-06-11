/**
 * Inline screen mode example.
 *
 * The app renders a 9-row region on the primary screen instead of the
 * alternate screen: terminal scrollback stays visible above the region while
 * the app runs, and the final frame remains in scrollback after exit with
 * the shell prompt restored below it.
 *
 * Run: npx tsx examples/inline-status/src/index.ts
 */
import { defineWidget, ui, useInterval } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const SPINNER = ["|", "/", "-", "\\"] as const;
const TICK_MS = 80;

const app = createNodeApp<Record<string, never>>({
  initialState: {},
  config: {
    screen: { mode: "inline", inlineRows: 9 },
  },
});

const SyncPanel = defineWidget((_props: Record<string, never>, ctx) => {
  const [tick, setTick] = ctx.useState(0);
  const [percent, setPercent] = ctx.useState(0);

  useInterval(
    ctx,
    () => {
      setTick((value) => value + 1);
      setPercent((value) => Math.min(100, value + 1));
    },
    TICK_MS,
  );

  const done = percent >= 100;
  const spinner = done ? "*" : SPINNER[tick % SPINNER.length];
  return ui.panel("Sync", [
    ui.row({ gap: 1 }, [
      ui.text(`${spinner} ${done ? "All chunks synced" : "Syncing chunks..."}`),
      ui.spacer({ flex: 1 }),
      ui.text(`${String(percent)}%`, { variant: "label" }),
    ]),
    ui.progress(percent / 100),
    ui.text("scrollback stays above - press q to quit (frame stays visible)", {
      variant: "caption",
    }),
  ]);
});

app.view(() => SyncPanel({}));

app.keys({
  q: () => void app.stop(),
  escape: () => void app.stop(),
  "ctrl+c": () => void app.stop(),
});

await app.run();
process.exit(0);

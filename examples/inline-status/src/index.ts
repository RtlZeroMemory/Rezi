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

let lastCheckpoint = 0;

function maybePrintCheckpoint(percent: number): void {
  if (percent === 0 || percent % 25 !== 0 || percent === lastCheckpoint) return;
  lastCheckpoint = percent;
  /* Committed lines scroll into terminal history above the live region. */
  void app
    .printAbove(ui.text(`[sync] checkpoint reached: ${String(percent)}%`, { variant: "caption" }))
    .catch((err: unknown) => {
      process.stderr.write(`printAbove failed: ${String(err)}\n`);
    });
}

const SyncPanel = defineWidget((_props: Record<string, never>, ctx) => {
  const [tick, setTick] = ctx.useState(0);
  const [percent, setPercent] = ctx.useState(0);
  const percentRef = ctx.useRef(0);
  percentRef.current = percent;

  useInterval(
    ctx,
    () => {
      setTick((value) => value + 1);
      setPercent((value) => Math.min(100, value + 1));
      setTimeout(() => {
        maybePrintCheckpoint(percentRef.current);
      }, 0);
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
    ui.text("q quits - +/- resize region - checkpoints print above", {
      variant: "caption",
    }),
  ]);
});

app.view(() => SyncPanel({}));

let inlineRows = 9;

app.keys({
  q: () => void app.stop(),
  escape: () => void app.stop(),
  "ctrl+c": () => void app.stop(),
  /* Grow/shrink the live region at runtime; layout follows the resize. */
  "shift+=": () => {
    const nextRows = Math.min(16, inlineRows + 1);
    void app.setInlineRows(nextRows).then(
      () => {
        inlineRows = nextRows;
      },
      () => {},
    );
  },
  "-": () => {
    const nextRows = Math.max(5, inlineRows - 1);
    void app.setInlineRows(nextRows).then(
      () => {
        inlineRows = nextRows;
      },
      () => {},
    );
  },
});

await app.run();
process.exit(0);

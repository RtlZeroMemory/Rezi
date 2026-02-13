import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = { step: number };

const app = createNodeApp<State>({
  initialState: { step: 0 },
  config: { executionMode: "inline", fpsCap: 30 },
});

app.view((state) =>
  ui.column({ p: 1, gap: 1 }, [
    ui.text("E2E Terminal Render"),
    ui.text(`Step: ${state.step}`),
    ui.text("Rezi UI"),
  ]),
);

const shutdown = async (code: number): Promise<void> => {
  try {
    await app.stop();
  } catch {
    // ignore shutdown errors to avoid hanging the runner
  }
  try {
    app.dispose();
  } catch {
    // ignore
  }
  process.exit(code);
};

process.on("uncaughtException", (err) => {
  console.error(err);
  void shutdown(1);
});

process.on("unhandledRejection", (err) => {
  console.error(err);
  void shutdown(1);
});

await app.start();

setTimeout(() => {
  app.update((s) => ({ step: s.step + 1 }));
}, 50);

setTimeout(() => {
  void shutdown(0);
}, 200);

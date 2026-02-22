import { createApp, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type State = { count: number };

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: { count: 0 },
});

app.view((state) =>
  ui.page({
    p: 1,
    gap: 1,
    header: ui.header({
      title: "Hello Counter",
      subtitle: "Beautiful defaults",
    }),
    body: ui.panel("Counter", [
      ui.row({ gap: 1, items: "center" }, [
        ui.text(`Count: ${state.count}`, { variant: "heading" }),
        ui.spacer({ flex: 1 }),
        ui.button({
          id: "dec",
          label: "-1",
          intent: "secondary",
          onPress: () => app.update((s) => ({ ...s, count: s.count - 1 })),
        }),
        ui.button({
          id: "inc",
          label: "+1",
          intent: "primary",
          onPress: () => app.update((s) => ({ ...s, count: s.count + 1 })),
        }),
      ]),
    ]),
  }),
);

await app.start();

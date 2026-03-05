import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = Readonly<{
  selected: number;
  activations: number;
  useUnicodeLabels: boolean;
}>;

const ITEMS = Object.freeze(["Alpha", "Beta", "Gamma", "Delta"]);

function wrapIndex(index: number): number {
  const count = ITEMS.length;
  const mod = index % count;
  return mod >= 0 ? mod : mod + count;
}

function navKbdLabel(useUnicodeLabels: boolean): string {
  return useUnicodeLabels ? "↑↓" : "Up/Dn";
}

function enterKbdLabel(useUnicodeLabels: boolean): string {
  return useUnicodeLabels ? "⏎" : "Enter";
}

const app = createNodeApp<State>({
  initialState: {
    selected: 0,
    activations: 0,
    useUnicodeLabels: true,
  },
  config: {
    executionMode: "inline",
    fpsCap: 30,
  },
});

app.view((state) => {
  const activeItem = ITEMS[state.selected] ?? ITEMS[0] ?? "n/a";
  return ui.page({
    p: 1,
    gap: 1,
    header: ui.header({
      title: "Issue #243 Unicode kbd() Demo",
      subtitle: "Use arrow keys + Enter. Press U to toggle Unicode/ASCII labels.",
    }),
    body: ui.panel("Live State", [
      ui.text(`Selected: ${activeItem}`, { variant: "heading" }),
      ui.text(`Activations: ${String(state.activations)}`),
      ui.divider(),
      ...ITEMS.map((item, index) =>
        ui.row(
          {
            key: item,
            gap: 1,
          },
          [
            ui.text(index === state.selected ? "▶" : " ", {
              dim: index !== state.selected,
            }),
            ui.text(item, index === state.selected ? { bold: true } : {}),
          ],
        ),
      ),
    ]),
    footer: ui.statusBar({
      left: [
        ui.kbd(navKbdLabel(state.useUnicodeLabels)),
        ui.text(" move"),
        ui.kbd(enterKbdLabel(state.useUnicodeLabels)),
        ui.text(" activate"),
        ui.kbd("U"),
        ui.text(" toggle labels"),
        ui.kbd("Q"),
        ui.text(" quit"),
      ],
      right: [
        ui.text(state.useUnicodeLabels ? "Unicode labels ON" : "Unicode labels OFF", {
          variant: "caption",
        }),
      ],
    }),
  });
});

app.keys({
  up: () =>
    app.update((state) => ({
      ...state,
      selected: wrapIndex(state.selected - 1),
    })),
  down: () =>
    app.update((state) => ({
      ...state,
      selected: wrapIndex(state.selected + 1),
    })),
  enter: () =>
    app.update((state) => ({
      ...state,
      activations: state.activations + 1,
    })),
  u: () =>
    app.update((state) => ({
      ...state,
      useUnicodeLabels: !state.useUnicodeLabels,
    })),
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
});

await app.run();

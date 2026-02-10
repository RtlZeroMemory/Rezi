import { type RichTextSpan, createApp, rgb, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import { brandColors, reziHeroLogo, span } from "./brand.js";

const bg = brandColors.bg;
const panel = brandColors.panel;
const panelAlt = brandColors.panelAlt;
const panelRaised = brandColors.panelRaised;
const border = brandColors.border;
const borderBright = brandColors.borderBright;
const accent = brandColors.accent;
const accentWarm = brandColors.accentWarm;
const success = brandColors.success;
const warning = brandColors.warning;
const fg = brandColors.fg;
const fgMuted = brandColors.fgMuted;
const fgDim = brandColors.fgDim;
const chipInk = rgb(7, 12, 28);

const tPlain = rgb(213, 224, 248);
const tKw = rgb(255, 118, 180);
const tFn = rgb(112, 217, 255);
const tType = rgb(255, 202, 118);
const tStr = rgb(147, 240, 170);
const tNum = rgb(255, 188, 122);
const tSym = rgb(170, 187, 223);
const tComment = rgb(122, 144, 192);
const tLineNo = rgb(88, 108, 158);

const s = span;
const captureWidth = 170;
const plain = (t: string) => s(t, { fg: tPlain });
const kw = (t: string) => s(t, { fg: tKw, bold: true });
const fn = (t: string) => s(t, { fg: tFn });
const ty = (t: string) => s(t, { fg: tType, bold: true });
const str = (t: string) => s(t, { fg: tStr });
const num = (t: string) => s(t, { fg: tNum });
const sym = (t: string) => s(t, { fg: tSym });
const cmt = (t: string) => s(t, { fg: tComment, italic: true });

const typescriptCode: readonly (readonly RichTextSpan[])[] = [
  [cmt("// Typed core API")],
  [
    kw("import"),
    plain(" { "),
    fn("createApp"),
    plain(", "),
    fn("ui"),
    plain(" } "),
    kw("from"),
    plain(" "),
    str('"@rezi-ui/core"'),
  ],
  [
    kw("import"),
    plain(" { "),
    fn("createNodeBackend"),
    plain(" } "),
    kw("from"),
    plain(" "),
    str('"@rezi-ui/node"'),
  ],
  [plain("")],
  [kw("const"), plain(" app = "), fn("createApp"), sym("({")],
  [plain("  backend"), sym(":"), plain(" "), fn("createNodeBackend"), sym("(),")],
  [
    plain("  initialState"),
    sym(":"),
    plain(" { count"),
    sym(":"),
    plain(" "),
    num("0"),
    plain(" },"),
  ],
  [sym("});")],
  [plain("")],
  [plain("app."), fn("view"), sym("("), plain("state "), sym("=>")],
  [plain("  ui."), fn("column"), sym("({ p: "), num("1"), sym(", gap: "), num("1"), sym(" }, [")],
  [plain("    ui."), fn("text"), sym("("), str("`Count: ${state.count}`"), sym("),")],
  [
    plain("    ui."),
    fn("button"),
    sym("("),
    str('"inc"'),
    sym(", "),
    str('"+1"'),
    sym(", { onPress: () => app.update(s => ({ ...s, count: s.count + "),
    num("1"),
    sym(" })) })"),
  ],
  [plain("  ])"), sym(",")],
  [sym(");")],
];

const jsxCode: readonly (readonly RichTextSpan[])[] = [
  [cmt("// JSX runtime")],
  [
    kw("import"),
    plain(" { "),
    ty("Column"),
    plain(", "),
    ty("Text"),
    plain(", "),
    ty("Button"),
    plain(" } "),
    kw("from"),
    plain(" "),
    str('"@rezi-ui/jsx"'),
  ],
  [
    kw("import"),
    plain(" { "),
    fn("useState"),
    plain(" } "),
    kw("from"),
    plain(" "),
    str('"react"'),
  ],
  [plain("")],
  [kw("function"), plain(" "), fn("Counter"), sym("()"), plain(" {")],
  [
    plain("  "),
    kw("const"),
    plain(" [count, setCount] = "),
    fn("useState"),
    sym("("),
    num("0"),
    sym(");"),
  ],
  [plain("  "), kw("return"), plain(" (")],
  [
    plain("    "),
    sym("<"),
    ty("Column"),
    plain(" p"),
    sym("={"),
    num("1"),
    sym("}"),
    plain(" gap"),
    sym("={"),
    num("1"),
    sym("}>"),
  ],
  [
    plain("      "),
    sym("<"),
    ty("Text"),
    sym(">"),
    plain("Count: {count}"),
    sym("</"),
    ty("Text"),
    sym(">"),
  ],
  [
    plain("      "),
    sym("<"),
    ty("Button"),
    plain(" id="),
    str('"inc"'),
    plain(" label="),
    str('"+1"'),
  ],
  [
    plain("        onPress"),
    sym("={() => "),
    fn("setCount"),
    sym("(c => c + "),
    num("1"),
    sym(")}"),
    plain(" />"),
  ],
  [plain("    "), sym("</"), ty("Column"), sym(">")],
  [plain("  "), sym(")")],
  [sym("}")],
];

function codePanel(
  title: string,
  explanation: string,
  badges: [string, string],
  lines: readonly (readonly RichTextSpan[])[],
  borderColor: ReturnType<typeof rgb>,
  highlighted: boolean,
) {
  return ui.box(
    {
      flex: 1,
      border: "rounded",
      px: 1,
      py: 0,
      style: { bg: highlighted ? panelRaised : panelAlt, fg: borderColor },
      shadow: highlighted ? { density: "light" } : false,
    },
    [
      ui.richText([
        s("● ", { fg: rgb(255, 98, 127) }),
        s("● ", { fg: rgb(255, 199, 99) }),
        s("● ", { fg: rgb(116, 237, 157) }),
        s(` ${title}`, { fg: highlighted ? borderBright : fgMuted, bold: true }),
      ]),
      ui.text(explanation, { style: { fg: fgMuted } }),
      ui.row({ gap: 1 }, [
        ui.badge(badges[0], { variant: "info" }),
        ui.badge(badges[1], { variant: "default" }),
      ]),
      ui.divider({ char: "─" }),
      ui.column(
        { gap: 0 },
        lines.map((line, i) =>
          ui.row({ gap: 1 }, [
            ui.text(String(i + 1).padStart(2, "0"), { style: { fg: tLineNo } }),
            ui.richText([...line]),
          ]),
        ),
      ),
    ],
  );
}

function chip(label: string, tone: ReturnType<typeof rgb>) {
  return ui.richText([
    s(` ${label} `, {
      fg: chipInk,
      bg: tone,
      bold: true,
    }),
  ]);
}

type State = { revision: number; wipe: boolean };

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: { revision: 0, wipe: false },
});

const logoLines = reziHeroLogo(4);

app.view(({ revision, wipe }) => {
  if (wipe) return ui.box({ flex: 1, key: `wipe-${revision}`, style: { bg } }, []);
  return ui.box({ flex: 1, style: { bg } }, [
    ui.row({ flex: 1, justify: "center" }, [
      ui.column({ key: `shot-${revision}`, width: captureWidth, gap: 0, items: "stretch" }, [
        ui.box(
          {
            border: "rounded",
            mt: 1,
            px: 1,
            py: 0,
            style: { bg: panel, fg: borderBright },
          },
          [
            ui.column({ gap: 0, items: "stretch" }, [
              ...logoLines.map((line) =>
                ui.row({ justify: "center", width: "100%" }, [ui.richText(line)]),
              ),
              ui.row({ justify: "center", width: "100%" }, [
                ui.richText([
                  s("Two API styles: Custom TypeScript and JSX (React)", {
                    fg: fg,
                  }),
                ]),
              ]),
              ui.row({ justify: "center", width: "100%" }, [
                ui.row({ gap: 1, items: "center" }, [
                  chip("Custom TypeScript", rgb(76, 204, 255)),
                  chip("JSX (React)", rgb(116, 176, 255)),
                ]),
              ]),
            ]),
          ],
        ),

        ui.row({ gap: 1, mt: 1, mb: 1, items: "stretch" }, [
          codePanel(
            "Custom TypeScript",
            "Typed API with direct state updates",
            ["Custom API", "Type-safe"],
            typescriptCode,
            borderBright,
            true,
          ),
          codePanel(
            "JSX (React)",
            "React-style JSX with hooks state",
            ["JSX", "React hooks"],
            jsxCode,
            border,
            false,
          ),
        ]),

        ui.box(
          {
            border: "rounded",
            mb: 1,
            px: 1,
            py: 0,
            style: { bg: panel, fg: border },
          },
          [
            ui.row({ justify: "between", items: "center", gap: 2 }, [
              ui.richText([
                s("$ npm i ", { fg: fgDim }),
                s("@rezi-ui/core @rezi-ui/node @rezi-ui/jsx", { fg: accent, bold: true }),
              ]),
              ui.richText([
                s("Custom TypeScript", { fg: success }),
                s("  •  ", { fg: fgDim }),
                s("JSX (React)", { fg: accentWarm }),
              ]),
            ]),
          ],
        ),
      ]),
    ]),
  ]);
});

app.keys({
  q: () => app.stop(),
  "ctrl+c": () => app.stop(),
});

app.onEvent((ev) => {
  if (ev.kind !== "engine") return;
  if (ev.event.kind === "resize") {
    app.update((st) => ({ revision: st.revision + 1, wipe: true }));
    queueMicrotask(() => app.update((st) => ({ revision: st.revision + 1, wipe: false })));
  }
  if (ev.event.kind === "text" && (ev.event.codepoint === 113 || ev.event.codepoint === 81)) {
    void app.stop();
  }
});

await app.start();

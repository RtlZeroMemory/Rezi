# HSR Manual Demo Harness

This folder contains deterministic manual demos for Hot State-Preserving Reload.

## Demos

- `widget-app.mjs` + `widget-view.mjs`: widget-mode HSR (`app.replaceView`)
- `router-app.mjs` + `router-routes.mjs`: route-mode HSR (`app.replaceRoutes`)

## Run Manually

```bash
npm run build
npm run hsr:demo:widget
npm run hsr:demo:router
```

Then edit and save:

- widget demo: `scripts/hsr/widget-view.mjs`
- router demo: `scripts/hsr/router-routes.mjs`

State, focus, and input values should survive each save.
Quit with `F10` / `Alt+Q` / `Ctrl+C` / `Ctrl+X` (or `q` when focus is outside editor fields).

### Widget self-edit mode

The widget demo includes an in-app code editor panel:

- `self-edit-code` is focused by default at startup
- edit the TypeScript snippet (`SELF_EDIT_BANNER = "..."`)
- save with `Enter` on the save button (or `F6` / `Ctrl+O` / `Ctrl+S`)
- press `Esc` (or `F8` / `Ctrl+G`) to jump focus out of the code editor
- the app rewrites `scripts/hsr/widget-view.mjs` and HSR swaps the view in-process
- save/reload results are shown in a modal overlay so the base layout remains clean for GIF capture
- the header title is rendered from `widget-view.mjs` `SELF_EDIT_BANNER` so changes are visibly tied to live module swaps
- the demo auto-selects `tiny` / `compact` / `full` layouts by terminal size
- the code editor itself renders Dracula-style syntax highlighting in-place (no mirror panel)
- focused cursor cell is highlighted so caret position stays visible even when terminal cursor rendering is subtle

Notes:

- some terminals swallow `Ctrl+S` due XON/XOFF flow control, so `F6` / `Ctrl+O` is the reliable path
- some terminals also reserve `Ctrl+Q`; use `F10` / `Alt+Q` / `Ctrl+C` for deterministic quit behavior

## Record GIF

```bash
npm run hsr:record:widget
npm run hsr:record:router
```

`hsr:record:*` runs in manual mode by default so you can type/edit freely while recording.

Scripted auto-scenes (deterministic showcase capture):

```bash
npm run hsr:record:widget:auto
npm run hsr:record:router:auto
```

Auto mode:

- starts the app under `asciinema rec`
- applies three timed HSR source edits automatically
- records each hot-swap scene
- exits and restores edited source files

Custom scripted banner text:

```bash
node scripts/record-hsr-gif.mjs --mode widget --scripted --scene-text "My custom headline"
```

Override output paths/sizes:

```bash
node scripts/record-hsr-gif.mjs --mode router --out out/router-hsr.gif --cols 120 --rows 36
```

Explicit manual mode (same behavior as default):

```bash
node scripts/record-hsr-gif.mjs --mode widget --manual
```

If a GIF converter is unavailable, the script still writes an `.cast` recording.

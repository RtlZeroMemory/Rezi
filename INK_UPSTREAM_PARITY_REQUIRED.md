# Upstream Ink Parity — Required Spec (Pinned Baseline)

This document defines **complete parity requirements** for implementing the upstream Ink public API in Rezi’s Ink compatibility layer (**`@rezi-ui/ink-compat`**), based on a pinned upstream commit. It is **documentation + mapping only**; it does **not** implement fixes.

---

## Baseline Policy (Non‑Negotiable)

- **Canonical baseline:** upstream `vadimdemedes/ink` at a pinned commit SHA.
- **Implementation wins over docs** when they differ (for this pinned SHA).

### Baseline Pin

- **Upstream repo:** `https://github.com/vadimdemedes/ink`
- **Chosen release tag:** `v6.7.0`
- **Resolved commit SHA:** `135cb23ae3b7ca94918b1cd913682f6356f12c5c`
- **How it was obtained:** `git ls-remote` dereferencing the annotated tag ref. (Upstream evidence: `src/index.ts:1` shows the public export surface at this commit.)

### Exact fetch commands used

```sh
git ls-remote --tags https://github.com/vadimdemedes/ink.git "refs/tags/v6.7.0^{}"
git clone --depth 1 --branch v6.7.0 https://github.com/vadimdemedes/ink.git <INK_DIR>
cd <INK_DIR>
git rev-parse HEAD
```

---

## Target: Rezi Ink Compatibility Layer

- **Module:** `@rezi-ui/ink-compat`
- **Public entrypoint:** `packages/ink-compat/src/index.ts:1` (Rezi evidence: `packages/ink-compat/package.json:1` exports `dist/index.js` built from this source.)

---

## A) Full Upstream Ink Inventory (Exports)

Upstream exports are defined in `src/index.ts:1` (upstream evidence: `src/index.ts:1`).

### Export Inventory Table

Each row below includes the upstream definition reference and the corresponding Rezi symbol mapping (if present).

| Export | Kind | Upstream definition | Rezi mapping (today) | Status |
|---|---|---|---|---|
| `RenderOptions` | type | `src/render.ts:8` | `packages/ink-compat/src/types.ts:157` | Partial |
| `Instance` | type | `src/render.ts:103` | `packages/ink-compat/src/types.ts:177` | Partial |
| `render` | function | `src/render.ts:130` + `src/ink.tsx:70` | `packages/ink-compat/src/render.ts:43` | Partial |
| `BoxProps` | type | `src/components/Box.tsx:8` | `packages/ink-compat/src/types.ts:39` | Partial |
| `Box` | component | `src/components/Box.tsx:61` | `packages/ink-compat/src/components/Box.tsx:10` | Partial |
| `TextProps` | type | `src/components/Text.tsx:9` | `packages/ink-compat/src/types.ts:140` | Partial |
| `Text` | component | `src/components/Text.tsx:71` | `packages/ink-compat/src/components/Text.tsx:9` | Partial |
| `AppProps` | type | `src/components/AppContext.ts:3` | `packages/ink-compat/src/types.ts:188` | Partial |
| `StdinProps` | type | `src/components/StdinContext.ts:5` | `packages/ink-compat/src/types.ts:195` | Partial |
| `StdoutProps` | type | `src/components/StdoutContext.ts:4` | `packages/ink-compat/src/types.ts:202` | Implemented (type only) |
| `StderrProps` | type | `src/components/StderrContext.ts:4` | `packages/ink-compat/src/types.ts:208` | Implemented (type only) |
| `StaticProps` | type | `src/components/Static.tsx:4` | `packages/ink-compat/src/types.ts:214` | Partial |
| `Static` | component | `src/components/Static.tsx:28` | `packages/ink-compat/src/components/Static.tsx:30` | Partial |
| `TransformProps` | type | `src/components/Transform.tsx:4` | `packages/ink-compat/src/types.ts:221` | Missing |
| `Transform` | component | `src/components/Transform.tsx:21` | `packages/ink-compat/src/components/Transform.tsx:18` | Partial |
| `NewlineProps` | type | `src/components/Newline.tsx:3` | `packages/ink-compat/src/types.ts:227` | Implemented |
| `Newline` | component | `src/components/Newline.tsx:15` | `packages/ink-compat/src/components/Newline.tsx:17` | Implemented |
| `Spacer` | component | `src/components/Spacer.tsx:9` | `packages/ink-compat/src/components/Spacer.tsx:9` | Partial (needs parity verification) |
| `Key` | type | `src/hooks/use-input.ts:9` | `packages/ink-compat/src/types.ts:10` | Missing |
| `useInput` | hook | `src/hooks/use-input.ts:158` | `packages/ink-compat/src/hooks/useInput.ts:124` | Partial |
| `useApp` | hook | `src/hooks/use-app.ts:7` | `packages/ink-compat/src/hooks/useApp.ts:5` | Partial |
| `useStdin` | hook | `src/hooks/use-stdin.ts:7` | `packages/ink-compat/src/hooks/useStdin.ts:8` | Partial |
| `useStdout` | hook | `src/hooks/use-stdout.ts:7` | `packages/ink-compat/src/hooks/useStdout.ts:8` | Partial |
| `useStderr` | hook | `src/hooks/use-stderr.ts:7` | `packages/ink-compat/src/hooks/useStderr.ts:8` | Partial |
| `useFocus` | hook | `src/hooks/use-focus.ts:32` | `packages/ink-compat/src/hooks/useFocus.ts:33` | Partial |
| `useFocusManager` | hook | `src/hooks/use-focus-manager.ts:34` | `packages/ink-compat/src/hooks/useFocusManager.ts:7` | Implemented |
| `useIsScreenReaderEnabled` | hook | `src/hooks/use-is-screen-reader-enabled.ts:7` | `packages/ink-compat/src/hooks/useIsScreenReaderEnabled.ts:4` | Implemented |
| `useCursor` | hook | `src/hooks/use-cursor.ts:12` | — (not exported) | Missing |
| `CursorPosition` | type | `src/cursor-helpers.ts:3` | — (not exported) | Missing |
| `measureElement` | function | `src/measure-element.ts:18` | `packages/ink-compat/src/measureElement.ts:23` | Implemented |
| `DOMElement` | type | `src/dom.ts:25` | `packages/ink-compat/src/types.ts:240` | Partial |
| `kittyFlags` | const | `src/kitty-keyboard.ts:3` | — (not exported) | Missing |
| `kittyModifiers` | const | `src/kitty-keyboard.ts:28` | — (not exported) | Missing |
| `KittyKeyboardOptions` | type | `src/kitty-keyboard.ts:40` | — (not exported) | Missing |
| `KittyFlagName` | type | `src/kitty-keyboard.ts:11` | — (not exported) | Missing |

Notes:
- Rezi currently exports additional symbols **not present in upstream Ink** (e.g., `ResizeObserver`, styled-text helpers). These are out-of-scope for parity except insofar as they must not change Ink baseline behavior.

---

## B) Behavior Contracts (Normative) + Acceptance Criteria + Test Design

The normative contracts are enumerated in the machine-readable matrix:

- `INK_UPSTREAM_PARITY_MATRIX.json:1`

Every contract includes:
- upstream evidence (file + line numbers at the pinned SHA)
- acceptance criteria (testable)
- explicit edge cases
- Rezi mapping evidence + status + gaps

---

## C) Rezi Mapping (What Exists Today)

Rezi mapping is embedded per contract in `INK_UPSTREAM_PARITY_MATRIX.json:1` under `contracts[].rezi`.

Key entrypoints:
- `packages/ink-compat/src/index.ts:1` (public exports)
- `packages/ink-compat/src/render.ts:43` (render lifecycle)
- `packages/ink-compat/src/reconciler/hostConfig.ts:35` + `packages/ink-compat/src/reconciler/convert.ts:108` (host tree + conversion)

---

## D) Requirements For Parity (What Rezi Must Add/Change)

For every `Partial` or `Missing` requirement ID in the conformance matrix (below), Rezi must implement the listed gaps in the referenced files/modules. See each contract’s `rezi.gaps[]` in `INK_UPSTREAM_PARITY_MATRIX.json:1`.

Where work should live (guidance):
- **ink-compat:** Type surface alignment (`types.ts`), export surface (`index.ts`), Ink-shaped hooks/components, and Ink-specific render policies (debug/CI/screen-reader paths).
- **core/node:** Terminal output preservation semantics, cursor positioning, clipping regions, and any “static output outside framebuffer” behavior that Ink relies on.

---

## E) Conformance Matrix + Roadmap

### Conformance Matrix (by Requirement ID)

This is the authoritative matrix for parity tracking. Status values are:
`Implemented | Partial | Missing | NotApplicable | Unknown`.

| ID | Priority | Export | Summary | Rezi Status |
|---|---|---|---|---|
| INK-TYPE-RENDEROPTIONS-001 | P0 | RenderOptions | Options type includes concurrent + kittyKeyboard | Partial |
| INK-TYPE-INSTANCE-001 | P0 | Instance | Instance type matches Ink (incl unmount signature) | Partial |
| INK-API-RENDER-001 | P0 | render | Option defaults + stdout overload | Partial |
| INK-API-RENDER-002 | P0 | render | Per-stdout instance caching + concurrent warning | Missing |
| INK-API-RENDER-003 | P2 | render | Concurrent mode semantics | Missing |
| INK-API-RENDER-004 | P1 | render | maxFps throttling + static immediate render | Partial |
| INK-API-RENDER-005 | P2 | render | incrementalRendering semantics | Missing |
| INK-API-RENDER-006 | P2 | render | debug mode append-only frames | Missing |
| INK-API-RENDER-007 | P2 | render | CI mode last-frame behavior | Missing |
| INK-API-RENDER-008 | P1 | render | Screen reader renderer output | Missing |
| INK-API-RENDER-009 | P0 | render | patchConsole routing + stderr filter | Partial |
| INK-API-RENDER-010 | P0 | render | Stdout/Stderr write preserves output | Partial |
| INK-API-RENDER-011 | P0 | render | Resize handling + width fallback | Unknown |
| INK-API-RENDER-012 | P1 | render | Fullscreen newline suppression + clearTerminal | Unknown |
| INK-API-RENDER-013 | P0 | render | waitUntilExit/beforeExit/cleanup/clear semantics | Partial |
| INK-API-RENDER-014 | P2 | render | Kitty protocol lifecycle | Missing |
| INK-TYPE-BOXPROPS-001 | P1 | BoxProps | Box props types match Ink Styles | Partial |
| INK-COMP-BOX-001 | P1 | Box | Default styles + overflow normalization + ref | Partial |
| INK-COMP-BOX-002 | P1 | Box | Yoga layout mapping + shorthand precedence | Partial |
| INK-COMP-BOX-003 | P1 | Box | Border chars/colors/dim parity | Partial |
| INK-COMP-BOX-004 | P1 | Box | Background fill + inherited Text background | Unknown |
| INK-COMP-BOX-005 | P0 | Box | Overflow hidden clipping | Missing |
| INK-COMP-BOX-006 | P1 | Box | aria-* semantics in screen reader mode | Missing |
| INK-COMP-BOX-007 | P1 | Box | ref + measureElement compatibility | Partial |
| INK-TYPE-TEXTPROPS-001 | P1 | TextProps | Text prop types parity | Partial |
| INK-COMP-TEXT-001 | P1 | Text | Null/undefined children handling | Partial |
| INK-COMP-TEXT-002 | P1 | Text | Styling (chalk/colorize) + inheritance | Partial |
| INK-COMP-TEXT-003 | P1 | Text | wrapText wrapping + truncation semantics | Missing |
| INK-COMP-TEXT-004 | P0 | Text | Nesting errors/messages | Partial |
| INK-COMP-TEXT-005 | P0 | Text | Nested transforms indexing/ordering | Partial |
| INK-COMP-TEXT-006 | P1 | Text | aria-label/aria-hidden semantics | Missing |
| INK-TYPE-APPPROPS-001 | P1 | AppProps | AppProps shape + default no-op | Partial |
| INK-TYPE-STDINPROPS-001 | P0 | StdinProps | includes internal_exitOnCtrlC + internal_eventEmitter | Partial |
| INK-TYPE-STDOUTPROPS-001 | P0 | StdoutProps | type parity | Implemented |
| INK-TYPE-STDERRPROPS-001 | P0 | StderrProps | type parity | Implemented |
| INK-TYPE-STATICPROPS-001 | P1 | StaticProps | type parity | Partial |
| INK-COMP-STATIC-001 | P0 | Static | items slicing append-only behavior | Implemented |
| INK-COMP-STATIC-002 | P1 | Static | absolute column style + internal_static | Implemented |
| INK-COMP-STATIC-003 | P0 | Static | terminal-persistent static output | Partial |
| INK-COMP-STATIC-004 | P0 | Static | immediate render escape hatch | NotApplicable |
| INK-TYPE-TRANSFORMPROPS-001 | P1 | TransformProps | includes accessibilityLabel | Missing |
| INK-COMP-TRANSFORM-001 | P1 | Transform | null children => null | Implemented |
| INK-COMP-TRANSFORM-002 | P0 | Transform | per-line transform + stacking | Partial |
| INK-COMP-TRANSFORM-003 | P1 | Transform | accessibilityLabel in screen reader mode | Missing |
| INK-COMP-TRANSFORM-004 | P1 | Transform | default style props | Missing |
| INK-TYPE-NEWLINEPROPS-001 | P2 | NewlineProps | type parity | Implemented |
| INK-COMP-NEWLINE-001 | P2 | Newline | newline insertion | Implemented |
| INK-COMP-NEWLINE-002 | P2 | Newline | negative count throws | Implemented |
| INK-COMP-SPACER-001 | P1 | Spacer | Box flexGrow=1 equivalence | Partial |
| INK-TYPE-KEY-001 | P0 | Key | includes home/end + kitty fields | Missing |
| INK-HOOK-USEINPUT-001 | P0 | useInput | raw mode enable/disable | Missing |
| INK-HOOK-USEINPUT-002 | P0 | useInput | event subscription + batching | Implemented |
| INK-HOOK-USEINPUT-003 | P0 | useInput | Key mapping incl kitty | Missing |
| INK-HOOK-USEINPUT-004 | P0 | useInput | input string normalization | Partial |
| INK-HOOK-USEINPUT-005 | P0 | useInput | Ctrl+C forwarding vs exit | Implemented |
| INK-HOOK-USEINPUT-006 | P2 | useInput | uppercase shift inference | Implemented |
| INK-HOOK-USEINPUT-007 | P2 | useInput | kitty-specific input behavior | Missing |
| INK-HOOK-USEAPP-001 | P0 | useApp | default no-throw behavior | Partial |
| INK-HOOK-USESTDIN-001 | P0 | useStdin | default no-throw behavior + shape | Partial |
| INK-HOOK-USESTDOUT-001 | P0 | useStdout | output-preserving write | Partial |
| INK-HOOK-USESTDERR-001 | P0 | useStderr | output-preserving write | Partial |
| INK-HOOK-USEFOCUS-001 | P0 | useFocus | focus registration | Implemented |
| INK-HOOK-USEFOCUS-002 | P0 | useFocus | isActive/autoFocus/id semantics | Implemented |
| INK-HOOK-USEFOCUS-003 | P0 | useFocus | Tab/Shift+Tab/Esc focus policy | Partial |
| INK-HOOK-USEFOCUSMANAGER-001 | P0 | useFocusManager | focus control methods | Implemented |
| INK-HOOK-USEISSCREENREADERENABLED-001 | P1 | useIsScreenReaderEnabled | hook returns boolean | Implemented |
| INK-HOOK-USECURSOR-001 | P0 | useCursor | hook exists + commit semantics | Missing |
| INK-HOOK-USECURSOR-002 | P0 | useCursor | cursor positioned + shown/hidden | Missing |
| INK-HOOK-USECURSOR-003 | P0 | useCursor | cursorDirty prevents leakage | Missing |
| INK-TYPE-CURSORPOSITION-001 | P0 | CursorPosition | type exported | Missing |
| INK-MEASURE-MEASUREELEMENT-001 | P1 | measureElement | returns width/height or 0 | Implemented |
| INK-TYPE-DOMELEMENT-001 | P1 | DOMElement | ref/measurement handle shape | Partial |
| INK-CONST-KITTYFLAGS-001 | P2 | kittyFlags | const values exported | Missing |
| INK-CONST-KITTYMODIFIERS-001 | P2 | kittyModifiers | const values exported | Missing |
| INK-TYPE-KITTYKEYBOARDOPTIONS-001 | P2 | KittyKeyboardOptions | type exported | Missing |
| INK-TYPE-KITTYFLAGNAME-001 | P2 | KittyFlagName | type exported | Missing |

### Prioritized Roadmap

#### P0 — Startup/Input/Render Correctness, Terminal Safety, Cursor, Clipping

- **Instance lifecycle parity:** INK-API-RENDER-002, INK-API-RENDER-013
- **Output safety for external writes:** INK-API-RENDER-010, INK-API-RENDER-009
- **Overflow hidden clipping correctness:** INK-COMP-BOX-005
- **Cursor placement & visibility:** INK-HOOK-USECURSOR-001/002/003, INK-TYPE-CURSORPOSITION-001
- **Input parsing completeness:** INK-TYPE-KEY-001, INK-HOOK-USEINPUT-001/003/004
- **Text/Box nesting errors (message parity):** INK-COMP-TEXT-004

#### P1 — Layout Fidelity, Wrapping/Measurement, Styling Fidelity, Accessibility

- **Text wrapping parity:** INK-COMP-TEXT-003
- **Box layout (Yoga semantics) fidelity:** INK-COMP-BOX-002
- **Border/background fidelity:** INK-COMP-BOX-003, INK-COMP-BOX-004, INK-COMP-TEXT-002
- **Screen reader mode output + aria semantics:** INK-API-RENDER-008, INK-COMP-BOX-006, INK-COMP-TEXT-006, INK-COMP-TRANSFORM-003
- **Static output parity (true append-only persistence):** INK-COMP-STATIC-003

#### P2 — Debug/Devtools, Less-used Exports, Kitty Protocol, Incremental Rendering

- **Debug mode parity:** INK-API-RENDER-006
- **CI mode parity:** INK-API-RENDER-007
- **incrementalRendering parity:** INK-API-RENDER-005
- **Kitty keyboard protocol + exports:** INK-API-RENDER-014, INK-CONST-KITTYFLAGS-001, INK-CONST-KITTYMODIFIERS-001, INK-TYPE-KITTYKEYBOARDOPTIONS-001, INK-TYPE-KITTYFLAGNAME-001, INK-HOOK-USEINPUT-007
- **Concurrent mode parity:** INK-API-RENDER-003

---

## Unknowns (Require Concrete Runtime Experiments)

The following items require runtime experiments because parity cannot be fully proven by static inspection. Items **(1–3)** are marked `Unknown` in the JSON matrix; item **(4)** is `Partial` but explicitly requires parity verification.

1. **Resize behavior in Rezi:** Does Rezi reflow on terminal resize with no artifacts, and where is it implemented?  
   - Experiment: render a wrapping layout with fixed dimensions, resize terminal narrower, capture stdout output frames, compare with Ink. (Ink evidence: `src/ink.tsx:210`.)
2. **Fullscreen newline/clearTerminal behavior in Rezi:**  
   - Experiment: render an output with height >= terminal rows, capture whether a trailing newline is suppressed, and whether clear-terminal behavior matches Ink transitions. (Ink evidence: `src/ink.tsx:371`.)
3. **Background fill semantics in Rezi:**  
   - Experiment: render a fixed-size backgroundColor Box with no children and compare visible fill to Ink’s renderBackground behavior. (Ink evidence: `src/render-background.ts:5`.)
4. **Spacer flex parity:**  
   - Experiment: row/column fixtures with Spacer; compare with Ink Yoga output at fixed terminal sizes. (Ink evidence: `src/components/Spacer.tsx:9`.)

---

## Appendix: Machine-Readable Source of Truth

- `INK_UPSTREAM_PARITY_MATRIX.json:1`

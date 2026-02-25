# Ink Compatibility Audit: `@rezi-ui/ink-compat` vs Official Ink

Date: 2026-02-24

Audit target:
- Repo: `/home/k3nig/Rezi/.claude/worktrees/ink-compat`
- Package: `packages/ink-compat/**` (`@rezi-ui/ink-compat@0.1.0-alpha.34`)

Reference baseline:
- Ink: `ink@6.8.0` (current `npm view ink version` as of 2026-02-24)

Real-world validation app:
- `/home/k3nig/gemini-cli` (overrides `ink` to `file:../Rezi/.claude/worktrees/ink-compat/packages/ink-compat`)

---

## 1. Executive Summary

`@rezi-ui/ink-compat` provides a usable subset of Ink’s public surface (core components + hooks + `render`/`renderToString`) but diverges from official Ink behavior in multiple high-impact ways.

The most consequential incompatibilities (confirmed by code + repro output) are:

- **Layout defaults and sizing**:
  - `<Box>` default `flexDirection` is **wrong** (`column` instead of Ink’s `row`). (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Box.tsx)
  - Percentage sizing (`width="100%"`, `height="100%"`, percent min sizes, percent flexBasis) is **not implemented**, breaking common layouts. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/styles.ts)
- **Text/ANSI correctness**:
  - ANSI sanitization diverges: only SGR (`...m`) is recognized; other control sequences are dropped/partially rendered as text, while Ink preserves OSC and strips other sequences. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/sanitize-ansi.ts)
  - Unicode width/grapheme handling is incorrect (wide CJK and ZWJ emoji produce visible spacing artifacts). (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/output.ts)
- **Core components semantics**:
  - `<Transform>` is not Ink-equivalent and loses newlines for multiline children. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Transform.tsx)
  - `<Static>` does not behave like Ink (ordering, render-once semantics, separate static output channel). (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Static.tsx)
- **Runtime/options compatibility**:
  - `patchConsole`, `maxFps`, `incrementalRendering`, `isScreenReaderEnabled` are declared but unused. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts and https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx)
  - `debug` output behavior does not match Ink.
  - `render(node, stdoutStream)` overload and per-stdout instance reuse are missing.
  - Terminal lifecycle differs: cursor is hidden unconditionally, raw mode is enabled globally, and crash/exit cleanup is weaker (no signal-exit handling). (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx and https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-input.ts)
- **Hooks and measurement**:
  - `useFocus()` return shape doesn’t match Ink (missing `focus()`), and focus activation semantics differ. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-focus.ts)
  - `measureElement()` is effectively **non-functional** in live usage because `__inkLayout` is never populated. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/measure-element.ts)
  - `useStdout().write()` and `useStderr().write()` don’t preserve the UI like Ink. (Ink: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx)

**Gemini CLI impact:** Gemini relies heavily on `width="100%"`/`height="100%"`, `incrementalRendering`, `isScreenReaderEnabled`, and additional non-official Ink APIs (`getBoundingBox`, `ResizeObserver`, `getInnerHeight`, `getScrollHeight`). The percent sizing gap alone is sufficient to produce major visual breakage; the rendering strategy (full-screen clear + idle repaint) is a plausible contributor to the reported “resize reappearance delay”. The “white composer bar” symptom was not reproduced deterministically in this audit; contributing gaps are listed as hypotheses with required evidence.

---

## 2. Audit Methodology

1. **Baseline selection**
   - Verified current stable Ink version via `npm view ink version`.
   - Used Ink v6.8.0 docs, types, and implementation as the source of truth.

2. **Surface + behavior comparison**
   - Compared exports and public APIs (`render`, components, hooks, `RenderOptions`, `Instance`).
   - Read Ink source/type definitions (from local install and linked GitHub tag) to establish expected behavior.
   - Read `packages/ink-compat/src/**` to identify claimed compatibility vs actual implementation.

3. **Evidence collection**
   - Ran `@rezi-ui/ink-compat` tests and captured failures.
   - Created deterministic `renderToString` repros comparing Ink v6.8.0 vs ink-compat and captured output.
   - Consulted ink-compat trace logs to characterize resize/repaint behavior.

4. **Gemini CLI validation**
   - Audited Gemini’s Ink usage (render options, layout props, and use of non-official APIs) via code search in `/home/k3nig/gemini-cli`.

**No guessing rule:** Any behavior not directly evidenced by code, repro output, or logs is marked as **Hypothesis** with confidence and missing evidence.

---

## 3. Ink Reference Baseline (Version + Links)

Baseline package/version:
- Ink `6.8.0` (npm registry):
  - Release tag: https://github.com/vadimdemedes/ink/releases/tag/v6.8.0

Official docs (Ink README, v6.8.0):
- https://github.com/vadimdemedes/ink/blob/v6.8.0/readme.md

Key API/type references (Ink v6.8.0):
- Exports: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/index.ts
- `render()` / options / instance: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts
- `<Box>`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Box.tsx
- `<Text>`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Text.tsx
- `<Static>`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Static.tsx
- `<Transform>`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Transform.tsx
- `useInput`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-input.ts
- `useFocus`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-focus.ts
- `useCursor`: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-cursor.ts
- ANSI sanitization: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/sanitize-ansi.ts
- Rendering/output pipeline:
  - Output grid + transformers: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/output.ts
  - Render node to output: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render-node-to-output.ts
  - Styles (percent sizing via Yoga): https://github.com/vadimdemedes/ink/blob/v6.8.0/src/styles.ts

Note: This audit also cites local installed Ink build artifacts for line-level evidence (`/home/k3nig/Rezi/.claude/worktrees/ink-compat/packages/bench/node_modules/ink/build/**`). These correspond to Ink v6.8.0.

---

## 4. Compatibility Scorecard (Area-by-Area)

Legend: Pass | Partial | Fail

| Area | Status | Notes |
|---|---|---|
| Module exports surface | Partial | Missing `useCursor`, `kittyFlags`, `kittyModifiers` (Ink exports them); ink-compat exports extra non-Ink APIs. |
| `render()` signature + instance reuse | Fail | Missing `render(node, stdoutStream)` overload and per-stdout instance reuse; options like `incrementalRendering` declared but unused. |
| `RenderOptions` behavior | Fail | `patchConsole`, `maxFps`, `incrementalRendering`, `isScreenReaderEnabled` not implemented; `debug` differs. |
| `renderToString()` | Fail | `<Static>` ordering/semantics differ; hooks aren’t Ink-equivalent in this mode. |
| `<Box>` core semantics | Fail | Default direction mismatch; percent sizing missing; partial support for Ink style props. |
| `<Text>` core semantics | Partial | Basic styles and wrap modes mapped, but ANSI sanitization and color parsing diverge; aria props missing. |
| `<Transform>` | Fail | Newline loss + applied pre-layout; no accessibilityLabel behavior. |
| `<Static>` | Fail | No render-once, no separate static output channel, ordering differs. |
| Layout: flex/padding/margin/gap/border | Partial | Many props mapped; defaults differ (direction, alignItems), percent dimensions missing, wrap-reverse unsupported. |
| Text rendering (wrapping/width/graphemes) | Fail | Wide chars/ZWJ emoji render incorrectly (visible spaces). |
| Color/styling (truecolor/256/no-color) | Partial | Outputs always truecolor; does not honor Ink/chalk color support rules; missing `ansi256(...)` parsing for props. |
| Input parsing | Partial | Basic arrows/tab/shift-tab supported; no chunk parsing, no kitty protocol, reduced key surface. |
| Focus behavior | Partial | Tab navigation exists, but hook semantics diverge from Ink. |
| Terminal lifecycle (cursor/raw mode/cleanup) | Partial | Cursor hide/show and alt buffer supported, but raw mode lifecycle differs and crash resilience is weaker than Ink (no signal-exit cleanup). |
| Resize behavior | Partial | Has debounce + viewport polling + idle repaint; differs from Ink behavior and can skip frames during resize. |
| Backpressure (`stdout` drain) | Partial | Has drain queueing; differs from Ink’s log-update approach. |
| Error handling/crash resilience | Partial | Some try/catch + stderr logging; lacks Ink’s signal-exit cleanup and console patching. |
| Measurement APIs (`measureElement`) | Fail | API exists but live layout metadata isn’t populated, so it returns zeros. |
| Gemini CLI compatibility | Partial/Fail | Core layout and rendering options incompatibilities + broken non-official APIs used by Gemini. |

---

## 5. Findings Table

| ID | Severity | Area | Summary | Evidence |
|---|---:|---|---|---|
| IC-001 | High | Layout / Box | `<Box>` default `flexDirection` is `column` (Ink default is `row`) | `propsToVNode.ts:159-163`; repro `/tmp/ink-compat-audit-repros.log` |
| IC-002 | Critical | Layout / Sizing | Percent dimensions (`"100%"`) ignored, causing collapsed layouts | `propsToVNode.ts:245-271`; Ink `styles.ts` percent setters; repro log |
| IC-003 | High | Components / Transform | `<Transform>` loses newlines and differs from Ink transformer timing | `propsToVNode.ts:130-157`; failing tests; repro log; Ink `output.ts` transformers |
| IC-004 | High | Components / Static | `<Static>` ordering and render-once semantics differ; no static output channel | `components/Static.ts`; `propsToVNode.ts:199-204`; repro log; Ink `components/Static.tsx` |
| IC-005 | Critical | Text / ANSI | ANSI sanitization diverges: OSC not preserved, CSI not stripped; control sequences leak as text | `propsToVNode.ts:36` + `parseAnsiText`; repro log; Ink `sanitize-ansi.ts` |
| IC-006 | High | Text / Unicode width | Wide chars and grapheme clusters render with visible spacing artifacts | `render.ts:810-833`; repro log; Ink `output.ts` wide char handling |
| IC-007 | High | Public API / render | `render()` overload + per-stdout instance reuse missing; `cleanup` semantics differ | `render.ts:939-943`; Ink `render.ts`/instances map |
| IC-008 | High | Render options | `patchConsole`, `maxFps`, `incrementalRendering`, `isScreenReaderEnabled` declared but unused; `debug` semantics differ | `render.ts` rg results; Ink `ink.ts` uses them |
| IC-009 | High | Output mixing | `useStdout().write` / `useStderr().write` write directly and can corrupt UI | `useStdout.ts:3-10`; Ink `ink.ts:371-417` |
| IC-010 | High | Measurement | `measureElement()` relies on `__inkLayout` which is never populated in runtime | `measureElement.ts`; `rg __inkLayout`; Ink `measure-element.ts` |
| IC-011 | Medium | Focus | `useFocus()` return shape + semantics differ (missing `focus()`, isActive handling); focus tests conflict with Ink tab handling | `useFocus.ts`; Ink `use-focus.ts`; Ink `App.tsx` tab nav |
| IC-012 | Medium | Input | Key parsing is minimal vs Ink input-parser; no kitty protocol; raw mode enabled globally | `bridge.ts:205-255`; `render.ts:1458-1462`; Ink `input-parser.ts`/kitty |
| IC-013 | Medium | Accessibility | aria props not supported on Box/Text; Transform accessibilityLabel missing | Ink `Box.d.ts`/`Text.d.ts`/Transform; ink-compat props |
| IC-014 | Medium | Color | Missing `ansi256(...)` color strings + no honor of `NO_COLOR`/color depth; always emits truecolor | Ink `colorize.ts`; ink-compat `colorMap.ts`; `render.ts:724-741` |
| IC-015 | Low | Flex defaults | `wrap-reverse` unsupported; default alignItems differs from Yoga/Ink | `propsToVNode.ts:281-320`; Ink `styles.ts` |
| IC-016 | Info | Test suite | Some existing tests encode non-Ink expectations (default column direction; manual Tab focus handling) | `layout-stress.test.tsx:12-33`; `focus.test.tsx:40-52`; Ink `App.tsx` tab nav |
| IC-017 | High (Gemini) | Gemini CLI | Gemini depends on percent sizing + render options and non-official APIs; current gaps plausibly explain resize delay and other UI issues (white composer bar = Hypothesis) | Gemini code references; ink-compat gaps; traces |
| IC-018 | Medium | Public API / Exports | Missing Ink exports (`useCursor`, `kittyFlags`, `kittyModifiers`) and missing Ink `RenderOptions` fields (`concurrent`, `kittyKeyboard`) | Ink `src/index.ts` + `src/render.ts`; ink-compat `src/index.ts` |
| IC-019 | Medium | Public API / App exit | `useApp().exit()` and `waitUntilExit()` do not support exit result values (Ink resolves `waitUntilExit()` with a value) | Ink `AppContext`/`render.ts`; ink-compat `bridge.ts`/`render.ts` |
| IC-020 | High | Terminal lifecycle | Cursor is always hidden; `useCursor` not implemented; raw mode enabled globally; no signal-exit cleanup | ink-compat `render.ts`; Ink `ink.ts` + `use-cursor.ts` |
| IC-021 | Medium | Resize | Resize debounce + viewport polling + idle repaint differ from Ink and can skip frames during resize | ink-compat `render.ts`; `/tmp/ink-compat-*.trace`; Ink `ink.ts` resize |
| IC-022 | Medium | Backpressure / Writes | Drain handling queues only the latest frame; full-screen clear on each write; differs from Ink’s log-update model | ink-compat `render.ts:1164-1198`; Ink `ink.ts` |
| IC-023 | Medium | Performance / Tracing | Per-frame full grid allocation and full redraw is O(cols*rows); trace tooling is strong but can be expensive | ink-compat `renderOpsToAnsi`; trace logs |
| IC-024 | Medium | Box props coverage | Missing/partial Box prop parity (`position`, per-edge border colors/dim, percent min sizes) | Ink `Box` props; ink-compat `BoxProps` + translation |

---

## 6. Detailed Findings

### IC-001 — `<Box>` default `flexDirection` mismatch

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink `<Box>` defaults to `flexDirection: 'row'` and `flexWrap: 'nowrap'`, `flexGrow: 0`, `flexShrink: 1`. See Ink v6.8.0 Box implementation. (Docs/source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Box.tsx)

Local Ink build evidence:
- `/home/k3nig/Rezi/.claude/worktrees/ink-compat/packages/bench/node_modules/ink/build/components/Box.js` sets `flexDirection: 'row'` (line 14-18).

**Actual (ink-compat):**
- The translation layer defaults to `"column"` when `flexDirection` is not set.

**Evidence:**
- `packages/ink-compat/src/translation/propsToVNode.ts:159-163`
  - `const direction = (p.flexDirection as string | undefined) ?? "column";`
- Deterministic repro (`renderToString`): `/tmp/ink-compat-audit-repros.log`
  - Ink output: `"AB"`
  - ink-compat output: `"A\nB"`

**Root cause:**
- The Ink host node style is interpreted with a default `column` direction, likely chosen to align with Rezi defaults, but it conflicts with Ink/Yoga defaults.

**Fix proposal (minimal):**
- In `packages/ink-compat/src/translation/propsToVNode.ts`, change the default direction to `"row"`.
  - Suggested patch site: `translateBox()` around line 161.
- Update/replace any tests that assume `column` is the default (see IC-016).

**Regression test plan:**
- Add a test that uses the public `renderToString()` export and asserts default `<Box>` is row:
  - File: `packages/ink-compat/src/__tests__/api/box-default-direction.test.tsx` (new)
  - Assert that rendering `<Box><Text>A</Text><Text>B</Text></Box>` produces `AB` on one line.

---

### IC-002 — Percent sizing (`"100%"`) not supported

**Severity:** Critical

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink supports percentage values for width/height/minWidth/minHeight/flexBasis via Yoga percent setters.
  - Width/height percent: `setWidthPercent`, `setHeightPercent` (Ink styles: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/styles.ts)
  - Local build evidence: `build/styles.js:148-186` uses `node.setWidthPercent(...)` and `node.setHeightPercent(...)`.

**Actual (ink-compat):**
- `width`/`height` as strings are explicitly skipped.
- `minWidth`/`minHeight` only support numbers (string percent is ignored).

**Evidence:**
- `packages/ink-compat/src/translation/propsToVNode.ts:245-271`
  - Comment: “Skip string/percentage values”
  - Implementation: only `typeof p.width === "number"` and `typeof p.height === "number"` are applied.
- Deterministic repro (`renderToString`): `/tmp/ink-compat-audit-repros.log`
  - Percent width:
    - Ink: `"╭────────╮\n│X       │\n╰────────╯"`
    - ink-compat: `"╭─╮\n│X│\n╰─╯"`
  - Percent height inside fixed-height parent:
    - Ink shows inner box filling height.
    - ink-compat inner box collapses.

**Root cause:**
- Translation does not implement percent dimensions. Rezi’s layout props are treated as integer-only; percent values are dropped.

**Fix proposal (minimal):**
- Implement percent sizing translation, at least for the common `"100%"` case used by real apps:
  - Option A (closest to Ink): add percent dimension support to Rezi layout nodes used by ink-compat (requires core/layout work).
  - Option B (compat-only shim): interpret `"100%"` (and other `N%`) at translation time using a two-pass approach:
    1. Annotate nodes with percent intent (e.g., `__inkPercentWidth=100`).
    2. After layout is known (in `renderFrame`), resolve these into concrete widths/heights and re-render.
- Also support percent `minWidth`/`minHeight` and `flexBasis` percent (Ink supports it).

**Regression test plan (required):**
- Add snapshot-style tests using `renderToString({columns: 10})`:
  - `width="100%"` should fill the container width and produce a wide border.
  - A nested `height="100%"` inside a parent with fixed `height` should fill vertically.
- Add Gemini-focused regression test covering a representative layout subtree (see IC-017): composer/header boxes with `width="100%"` should not collapse.

---

### IC-003 — `<Transform>` newline loss and semantics divergence

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink `<Transform>` attaches a transformer that is applied **after layout and wrapping** on each output line, with `(line, index)` signature.
  - Component: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Transform.tsx
  - Output applies transformers per rendered line: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/output.ts
  - Local build evidence: `build/output.js:137-165` applies each transformer to each `line` of `text.split('\n')`.

**Actual (ink-compat):**
- `<Transform>` is implemented as an `ink-virtual` node and translated into plain text **before** layout.
- Multiline children translated into `ui.column(...)` lose newlines when flattened by `vnodeToText()`, so the transform runs on `"AB"` instead of `"A\nB"`.

**Evidence:**
- `packages/ink-compat/src/translation/propsToVNode.ts:130-157`
  - `raw = children.map(vnodeToText).join("")` (no newline reconstitution)
- Failing tests:
  - `/tmp/ink-compat-test.log`:
    - `not ok ... full-app: log shows numbered entries via Transform`
    - `not ok ... layout: Transform adds line numbers`
- Deterministic repro: `/tmp/ink-compat-audit-repros.log`
  - Ink: `"1: A\n2: B"`
  - ink-compat: `"1: AB"`

**Root cause:**
- `vnodeToText()` flattens Rezi VNodes by concatenating children without inserting newlines, even when the VNode represents multiline text via a column layout.
- Additionally, Transform is applied at the translation stage, not at final output stage.

**Fix proposal (minimal):**
1. Fix newline preservation:
   - Introduce a dedicated VNode kind/marker for multiline text (produced by `translateMultilineRichText`) so `vnodeToText()` can join lines with `"\n"`.
2. Move Transform closer to Ink semantics:
   - Apply transform functions at the final output-line stage (analogous to Ink’s `Output` transformers), after wrapping/clipping.

**Regression test plan (required):**
- Keep existing failing tests but update expected to Ink behavior where necessary.
- Add a focused test:
  - `<Transform transform={(l,i)=>...}><Text>alpha\nbeta</Text></Transform>` should output two transformed lines.
- Add a test where wrapping occurs (narrow columns) to ensure transform happens post-wrap (Ink behavior).

---

### IC-004 — `<Static>` ordering and render-once semantics missing

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- `<Static>` permanently renders items **above everything else**, regardless of position in the React tree.
- It renders each item only once; subsequent renders only output newly-added items.
  - Component behavior: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Static.tsx
  - Rendering splits static output and prepends it: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/renderer.ts
  - Local build evidence:
    - `build/components/Static.js:11-26` renders only `items.slice(index)` and uses `useLayoutEffect` to advance index.
    - `build/renderer.js:26-46` produces `staticOutput` separately and prepends it.

**Actual (ink-compat):**
- `Static` marks `__inkStatic: true`, but the translation layer just renders it inline as a normal `ui.column`.
- There is no “static output channel” or “render once” behavior.

**Evidence:**
- `packages/ink-compat/src/components/Static.ts:16-22` always maps `items` each render.
- `packages/ink-compat/src/translation/propsToVNode.ts:199-204` returns inline `ui.column` when `p.__inkStatic === true`.
- Deterministic repro: `/tmp/ink-compat-audit-repros.log`
  - Ink: `"S\nDynamic"` even when `<Static>` appears after dynamic content in the tree.
  - ink-compat: `"Dynamic\nS"` (inline ordering).

**Root cause:**
- No separate static rendering pipeline.
- The compat `<Static>` component is not implemented with Ink’s `useLayoutEffect` index-tracking semantics.

**Fix proposal (minimal):**
- Implement Ink-like static output separation in ink-compat runtime:
  - During translation, split host tree into two VNode trees: dynamic and static.
  - Render static subtree with `skipStaticElements=false` equivalent and prepend its output to dynamic output (including the trailing newline semantics described in Ink’s renderer).
- Implement “render once” semantics in the `<Static>` component (track rendered index, only render new items).

**Regression test plan (required):**
- Add `renderToString` test asserting static is prepended even when declared later.
- Add a multi-render test (live `render` with rerender) asserting static items don’t re-render/duplicate and that changing earlier items doesn’t update already-rendered static output (Ink semantics).

---

### IC-005 — ANSI sanitization incompatible (OSC/CSI)

**Severity:** Critical

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink sanitizes ANSI to avoid control sequences breaking layout.
  - Preserves: SGR (`...m`) and OSC (hyperlinks, etc.).
  - Strips: other CSI sequences like clear screen, cursor movement.
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/sanitize-ansi.ts
  - Local build evidence: `build/sanitize-ansi.js:3-23`.

**Actual (ink-compat):**
- Translation only recognizes SGR via `ANSI_SGR_REGEX` and does not sanitize other escape sequences.
- ESC itself is treated as zero-width and dropped during cell drawing, leaving the remaining bytes rendered literally (e.g., `[2J`).

**Evidence:**
- `packages/ink-compat/src/translation/propsToVNode.ts:36` uses `ANSI_SGR_REGEX` only.
- Deterministic repro: `/tmp/ink-compat-audit-repros.log`
  - Input contains CSI clear (`ESC[2J`) and OSC hyperlink (`ESC]8;;...`).
  - Ink output: `"AB"` (CSI stripped, OSC not visible in sanitized string output for this case).
  - ink-compat output: `"A[2JB ]8;;https://example.com\\link]8;;\\"` (leaked sequences as text).

**Root cause:**
- Missing sanitize step equivalent to Ink’s `sanitizeAnsi()`.
- Rendering loop drops ESC due to width=0 and prints remaining characters.

**Fix proposal (minimal):**
- Add an ANSI tokenizer/sanitizer step for raw text content:
  - Preserve SGR and OSC tokens.
  - Remove other CSI/control sequences.
- Align behavior with Ink’s `sanitize-ansi.ts` rather than partial SGR parsing.

**Regression test plan (required):**
- Add tests ensuring:
  - `Text` containing `\u001b[2J` results in output without `[2J`.
  - `Text` containing an OSC hyperlink preserves the OSC sequence (or at minimum does not print `]8;;` literally).

---

### IC-006 — Unicode width/grapheme handling inserts visible spaces

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink handles multi-column characters without inserting visible spaces.
  - When a character is multi-column, Ink clears following cells with `value: ''` (empty) rather than printing a space.
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/output.ts
  - Local build evidence: `build/output.js:149-163`.

**Actual (ink-compat):**
- For each glyph, ink-compat fills continuation cells with a literal space (`" "`), causing visible spacing artifacts between CJK characters and within emoji sequences.

**Evidence:**
- `packages/ink-compat/src/runtime/render.ts:810-833`
  - For width > 1, continuation cells are set to `{ char: " ", style: ... }`.
- Deterministic repro: `/tmp/ink-compat-audit-repros.log`
  - Ink: `"你好 👨‍👩‍👧‍👦"`
  - ink-compat: `"你 好  👨 👩 👧 👦"`

**Root cause:**
- Cell-grid model prints one character per cell. Using spaces for continuation cells makes those cells visible in the final string.
- Iteration over `for (const glyph of text)` splits ZWJ sequences into code points, dropping ZWJ and rendering separate emoji.

**Fix proposal (minimal):**
- Represent continuation cells as empty output (e.g., `char: ""`) and ensure the ANSI string builder skips empty cells, similar to Ink.
- Iterate text by grapheme clusters (Node 20+ can use `Intl.Segmenter` with `{granularity: 'grapheme'}`) before measuring width.

**Regression test plan (required):**
- Add `renderToString` tests for:
  - CJK string `"你好"` should render without an inserted space.
  - ZWJ emoji `"👨‍👩‍👧‍👦"` should remain a single grapheme and not split into multiple glyphs.

---

### IC-007 — `render()` overload and per-stdout instance reuse missing

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- `render(node, options?: stdoutStream | RenderOptions)` overload exists.
- Ink reuses a single instance per `stdout` stream via an internal `instances` map; `cleanup()` removes it.
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts
  - Local build evidence: `build/render.js:4-43`.

**Actual (ink-compat):**
- `render(element, options: RenderOptions = {})` only; passing `stdout` as second arg (Ink-supported) is ignored.
- No global instance map keyed by stdout; repeated `render()` calls can attach multiple listeners and compete for terminal state.

**Evidence:**
- `packages/ink-compat/src/runtime/render.ts:939-943` reads `options.stdout` etc; no overload.
- Code has no shared `instances` registry (contrast with Ink’s `build/render.js` importing `instances`).

**Root cause:**
- ink-compat implements `render()` as a one-off renderer; no stdout-scoped instance reuse.

**Fix proposal (minimal):**
- Implement Ink-like overload parsing:
  - If second argument is a stream, treat it as `{stdout: stream, stdin: process.stdin}`.
- Add a `Map<Writable, InstanceInternal>` keyed by stdout that reuses the renderer and attached listeners.
- Align `cleanup()` semantics with Ink (remove from registry, not necessarily terminal teardown).

**Regression test plan (required):**
- Add test verifying `render(<App/>, stdoutStream)` uses the provided stream.
- Add test verifying two renders to the same stdout reuse the instance and don’t multiply resize/SIGWINCH listeners.

---

### IC-008 — Render options declared but not implemented (`patchConsole`, `maxFps`, `incrementalRendering`, `isScreenReaderEnabled`, `debug`)

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- `patchConsole` patches `console.*` so logs don’t corrupt UI.
- `maxFps` throttles rendering.
- `incrementalRendering` enables log-update incremental mode.
- `isScreenReaderEnabled` switches output strategy (and default reads `INK_SCREEN_READER`).
- `debug: true` renders each update as separate output without replacing.
  - Options described in Ink types: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts
  - Implementation in Ink runtime: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx
  - Local build evidence: `build/ink.js:120-143` (maxFps/incremental), `build/ink.js:553-568` (patchConsole), `build/ink.js:245-260` (debug).

**Actual (ink-compat):**
- Options are present in `RenderOptions` type but unused:
  - `patchConsole`, `maxFps`, `incrementalRendering`, `isScreenReaderEnabled` appear only in the interface.
- Output strategy always clears and redraws full screen (`ESC[H ESC[J`).

**Evidence:**
- `packages/ink-compat/src/runtime/render.ts`
  - Declared only: `incrementalRendering?: boolean` at line 33 (no other references).
  - Full redraw: `writeCompat(\`\u001b[H\u001b[J${output}\`)` at `render.ts:1164-1198`.
- `useIsScreenReaderEnabled()` stub always returns false: `hooks/useIsScreenReaderEnabled.ts:1-10`.

**Root cause:**
- ink-compat runtime currently implements a full-screen-clear renderer and does not incorporate Ink’s log-update + throttle + console patching model.

**Fix proposal (minimal):**
- Implement `patchConsole` by wrapping console methods to call an Ink-like `writeToStdout`/`writeToStderr` that clears and restores UI.
- Implement `maxFps` by throttling `renderFrame` calls.
- Implement `incrementalRendering` by diffing rendered lines and using cursor movement + erase-line sequences rather than clearing the entire screen.
- Implement `isScreenReaderEnabled` flag + env default, and adjust cursor/raw mode usage accordingly.
- Implement Ink `debug` mode (append frames rather than replace).

**Regression test plan (required):**
- `incrementalRendering: true` should not emit full clear sequences on normal frames (assert on captured stdout writes).
- `maxFps` should cap render frequency (assert frame count over time with a fast ticker).
- `patchConsole: true` should preserve UI when calling `console.log`.

---

### IC-009 — `useStdout().write()` / `useStderr().write()` do not preserve UI

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink’s `useStdout().write()` and `useStderr().write()` are implemented to clear Ink UI, write the external output, then restore the last Ink frame.
  - Local build evidence: `build/ink.js:371-417` (`writeToStdout`/`writeToStderr`).

**Actual (ink-compat):**
- `useStdout().write` and `useStderr().write` write directly to the streams with no UI preservation.

**Evidence:**
- `packages/ink-compat/src/hooks/useStdout.ts:3-10`
- `packages/ink-compat/src/hooks/useStderr.ts:3-10`

**Root cause:**
- The runtime doesn’t expose a UI-preserving write function and doesn’t implement Ink’s log-update restoration model.

**Fix proposal (minimal):**
- Provide `writeToStdout`/`writeToStderr` functions in the context that:
  - Clear current UI output region.
  - Write external data.
  - Re-render or restore last output.
- Update `useStdout`/`useStderr` to call these.

**Regression test plan (required):**
- Live render test:
  - Render UI, call `useStdout().write('hello')`, ensure final terminal output still contains the UI frame (and includes `hello` in the correct place, per Ink behavior).

---

### IC-010 — `measureElement()` is non-functional (no `__inkLayout` population)

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- `measureElement(node)` returns computed width/height based on Yoga layout.
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/measure-element.ts
  - Local build evidence: `build/measure-element.js:4-7` uses `node.yogaNode.getComputedWidth/Height()`.

**Actual (ink-compat):**
- `measureElement(ref)` reads `ref.__inkLayout` which is never written by runtime, so it returns `{width:0,height:0}` in real usage.

**Evidence:**
- `packages/ink-compat/src/runtime/measureElement.ts:1-12` returns zeros when `__inkLayout` missing.
- `rg __inkLayout` shows it only appears in measurement helpers and tests; no runtime writes:
  - Output captured in tool run (see Appendix `rg __inkLayout` output).

**Root cause:**
- ink-compat doesn’t attach layout results back onto host nodes.

**Fix proposal (minimal):**
- After layout/render in `renderFrame`, map computed rects back to the corresponding `InkHostNode` instances and store them as `__inkLayout`.
  - This requires a stable mapping between host nodes and layout nodes (e.g., path-based or ID-based).

**Regression test plan (required):**
- Add an integration test rendering a `<Box ref={ref} width={10} height={3} />` and asserting `measureElement(ref.current)` returns `{width: 10, height: 3}` after the first commit.

---

### IC-011 — Focus API and semantics differ from Ink

**Severity:** Medium

**Classification:** Confirmed bug (Ink compatibility) + test-suite divergence

**Expected (Ink):**
- `useFocus()` returns `{isFocused, focus}` where `focus(id)` focuses a specific element.
- `useFocus({isActive})` maintains focusable order but allows activation/deactivation.
- Ink also handles Tab/Shift+Tab focus traversal internally when focus is enabled.
  - Hook: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-focus.ts
  - Tab traversal: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/App.tsx (see also local build `components/App.js:189-206`).

**Actual (ink-compat):**
- `useFocus()` returns only `{isFocused}`.
- `isActive: false` prevents registration entirely (removing it from ordering), rather than deactivating while preserving position.
- Focus enable/disable does not clear `focusedId` on disable.

**Evidence:**
- `packages/ink-compat/src/hooks/useFocus.ts:5-23` return shape.
- `packages/ink-compat/src/runtime/bridge.ts:60-131` focus registration and enable/disable semantics.
- Test-suite divergence:
  - `packages/ink-compat/src/__tests__/apps/focus.test.tsx:40-52` manually calls `focusNext()` on Tab.
  - Ink already performs Tab navigation internally; manually calling `focusNext()` would double-advance focus.
  - The failing tests in `/tmp/ink-compat-test.log` are therefore not Ink-aligned.

**Root cause:**
- ink-compat focus system is a simplified implementation and does not mirror Ink’s FocusContext behavior.

**Fix proposal (minimal):**
- Match Ink hook signature: return `{isFocused, focus}`.
- Implement active/inactive focusables (activate/deactivate) while preserving ordering.
- Align `disableFocus` semantics with Ink (clear active focus).
- Update tests to match Ink:
  - Verify Tab navigation without manually calling `focusNext()`.

**Regression test plan:**
- Update focus tests to align with Ink and assert correct traversal order and `isActive` skipping.

---

### IC-012 — Input parsing + raw mode lifecycle are reduced vs Ink

**Severity:** Medium

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Ink uses an input parser that can handle chunked escape sequences, pasted input, and optional kitty keyboard protocol for extra modifiers (`super`, `hyper`, `capsLock`, `numLock`) and event types.
  - Input parser: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/input-parser.ts
  - Kitty keyboard protocol exports: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/kitty-keyboard.ts
  - `render` supports `kittyKeyboard` option: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts

**Actual (ink-compat):**
- `parseKeyFromStdin()` only recognizes a small set of sequences.
- No chunk splitting/coalescing: if multiple key events arrive in a single chunk, they are treated as one “input”.
- No kitty protocol support.
- Raw mode is enabled globally on render when supported.

**Evidence:**
- Minimal parser: `packages/ink-compat/src/runtime/bridge.ts:205-255`.
- Raw mode enabled in render for all apps: `packages/ink-compat/src/runtime/render.ts:1458-1462`.

**Root cause:**
- ink-compat implements its own minimal input model and bypasses Ink’s parser/kitty support.

**Fix proposal (minimal):**
- Replace `parseKeyFromStdin` with an Ink-equivalent input-parser state machine that can parse sequences across chunks.
- Add optional kitty protocol support to match Ink exports and `RenderOptions.kittyKeyboard`.
- Align raw mode lifecycle with Ink’s hook-driven reference counting:
  - raw mode should be enabled when `useInput`/`useFocus` is active, and disabled when no longer needed.

**Regression test plan:**
- Add tests covering:
  - Multiple keypresses in one chunk.
  - Partial escape sequence across chunks.
  - Kitty modifiers when enabled.

---

### IC-013 — Accessibility props missing (aria + Transform accessibilityLabel)

**Severity:** Medium

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- `<Box>` and `<Text>` accept `aria-label`, `aria-hidden`, and `<Box>` supports `aria-role` and `aria-state`.
  - Types: Ink Box props: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Box.tsx and generated types.
  - Local type evidence: `build/components/Box.d.ts` and `build/components/Text.d.ts` include aria props.
- `<Transform>` supports `accessibilityLabel` used when screen reader mode is enabled.
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Transform.tsx

**Actual (ink-compat):**
- `BoxProps`/`TextProps` do not include aria props.
- `TransformProps` does not include `accessibilityLabel`.

**Evidence:**
- `packages/ink-compat/src/components/Box.ts` and `Text.ts` prop types.
- `packages/ink-compat/src/components/Transform.ts` prop types.

**Root cause:**
- ink-compat does not implement Ink accessibility layer and does not expose the same props.

**Fix proposal:**
- Extend public prop types to match Ink.
- Implement screen-reader output semantics (see IC-008/IC-009).

**Regression test plan:**
- Add type-level tests (tsc) ensuring props exist.
- Add renderToString tests in screen reader mode once implemented.

---

### IC-014 — Color support differs (missing `ansi256(...)`, always truecolor, ignores NO_COLOR)

**Severity:** Medium

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- Ink uses Chalk and supports:
  - named colors (`red`, `redBright`, etc.)
  - hex (`#rrggbb`)
  - `rgb(r,g,b)`
  - `ansi256(n)`
  - respects terminal color support and `NO_COLOR`/`FORCE_COLOR` conventions through Chalk/supports-color.
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/colorize.ts

**Actual (ink-compat):**
- `parseColor()` supports only: named colors (small fixed map), `#rgb/#rrggbb`, `rgb(r,g,b)`.
- No `ansi256(...)` string support for `color`/`backgroundColor` props.
- Renderer always emits truecolor SGR (`38;2`/`48;2`) regardless of stream color depth or `NO_COLOR`.

**Evidence:**
- `packages/ink-compat/src/translation/colorMap.ts:4-83` supported formats.
- `packages/ink-compat/src/runtime/render.ts:724-741` emits `38;2`/`48;2`.

**Root cause:**
- Color parsing is simplified and renderer does not incorporate Ink/chalk color-level negotiation.

**Fix proposal:**
- Add `ansi256(n)` parsing support to `parseColor()`.
- Respect `NO_COLOR` and stream color depth:
  - if colors disabled, omit SGR styling codes.
  - if only 256/16 color supported, map RGB into nearest palette.

**Regression test plan:**
- Unit tests for `parseColor('ansi256(123)')`.
- Integration test that forces `NO_COLOR=1` and asserts output contains no `\u001b[...m` codes.

---

### IC-015 — Flex defaults differ (`wrap-reverse` unsupported; alignItems default diverges)

**Severity:** Low

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- Ink supports `flexWrap: 'wrap-reverse'` via Yoga. (Ink styles: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/styles.ts)
- Ink only applies `alignItems` when the prop is present; otherwise it leaves Yoga defaults in effect. (Ink styles: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/styles.ts)

**Actual (ink-compat):**
- `wrap-reverse` warns and falls back to wrap.
- Default `alignItems` is only set to `stretch` for columns (rows skip it).

**Evidence:**
- `packages/ink-compat/src/translation/propsToVNode.ts:281-320` (`wrap-reverse` warning, column-only stretch default).

**Root cause:**
- Rezi mapping does not support `wrap-reverse`, so translation warns and falls back.
- Translation intentionally diverges from Yoga/Ink’s default cross-axis stretching for rows to avoid inflating Rezi measurement.

**Fix proposal:**
- Implement `wrap-reverse` semantics in Rezi mapping or document it as unsupported.
- Align `alignItems` default behavior with Ink/Yoga where feasible.

**Regression test plan:**
- Add a layout test that depends on wrap-reverse to match Ink output.

---

### IC-016 — Test Suite Drift From Ink Semantics

**Severity:** Info

**Classification:** Test issue (Ink baseline mismatch)

**Expected (Ink):**
- Default `<Box>` direction is `row`. (Ink Box: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Box.tsx)
- Tab/Shift+Tab focus traversal is handled internally by Ink’s `<App>` when focus is enabled. (Ink App: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/App.tsx)

**Actual (ink-compat test suite):**
- A stress test asserts default `<Box>` direction behaves like a column.
- The focus demo app manually advances focus on Tab/Shift+Tab via `useInput()`, which conflicts with Ink’s built-in tab navigation (double-advance).

**Evidence:**
- `packages/ink-compat/src/__tests__/apps/layout-stress.test.tsx:12-33`
- `packages/ink-compat/src/__tests__/apps/focus.test.tsx:40-52`
- Ink built-in tab navigation (local build): `packages/bench/node_modules/ink/build/components/App.js:189-206`.

**Root cause:**
- Tests were authored against the current compat implementation rather than the official Ink v6.8.0 baseline.

**Fix proposal:**
- Update the affected tests/apps to match Ink semantics:
  - Default `<Box>` should behave like `flexDirection=\"row\"`.
  - Remove manual `focusNext/focusPrevious` on Tab/Shift+Tab from focus demo apps, and instead assert that focus changes without manual handling.
- Add a “parity harness” test layer that renders the same element through Ink `renderToString()` and ink-compat `renderToString()` (for supported subsets) and asserts equality.

**Regression test plan:**
- Convert `layout: column is default direction` into an Ink parity test expecting row behavior.
- Add a focus traversal test that does not call `focusNext()` on Tab and asserts focus changes (once focus semantics align with Ink’s `useFocus` return shape).

---

### IC-017 — Gemini CLI Compatibility (Resize Delay + White Composer Bar)

**Severity:** High (for Gemini)

**Classification:** Mixed (confirmed ink-compat gaps + app-level dependencies + hypotheses)

**Expected (Ink):**
- Percent sizing is supported via Yoga percent setters (`setWidthPercent`, `setHeightPercent`). (Ink styles: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/styles.ts)
- `incrementalRendering`, `maxFps`, and `isScreenReaderEnabled` are implemented `RenderOptions` that change throttling and write strategy. (Ink render options/types: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts)
- Official Ink does not export Gemini’s non-official APIs (`getBoundingBox`, `ResizeObserver`, `getInnerHeight`, `getScrollHeight`). (Ink exports: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/index.ts)

**Actual (Gemini + ink-compat):**
- Gemini overrides `ink` to ink-compat and depends on:
  - Percent sizing (`width="100%"`, `height="100%"`).
  - `render()` options: `incrementalRendering`, `alternateBuffer`, `isScreenReaderEnabled`, `patchConsole: false`.
  - Non-official APIs imported from `ink` (implying a fork/extension expectation).
- With ink-compat:
  - Percent sizing is ignored (IC-002), collapsing key layouts.
  - `incrementalRendering`/`maxFps` are ignored (IC-008) and the renderer clears the full screen per frame (IC-022).
  - `isScreenReaderEnabled` is ignored (IC-008); `useIsScreenReaderEnabled()` always returns `false`.
  - Extra DOM/measurement APIs exist but rely on `__inkLayout`, which is never populated (IC-010), so Gemini’s measurement-dependent features cannot work reliably.

**Evidence:**
- Gemini override:
  - `/home/k3nig/gemini-cli/package.json:66-70`
- Gemini `render()` options:
  - `/home/k3nig/gemini-cli/packages/cli/src/gemini.tsx:274-301`
- Gemini percent sizing usage:
  - `/home/k3nig/gemini-cli/packages/cli/src/ui/layouts/ScreenReaderAppLayout.tsx:24-29` (`height="100%"`)
  - `/home/k3nig/gemini-cli/packages/cli/src/ui/components/Composer.tsx:173-207` (`width="100%"`)
  - `/home/k3nig/gemini-cli/packages/cli/src/ui/components/shared/VirtualizedList.tsx:356-365` (`width="100%"`)
- Gemini non-official Ink API usage:
  - `getInnerHeight/getScrollHeight`: `/home/k3nig/gemini-cli/packages/cli/src/ui/components/shared/Scrollable.tsx:15,63-65`
  - `ResizeObserver`: `/home/k3nig/gemini-cli/packages/cli/src/ui/components/shared/MaxSizedBox.tsx:9,51-60`
  - `getBoundingBox`: `/home/k3nig/gemini-cli/packages/cli/src/ui/contexts/ScrollProvider.tsx:17,54-58` and `/home/k3nig/gemini-cli/packages/cli/src/ui/hooks/useMouseClick.ts:7,33-40`
- ink-compat resize + repaint traces:
  - `/tmp/ink-compat-patched.trace` contains `frame-skip resize-debounce-pending`.
  - `/tmp/ink-compat-live.trace` contains repeated `idle repaint` entries.
- ink-compat implementation sites:
  - Percent sizing skipped: `packages/ink-compat/src/translation/propsToVNode.ts:245-271`
  - Idle repaint + frame skip: `packages/ink-compat/src/runtime/render.ts:1200-1222`

**Root cause:**
- Primary: percent sizing incompatibility (IC-002) breaks Gemini’s layout invariants.
- Secondary: render/write strategy differs from Ink (IC-008/IC-022/IC-021), increasing flicker and delaying visible repaint during resize bursts.
- Tertiary: Gemini’s reliance on non-official measurement APIs is blocked by missing layout metadata population (IC-010).

**Fix proposal (minimal, Gemini-targeted):**
- P0: implement percent sizing (IC-002) + implement `incrementalRendering`/`maxFps` (IC-008) + populate `__inkLayout` (IC-010).
- Ensure resize flush triggers an immediate frame render without suppressing other renders for long periods (IC-021).
- Add a small Gemini parity fixture suite (representative component subtrees) under `packages/ink-compat/src/__tests__/integration/gemini/`.

**Regression test plan:**
- Add a `renderToString` snapshot test for a simplified Composer subtree that uses nested `<Box width="100%" height="100%">` and asserts output width matches `columns` at multiple sizes.
- Add a live `render()` test with mocked `stdout` that:
  - changes `.columns/.rows`,
  - emits `resize`,
  - asserts at least one render occurs within a bounded number of ticks.

**White composer bar: Hypothesis (medium confidence)**
- Potential contributors:
  - percent sizing collapse producing unintended background fills (IC-002).
  - “style visible on space” behavior combined with full-grid redraw (IC-023) making backgrounds appear as solid bars.
  - resize frame suppression + full-screen clear causing transient partial frames (IC-021/IC-022).
- Missing evidence to confirm:
  - a deterministic capture (Gemini run) with `INK_COMPAT_TRACE_DETAIL_FULL=1` showing:
    - which `fillRect`/`clearTo` ops paint the bar rows, and
    - `cellGridSnapshot` for those rows.

---

### IC-018 — Export surface mismatch (missing Ink exports + options)

**Severity:** Medium

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- Ink exports `useCursor`, `kittyFlags`, `kittyModifiers`. (Ink exports: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/index.ts)
- Ink `RenderOptions` includes `concurrent` and `kittyKeyboard`. (Ink render options: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts)

Local Ink build evidence:
- Exports include `useCursor`, `kittyFlags`, `kittyModifiers`: `packages/bench/node_modules/ink/build/index.d.ts:1-34`.
- `RenderOptions` includes `concurrent` and `kittyKeyboard`: `packages/bench/node_modules/ink/build/render.d.ts:4-86`.

**Actual (ink-compat):**
- ink-compat does not export `useCursor`, `kittyFlags`, `kittyModifiers`.
- ink-compat `RenderOptions` does not include `concurrent` or `kittyKeyboard`.

**Evidence:**
- ink-compat exports list: `packages/ink-compat/src/index.ts:3-39`.
- ink-compat render options type: `packages/ink-compat/src/runtime/render.ts:18-34`.

**Root cause:**
- These APIs and options are not implemented in ink-compat’s runtime/hooks.

**Fix proposal (minimal):**
- Add missing exports with Ink-compatible behavior:
  - Implement `useCursor()` (see IC-020).
  - Implement kitty keyboard protocol support (see IC-012) or document it as intentionally unsupported.
- Extend `RenderOptions` to accept `concurrent` and `kittyKeyboard`:
  - If not implemented, accept and ignore with a clear warning/trace.

**Regression test plan:**
- Add a module surface test that asserts required Ink exports exist and are functions/objects:
  - `useCursor` is a function.
  - `kittyFlags`/`kittyModifiers` are exported.
- Add a type-level test (tsd or `tsc` compile fixture) that `RenderOptions` accepts `concurrent` and `kittyKeyboard`.

---

### IC-019 — `useApp().exit()` / `waitUntilExit()` result value support missing

**Severity:** Medium

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- `useApp().exit(value)` resolves `waitUntilExit()` with `value`, while `exit(new Error('…'))` rejects. (Ink AppContext: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/AppContext.ts)
- `render().waitUntilExit()` resolves with the exit value. (Ink render: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/render.ts)

Local Ink build evidence:
- `exit(errorOrResult?: Error | unknown)` and its semantics: `packages/bench/node_modules/ink/build/components/AppContext.d.ts:1-10`.
- `waitUntilExit` resolves with exit value: `packages/bench/node_modules/ink/build/render.d.ts:97-116`.

**Actual (ink-compat):**
- `exit()` only accepts an optional `Error` and `waitUntilExit()` resolves `Promise<void>`.
- `useApp()` also exposes a non-Ink `rerender` function.

**Evidence:**
- ink-compat `AppProps` narrows exit: `packages/ink-compat/src/index.ts:40-47`.
- Bridge exit promise is `Promise<void>`: `packages/ink-compat/src/runtime/bridge.ts:15-55`.
- `waitUntilExit` wiring: `packages/ink-compat/src/runtime/render.ts:36-42` and `:1634-1651`.

**Root cause:**
- ink-compat’s bridge tracks only “exit happened” and optional error; it does not store a result value.

**Fix proposal (minimal):**
- Change `exit` to accept `unknown | Error` and store the value on the bridge.
- Change `exitPromise`/`waitUntilExit()` to resolve with that stored value and reject on error.
- Align `useApp()` surface with Ink (only `exit`) or clearly mark `rerender` as a non-Ink extension.

**Regression test plan:**
- Add a test app that calls `exit('ok')` and asserts `await waitUntilExit()` resolves to `'ok'`.
- Add a test app that calls `exit(new Error('boom'))` and asserts `waitUntilExit()` rejects.

---

### IC-020 — Cursor + raw mode lifecycle differs; no signal-exit cleanup

**Severity:** High

**Classification:** Confirmed bug (Ink compatibility)

**Expected (Ink):**
- Cursor control via `useCursor()` (IME support). (Ink hook: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-cursor.ts)
- Raw mode is enabled/disabled by hooks (e.g., `useInput`) via `setRawMode(true)` on mount and `setRawMode(false)` on cleanup, not unconditionally at render start. (Ink hook: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/hooks/use-input.ts)
- Ink uses `signal-exit` to unmount and restore terminal state on exit/crash. (Ink runtime: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx)

Local Ink build evidence:
- signal-exit unmount: `packages/bench/node_modules/ink/build/ink.js:7,175-193`.
- raw mode toggling inside `useInput`: `packages/bench/node_modules/ink/build/hooks/use-input.js:28-37`.
- `useCursor` implementation: `packages/bench/node_modules/ink/build/hooks/use-cursor.js:1-28`.

**Actual (ink-compat):**
- Cursor is hidden immediately on `render()` and remains hidden unless `unmount()`/`cleanup()` is called.
- There is no `useCursor()` export/implementation.
- Raw mode is enabled globally if `stdin.setRawMode` exists, regardless of hook usage.
- ink-compat does not install signal-exit/beforeExit cleanup handlers.

**Evidence:**
- Cursor hide/show:
  - `packages/ink-compat/src/runtime/render.ts:1101-1114` (cursor sequences)
  - `packages/ink-compat/src/runtime/render.ts:1113` (unconditional `hideCursor()`)
- Raw mode enabled globally:
  - `packages/ink-compat/src/runtime/render.ts:1452-1462`
- No signal-exit usage in ink-compat runtime:
  - `rg "signal-exit" packages/ink-compat/src/runtime` returns no matches.

**Root cause:**
- ink-compat runtime manages terminal state directly rather than mirroring Ink’s cursor context and hook-driven raw mode management.

**Fix proposal (minimal):**
- Implement `useCursor()` and a cursor context, allowing cursor visibility/positioning to override the default hidden cursor.
- Move raw mode management into `useInput`/`useFocus` with reference counting similar to Ink.
- Add robust exit cleanup (signal-exit) to restore cursor/raw mode and leave alternate buffer even on crash.

**Regression test plan (required):**
- Mock stdin with `setRawMode` spy:
  - Assert raw mode is not enabled unless `useInput` is active.
  - Assert raw mode is disabled on unmount.
- Cursor lifecycle test:
  - Assert cursor show (`ESC[?25h`) is written on unmount, and that `useCursor` can request cursor visibility once implemented.

---

### IC-021 — Resize + repaint behavior diverges from Ink

**Severity:** Medium

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- Ink rerenders on terminal resize (`stdout.on('resize', …)`) and throttles updates based on `maxFps` (unless in debug/screenReader mode). (Ink runtime: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx)

Local Ink build evidence:
- Throttling based on `maxFps` and `incrementalRendering`: `packages/bench/node_modules/ink/build/ink.js:120-143`.
- Resize handling: `packages/bench/node_modules/ink/build/ink.js:187-215`.

**Actual (ink-compat):**
- Resize handling uses:
  - a 16ms debounce timer that suppresses non-forced renders,
  - viewport polling,
  - an idle repaint loop that re-writes output after inactivity.

**Evidence:**
- Frame suppression during resize debounce: `packages/ink-compat/src/runtime/render.ts:1213-1222`.
- Resize debounce flush: `packages/ink-compat/src/runtime/render.ts:1464-1515`.
- Viewport polling: `packages/ink-compat/src/runtime/render.ts:1557-1593`.
- Idle repaint: `packages/ink-compat/src/runtime/render.ts:1200-1211`.
- Trace confirmation:
  - `/tmp/ink-compat-patched.trace` shows `frame-skip resize-debounce-pending`.
  - `/tmp/ink-compat-live.trace` shows repeated `idle repaint` entries.

**Root cause:**
- Renderer is trying to avoid flicker by debouncing, but this differs from Ink’s throttle model and can delay UI updates during active resize.

**Fix proposal (minimal):**
- Replace resize debounce suppression with Ink-like throttling (`maxFps`) and incremental rendering.
- Keep polling only as a fallback if `resize` events are unreliable.

**Regression test plan:**
- Add a test that simulates rapid resize events and asserts that:
  - at least one frame renders per resize burst,
  - UI updates within a bounded timeframe.

---

### IC-022 — Backpressure + write behavior differs from Ink

**Severity:** Medium

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- Ink uses `log-update` and throttling to minimize writes and avoid clearing the entire terminal on each frame. (Ink runtime: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx)

Local Ink build evidence:
- `logUpdate.create(stdout, { incremental })`: `packages/bench/node_modules/ink/build/ink.js:141-160`.

**Actual (ink-compat):**
- Each frame write clears the terminal via `ESC[H ESC[J`.
- When `stdout.write()` returns `false`, ink-compat queues only the latest output and flushes it on `drain`, dropping intermediate frames.

**Evidence:**
- Full clear + redraw and drain queueing: `packages/ink-compat/src/runtime/render.ts:1164-1198`.

**Root cause:**
- Full-frame redraw design, plus a “last output wins” drain queue.

**Fix proposal (minimal):**
- With incremental rendering implemented (IC-008), reduce the need for full clears.
- Ensure render throttling prevents high-frequency queue churn while blocked.

**Regression test plan:**
- Mock stdout where `write()` returns `false` and verify:
  - no uncaught errors,
  - final flushed output equals the last rendered frame.

---

### IC-023 — Performance hotspots + trace instrumentation

**Severity:** Medium

**Classification:** Confirmed observation (performance)

**Expected (Ink):**
- Ink’s runtime throttles renders (maxFps) and can avoid writing unchanged output; it does not clear the entire terminal on every frame. (Ink runtime: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/ink.tsx)

**Actual (ink-compat):**
- ink-compat allocates a full `viewport.rows x viewport.cols` grid of styled cells each frame and then generates a full ANSI string.

**Evidence:**
- Full grid allocation: `packages/ink-compat/src/runtime/render.ts:836-845`.
- Per-row ANSI building and “visible on space” scan: `packages/ink-compat/src/runtime/render.ts:905-937`.

**Root cause:**
- Cell-grid renderer design prioritizes correctness and traceability over write efficiency.

**Fix proposal:**
- Consider a sparse renderer (emit cursor moves + minimal writes) and keep the full grid only for trace/debug builds.
- If keeping the grid, consider a dirty-rectangle/dirty-line optimization to avoid rebuilding unchanged regions.

**Regression test plan:**
- Add benchmark tests (non-blocking) comparing frame time at 80x24 vs 200x60 to catch accidental O(cols*rows) regressions.

---

### IC-024 — Box prop parity gaps (position, per-edge border colors/dim, percent min sizes)

**Severity:** Medium

**Classification:** Confirmed gap (Ink compatibility)

**Expected (Ink):**
- Ink `<Box>` supports:
  - `position?: 'absolute' | 'relative'`
  - per-edge border colors/dim (`borderTopColor`, `borderRightColor`, `borderTopDimColor`, etc.)
  - percent strings for `minWidth`/`minHeight`
  - Source: https://github.com/vadimdemedes/ink/blob/v6.8.0/src/components/Box.tsx and associated types.

Local Ink build evidence:
- `position`, per-edge border colors/dim, and `minWidth?: number | string`: `packages/bench/node_modules/ink/build/components/Box.d.ts:36-116`.

**Actual (ink-compat):**
- `BoxProps` does not include `position`.
- `minWidth` only supports numbers.
- Translation ignores per-edge border colors/dim; it only translates `borderColor` and `borderDimColor`.

**Evidence:**
- ink-compat Box props omit `position` and restrict `minWidth`: `packages/ink-compat/src/components/Box.ts:3-84`.
- Percent min sizes are ignored in translation: `packages/ink-compat/src/translation/propsToVNode.ts:245-271` and `:268-271`.
- Border translation uses only `borderColor`/`borderDimColor`: `packages/ink-compat/src/translation/propsToVNode.ts:345-356`.
- No per-edge border color translation: `rg "borderTopColor" packages/ink-compat/src/translation/propsToVNode.ts` returns no matches.

**Root cause:**
- Box prop coverage in translation is incomplete relative to Ink’s style model.

**Fix proposal:**
- Add missing prop typings and implement translation support for:
  - `position` (needed for Ink `<Static>`/absolute positioning semantics).
  - per-edge border color/dim.
  - percent min sizes.

**Regression test plan:**
- Add translation-level tests ensuring these props are not dropped, and that per-edge border colors affect border style in the translated VNode.

---

## 7. Prioritized Remediation Plan (P0/P1/P2)

P0 (must fix for broad Ink compatibility + Gemini stability)
- IC-002 Percent sizing support (width/height/min sizes/flexBasis percent).
- IC-005 ANSI sanitization (preserve OSC + SGR, strip others).
- IC-006 Unicode width/grapheme handling (continuation cells + grapheme segmentation).
- IC-008 Implement `incrementalRendering` + `maxFps` + `patchConsole` + `isScreenReaderEnabled` (stop full-screen clear on every frame; honor throttling/accessibility).
- IC-004 `<Static>` semantics (separate static output + render-once).
- IC-010 `measureElement()` and layout metadata population.
- IC-020 Cursor/raw mode lifecycle + crash resilience (signal-exit cleanup).
- IC-009 UI-preserving `useStdout().write`/`useStderr().write` (avoid corrupting UI).

P1 (important compatibility improvements)
- IC-001 `<Box>` default direction row (and align test suite).
- IC-003 `<Transform>` correctness (newline preservation + post-layout application).
- IC-007 `render()` overload + per-stdout instance reuse.
- IC-011 focus hook signature/semantics alignment.
- IC-021 Resize scheduling alignment (avoid long frame suppression; harmonize with `maxFps` throttling).
- IC-022 Backpressure/write strategy improvements (reduce full clears; handle drain more like Ink).
- IC-018 Export surface parity (`useCursor`, kitty exports) and `RenderOptions` fields (`concurrent`, `kittyKeyboard`).
- IC-024 Box prop parity gaps (`position`, per-edge border colors/dim, percent min sizes).

P2 (polish + edge cases)
- IC-019 Exit result values (`exit(value)` / `waitUntilExit()` resolves with value).
- IC-014 Color depth/no-color behavior + `ansi256(...)` parsing.
- IC-012 Input parsing completeness + kitty protocol.
- IC-013 Accessibility props support.
- IC-015 wrap-reverse and default alignItems parity.
- IC-023 Performance optimizations (sparse rendering, dirty-line tracking) and trace overhead tuning.

---

## 8. Quick Wins (Low-Risk Fixes)

- Fix IC-001 default `flexDirection` to `row` (single-line change), and update IC-016 test.
- Fix IC-003 newline loss by teaching `vnodeToText()` to reintroduce newlines for multiline text nodes.
- Make `useIsScreenReaderEnabled()` honor `RenderOptions.isScreenReaderEnabled` and `process.env.INK_SCREEN_READER` (even if full screen reader rendering isn’t implemented yet).
- Add parsing support for `ansi256(n)` in `parseColor()` (IC-014).
- Extend ink-compat `RenderOptions` to accept `concurrent` and `kittyKeyboard` (IC-018), even if initially ignored with a clear warning/trace.

---

## 9. Open Questions / Additional Instrumentation Needed

1. **White composer bar root cause**
   - Need a deterministic repro in Gemini with `INK_COMPAT_TRACE_DETAIL_FULL=1`.
   - Capture `cellGridSnapshot` + `renderOps` around the bar rows (render.ts already has deep trace hooks).

2. **Percent sizing design**
   - Should percent sizing be implemented in Rezi core layout primitives used by ink-compat, or shimmed in ink-compat with a two-pass measure?

3. **Static output model**
   - Should static output be implemented as a separate render channel (Ink-like), or emulated by rendering static subtree into the same buffer but pinned?

4. **Render strategy**
   - If incremental rendering is implemented, what minimal diff algorithm is acceptable to match Ink’s log-update semantics?

---

## 10. Appendix (Commands Run, Logs, Links)

### Commands run

- Verify toolchain:
  - `node -v` => `v20.19.5`
  - `npm -v` => `10.8.2`

- Verify Ink version:
  - `npm view ink version` => `6.8.0`

- Run ink-compat tests:
  - `npm -w @rezi-ui/ink-compat test > /tmp/ink-compat-test.log 2>&1`

- Deterministic Ink vs ink-compat repros (renderToString):
  - Generated `/tmp/ink-compat-audit-repros.log`

### Pre-existing failing tests (as-is)

From `/tmp/ink-compat-test.log`:
- `focus: Tab moves to next button` (fails)
- `focus: Tab cycles through all buttons` (fails)
- `focus: Shift+Tab moves backwards` (fails)
- `full-app: log shows numbered entries via Transform` (fails)
- `layout: Transform adds line numbers` (fails)

### Logs / traces referenced

- Test failures: `/tmp/ink-compat-test.log`
- Ink vs ink-compat repro output: `/tmp/ink-compat-audit-repros.log`
- Resize tracing: `/tmp/ink-compat-resize.trace`
- Live run tracing: `/tmp/ink-compat-live.trace`
- Patched run tracing (frame-skip during resize): `/tmp/ink-compat-patched.trace`

### Selected grep evidence from Gemini CLI

- Gemini render options include `incrementalRendering`, `alternateBuffer`, `isScreenReaderEnabled`, `patchConsole: false`:
  - `/home/k3nig/gemini-cli/packages/cli/src/gemini.tsx:288-299`
- Widespread percent sizing usage:
  - `rg -n "width=\"100%\"|height=\"100%\"" /home/k3nig/gemini-cli/packages/cli/src` (many hits)
- Non-official APIs imported from `ink`:
  - `getBoundingBox`, `ResizeObserver`, `getInnerHeight`, `getScrollHeight` used in scroll/mouse/layout helpers.

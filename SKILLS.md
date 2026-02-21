# Rezi AI Skills Reference

Repeatable recipes for AI agents working with Rezi. Each skill includes trigger conditions, implementation steps, and verification criteria.

---

## Skill 1: Add a New Widget

**When:** User asks to add a new widget type to the framework.

**Steps:**
1. Add props type to `packages/core/src/widgets/types.ts` (use the `Readonly<{...}>` pattern).
2. Add factory function to `packages/core/src/widgets/ui.ts` (with JSDoc + `@example`).
3. Add VNode kind entry to the `VNode` discriminated union in `types.ts`.
4. Add layout handler in `packages/core/src/layout/kinds/` (`leaf.ts` for non-containers, `box.ts`/`stack.ts` for containers, `collections.ts` for data widgets, `overlays.ts` for layered).
5. Add render handler in `packages/core/src/renderer/renderToDrawlist/widgets/` (`basic.ts`, `containers.ts`, `collections.ts`, `editors.ts`, `overlays.ts`, `navigation.ts`, or `files.ts`).
6. If JSX support is needed, add JSX component wrapper in `packages/jsx/src/components.ts`.
7. Export both props type and factory from `packages/core/src/index.ts`.
8. Write tests in `packages/core/src/widgets/__tests__/`.
9. Add docs in `docs/widgets/{widget-name}.md`.

**Verify:** `node scripts/run-tests.mjs` passes; widget + props exported from index; renders correctly via `createTestRenderer`.

---

## Skill 2: Create a New Screen

**When:** User asks to add a screen/page to a Rezi app.

**Steps:**
1. Create `src/screens/{screen-name}.ts` with signature `(state: State) => VNode`.
2. Use `ui.column()` or `ui.row()` as root container.
3. If using the router, add a route definition (see Skill 10).
4. Add keybindings for navigation in `src/helpers/keybindings.ts`.
5. Wire into `main.ts` via the router or a view switch.

**Verify:** Screen renders without errors; navigation keybindings work; state types updated if needed.

---

## Skill 3: Set Up Keybindings

**When:** User needs keyboard shortcuts.

**Steps:**
1. Define commands using `app.keys()`:
   ```typescript
   app.keys({
     "q": () => shutdown(),
     "Ctrl+s": () => save(),
     "g g": () => scrollToTop(),  // chord binding
   });
   ```
2. For modal modes: `app.keys("edit-mode", { "Escape": () => exitEditMode() })`.
3. Add `ui.keybindingHelp()` widget for discoverability.

**Verify:** Keys trigger correct actions; no conflicts in same mode; chords complete correctly.

---

## Skill 4: Add a Data Table

**When:** User needs tabular data display.

**Steps:**
1. Use the `useTable()` hook:
   ```typescript
   const table = useTable(ctx, {
     rows: data,
     columns: [
       { key: "name", header: "Name", flex: 1 },
       { key: "size", header: "Size", width: 10, align: "right" },
     ],
     getRowKey: (row) => row.id,
     selectable: "multi",
   });
   return ui.table(table.props);
   ```
2. Handle selection via `table.selection`.
3. Handle sorting via `table.sortColumn` / `table.sortDirection`.

**Verify:** Correct columns render; selection updates; sorting works both directions.

---

## Skill 5: Add Modal Dialogs

**When:** User needs overlay dialogs.

**Steps:**
1. Use `useModalStack()` for lifecycle management:
   ```typescript
   const modals = useModalStack(ctx);
   modals.push("confirm", { title: "Confirm", content: body, onClose: () => modals.pop() });
   ```
2. Include in view: `return ui.layers([mainContent, ...modals.render()])`.
3. Or use `ui.modal()` directly with a state-controlled `open` flag.

**Verify:** Modal opens/closes; focus traps within modal; focus returns on close.

---

## Skill 6: Set Up Forms

**When:** User needs form input handling.

**Steps:**
1. Use the `useForm()` hook:
   ```typescript
   const form = useForm(ctx, {
     initialValues: { name: "", email: "" },
     validate: (values) => {
       const errors: Record<string, string> = {};
       if (!values.name) errors.name = "Required";
       return errors;
     },
     onSubmit: async (values) => { /* handle */ },
   });
   ```
2. Bind fields: `ui.input({ ...form.bind("name") })`.
3. Use `ui.field()` for labeled fields with error display.

**Verify:** Validation errors display; submission works; touched/dirty state tracked.

---

## Skill 7: Write Tests

**When:** Need to test Rezi components or app logic.

**Steps:**
1. Create test file in the appropriate `__tests__/` directory.
2. Use `createTestRenderer()`:
   ```typescript
   import { describe, it, assert } from "node:test";
   import { createTestRenderer, ui } from "@rezi-ui/core";
   describe("MyWidget", () => {
     it("renders correctly", () => {
       const r = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
       const result = r.render(ui.text("hello"));
       assert.ok(result.findText("hello"));
     });
   });
   ```
3. State tests: test reducer functions directly.
4. Keybinding tests: test resolver functions directly.
5. Use `result.toText()` for snapshot-style assertions.

**Run:** `node scripts/run-tests.mjs` (full suite) or `node --test path/to/test.ts` (single file).

---

## Skill 8: Debug Rendering Issues

**When:** UI does not look right or has layout problems.

**Steps:**
1. Enable profiling: `REZI_PERF=1 REZI_PERF_DETAIL=1`.
2. Check VNode tree structure -- ensure no missing children.
3. Check widget IDs -- must be unique across the entire tree.
4. Check nesting depth -- warning at 200, fatal at 500.
5. Check `key` props on list items -- missing keys cause full re-render.
6. Use `createTestRenderer()` to capture and inspect output; use `result.findById()` to locate nodes.
7. Review layout props: `width`, `height`, `flex`, `p`, `gap`, `align`.

---

## Skill 9: Performance Profiling

**When:** App feels slow or frames drop.

**Steps:**
1. Set `REZI_PERF=1 REZI_PERF_DETAIL=1` environment variables.
2. Run app and observe phase timings (view, commit, layout, render, build).
3. Common fixes:
   - `useMemo()` for expensive view computations.
   - `key` props on list items for stable reconciliation.
   - Reduce nesting depth.
   - `virtualList` for large data sets.
4. Systematic profiling:
   ```bash
   npx tsx packages/bench/src/profile-phases.ts
   npx tsx packages/bench/src/profile-construction.ts
   ```

---

## Skill 10: Add Routing

**When:** App needs multiple pages/screens.

**Steps:**
1. Define routes with optional guards and nested children:
   ```typescript
   const routes = {
     home: { view: (state) => HomeScreen(state) },
     settings: {
       view: (state) => SettingsScreen(state),
       guard: (from, to, meta) => {
         if (!meta.isAuthenticated) return { redirect: "home" };
         return { allow: true };
       },
     },
     dashboard: {
       view: (state, context) => ui.column([Header(state), context.outlet]),
       children: {
         overview: { view: (state) => OverviewPanel(state) },
         stats: { view: (state) => StatsPanel(state) },
       },
     },
   };
   ```
2. Pass to app: `const app = createApp({ routes, initialRoute: "home" })`.
3. Navigate: `app.router.navigate("settings")`.
4. Nested routes render via `context.outlet`.

**Verify:** Correct screens render; guards block unauthorized access; nested outlet renders children.

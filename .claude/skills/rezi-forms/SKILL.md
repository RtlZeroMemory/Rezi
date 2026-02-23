---
name: rezi-forms
description: Set up form input handling with validation and submission. Use when building forms with inputs, selects, checkboxes, etc.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[form-name]"
metadata:
  short-description: Set up forms
---

## When to use

Use this skill when:

- Building forms with multiple inputs
- Need field validation and error display
- Handling form submission with loading states

## Source of truth

- `packages/core/src/forms/useForm.ts` — `useForm()` hook
- `packages/core/src/widgets/types.ts` — `InputProps`, `FieldProps`, `CheckboxProps`, `SelectProps`
- `packages/core/src/widgets/ui.ts` — `ui.input()`, `ui.field()`, `ui.checkbox()`, `ui.select()`
- `packages/core/src/ui/recipes.ts` — `recipe.input()`, `recipe.button()`, `recipe.select()` for design-system styling

## Steps

1. **Use the `useForm()` hook** inside a `defineWidget`:
   ```typescript
   import { defineWidget, ui, useForm } from "@rezi-ui/core";

   const MyForm = defineWidget<{ onSubmit: (v: Values) => void }>((props, ctx) => {
     const form = useForm(ctx, {
       initialValues: { name: "", email: "" },
       validate: (values) => {
         const errors: Record<string, string> = {};
         if (!values.name) errors.name = "Required";
         if (!values.email.includes("@")) errors.email = "Invalid email";
         return errors;
       },
       onSubmit: async (values) => props.onSubmit(values),
     });

     return ui.column({ gap: 1 }, [
       ui.field({
         label: "Name",
         error: form.errors.name,
         children: ui.input({ id: "field-name", ...form.bind("name") }),
       }),
       ui.field({
         label: "Email",
         error: form.errors.email,
         children: ui.input({ id: "field-email", ...form.bind("email") }),
       }),
       ui.button({ id: "submit", label: "Submit", intent: "primary", onPress: form.submit }),
     ]);
   }, { name: "MyForm" });
   ```

2. **Bind fields** using `form.bind("fieldName")` — returns `{ value, onChange }` props

3. **Use `ui.field()`** to wrap inputs with labels and error display

4. **Access form state** via `form.errors`, `form.touched`, `form.dirty`, `form.submitting`

5. **Use `ctx.useReducer()` when form-local state is complex** (multi-step state machines, wizard progress, async side-channel flags):
   - Keep the form values in `useForm(...)`
   - Keep complex UI workflow state in a local reducer with typed actions
   - Dispatch reducer actions from field callbacks and submit handlers
   ```typescript
   const form = useForm(ctx, { initialValues: { email: "" } });
   const [wizardState, dispatch] = ctx.useReducer(wizardReducer, { step: 1, busy: false });

   ui.input({
     id: "email",
     ...form.bind("email"),
     onChange: (next) => {
       form.setValue("email", next);
       dispatch({ type: "fieldChanged", field: "email" });
     },
   });
   ```

## Design system note

Inputs are recipe-styled by default when semantic color tokens are available (for example via a `ThemeDefinition` preset).
Manual overrides merge on top via the same `mergeTextStyle(baseStyle, ownStyle)` pattern used by the renderer.
Use manual `style` only for targeted overrides (merged on top of recipe output).

## Verification

- Validation errors display next to fields
- Submission works and calls `onSubmit`
- Touched/dirty state tracked correctly

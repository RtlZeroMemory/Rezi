# Form Validation

Implementing input validation with error display in Rezi forms.

## Problem

You need to validate user input and display appropriate error messages before submitting a form.

## Solution

Use controlled inputs with validation functions that update error state.

## Complete Example

This is a complete, runnable example (save as `form.ts` and run with `npx tsx form.ts`):

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type FormState = {
  email: string;
  password: string;
  errors: { email?: string; password?: string };
  touched: { email: boolean; password: boolean };
};

function validateEmail(email: string): string | undefined {
  if (!email) return "Email is required";
  if (!email.includes("@")) return "Invalid email format";
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return undefined;
}

const app = createNodeApp<FormState>({
    initialState: {
    email: "",
    password: "",
    errors: {},
    touched: { email: false, password: false },
  },
});

function validateAll(s: FormState): FormState["errors"] {
  return {
    email: validateEmail(s.email),
    password: validatePassword(s.password),
  };
}

app.view((state) => {
  const errors = state.errors;
  const touched = state.touched;
  const canSubmit = !errors.email && !errors.password && state.email.length > 0 && state.password.length > 0;

  return ui.column({ gap: 1, p: 1 }, [
    ui.text("Sign Up", { style: { bold: true } }),

    ui.field({
      label: "Email",
      required: true,
      error: touched.email ? errors.email : undefined,
      children: ui.input({
        id: "email",
        value: state.email,
        onInput: (value) =>
          app.update((s) => {
            const next = { ...s, email: value };
            return { ...next, errors: validateAll(next) };
          }),
        onBlur: () => app.update((s) => ({ ...s, touched: { ...s.touched, email: true } })),
      }),
    }),

    ui.field({
      label: "Password",
      required: true,
      hint: "At least 8 characters",
      error: touched.password ? errors.password : undefined,
      children: ui.input({
        id: "password",
        value: state.password,
        onInput: (value) =>
          app.update((s) => {
            const next = { ...s, password: value };
            return { ...next, errors: validateAll(next) };
          }),
        onBlur: () =>
          app.update((s) => ({ ...s, touched: { ...s.touched, password: true } })),
      }),
    }),

    ui.row({ gap: 1, justify: "end" }, [
      ui.button({ id: "submit", label: "Create account", disabled: !canSubmit }),
    ]),

    !canSubmit &&
      ui.text("Fix validation errors to enable submission.", { style: { fg: rgb(255, 110, 110) } }),
  ]);
});

app.keys({
  "ctrl+c": () => app.stop(),
  q: () => app.stop(),
});

await app.start();
```

## Explanation

- Inputs are **controlled**: `value` comes from state and `onInput` updates state.
- Validation runs inside the update function so it stays deterministic and doesn’t run during render.
- `touched` is set on `onBlur` so errors only display after the user leaves a field.

## `useForm` Advanced Features

`@rezi-ui/core` also provides a richer `useForm` API for more complex flows:

- **Field arrays** with deterministic keys and state-preserving mutations:
  - `const fields = form.useFieldArray("items")`
  - `fields.append(item)`, `fields.remove(index)`, `fields.move(from, to)`
- **Wizard flow** with step gates:
  - configure `wizard.steps` in `useForm` options
  - navigate with `form.nextStep()`, `form.previousStep()`, `form.goToStep(index)`
  - backward navigation does not re-run validation
- **Form-level disabled/readOnly** with per-field overrides:
  - `form.setDisabled(true)` / `form.setReadOnly(true)`
  - `form.setFieldDisabled("name", false)` and `form.setFieldReadOnly("name", false)` override form-level flags

### Example: Wizard + Field Array

```typescript
import { useForm } from "@rezi-ui/core/forms";

type Values = {
  name: string;
  emails: string[];
};

const form = useForm(ctx, {
  initialValues: { name: "", emails: [""] },
  validate: (v) => ({
    name: v.name ? undefined : "Required",
    emails: v.emails.map((email) => (email.includes("@") ? undefined : "Invalid email")),
  }),
  wizard: {
    steps: [
      { id: "profile", fields: ["name"] },
      { id: "emails", fields: ["emails"] },
    ],
  },
  onSubmit: (values) => {
    // handle values
  },
});

const emails = form.useFieldArray("emails");
emails.append("");
```

## Related

- [Input](../widgets/input.md) - Text input widget
- [Field](../widgets/field.md) - Form field wrapper

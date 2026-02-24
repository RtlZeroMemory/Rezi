/**
 * packages/core/src/forms/__tests__/useForm.test.ts — Tests for useForm hook.
 *
 * @see docs/recipes/form-validation.md (GitHub issue #119)
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import type { WidgetContext } from "../../widgets/composition.js";
import type { UseFormOptions, UseFormReturn } from "../types.js";
import { useForm } from "../useForm.js";
import {
  createDebouncedAsyncValidator,
  isValidationClean,
  mergeValidationErrors,
  runFieldValidation,
  runSyncValidation,
} from "../validation.js";

type TestFormValues = {
  name: string;
  email: string;
  age: number;
  remember: boolean;
};

/**
 * Create a mock widget context for testing hooks.
 * This suite intentionally tests useForm's hook/runtime behavior without renderer plumbing.
 */
function createTestContext<State = void>(): {
  render: <T extends Record<string, unknown>>(options: UseFormOptions<T>) => UseFormReturn<T>;
  unmount: () => void;
  getInvalidateCount: () => number;
} {
  const registry = createCompositeInstanceRegistry();
  const instanceId = 1;
  const widgetKey = "TestWidget";
  registry.create(instanceId, widgetKey);

  let invalidateCount = 0;

  return {
    render: <T extends Record<string, unknown>>(options: UseFormOptions<T>): UseFormReturn<T> => {
      const state = registry.get(instanceId);
      if (!state) {
        throw new Error("test harness: instance missing");
      }

      registry.beginRender(instanceId);
      const hookCtx = createHookContext(state, () => {
        invalidateCount++;
        registry.invalidate(instanceId);
      });

      const ctx: WidgetContext<State> = Object.freeze({
        id: (suffix: string) => `${widgetKey}_${instanceId}_${suffix}`,
        useState: hookCtx.useState,
        useRef: hookCtx.useRef,
        useEffect: hookCtx.useEffect,
        useMemo: hookCtx.useMemo,
        useCallback: hookCtx.useCallback,
        useAppState: <U>(_selector: (s: State) => U): U => undefined as U,
        useTheme: () => null,
        invalidate: () => {
          invalidateCount++;
          registry.invalidate(instanceId);
        },
      });

      const form = useForm(ctx as unknown as WidgetContext<void>, options) as UseFormReturn<T>;
      const effects = registry.endRender(instanceId);
      runPendingEffects(effects);
      return form;
    },
    unmount: () => {
      registry.incrementGeneration(instanceId);
      registry.delete(instanceId);
    },
    getInvalidateCount: () => invalidateCount,
  };
}

describe("useForm hook", () => {
  test("initial values are set correctly", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestFormValues> = {
      initialValues: { name: "John", email: "", age: 0, remember: false },
      onSubmit: () => {},
    };

    const form = h.render(options);

    assert.equal(form.values.name, "John");
    assert.equal(form.values.email, "");
    assert.equal(form.values.age, 0);
    assert.equal(form.values.remember, false);
  });

  test("handleChange updates field value", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "John" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.handleChange("name")("Jane");
    form = h.render(options);
    assert.equal(form.values.name, "Jane");
  });

  test("setFieldValue updates specific field", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string; email: string }> = {
      initialValues: { name: "John", email: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setFieldValue("email", "john@example.com");
    form = h.render(options);
    assert.equal(form.values.email, "john@example.com");
  });

  test("bind returns spread-ready input props and updates field state", () => {
    const h = createTestContext();
    const options: UseFormOptions<{ email: string }> = {
      initialValues: { email: "" },
      validate: (values) => (values.email.includes("@") ? {} : { email: "Invalid email" }),
      onSubmit: () => {},
    };

    let form = h.render(options);
    const binding = form.bind("email");
    assert.equal(typeof binding.id, "string");
    assert.equal(binding.value, "");
    assert.equal(binding.disabled, false);

    binding.onInput?.("ada", 3);
    form = h.render(options);
    assert.equal(form.values.email, "ada");

    form.bind("email").onBlur?.();
    form = h.render(options);
    assert.equal(form.touched.email, true);
    assert.equal(form.errors.email, "Invalid email");

    const custom = form.bind("email", { id: "custom-email" });
    assert.equal(custom.id, "custom-email");
  });

  test("bind disables input when field is not editable", () => {
    const h = createTestContext();
    const options: UseFormOptions<{ email: string }> = {
      initialValues: { email: "a@example.com" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    assert.equal(form.bind("email").disabled, false);

    form.setReadOnly(true);
    form = h.render(options);
    assert.equal(form.bind("email").disabled, true);

    form.setFieldReadOnly("email", false);
    form = h.render(options);
    assert.equal(form.bind("email").disabled, false);

    form.setDisabled(true);
    form = h.render(options);
    assert.equal(form.bind("email").disabled, true);
  });

  test("field returns a wired field wrapper with input child", () => {
    const h = createTestContext();
    const options: UseFormOptions<{ email: string }> = {
      initialValues: { email: "" },
      validate: (values) => (values.email ? {} : { email: "Required" }),
      onSubmit: () => {},
    };

    let form = h.render(options);
    let vnode = form.field("email", {
      label: "Email",
      required: true,
      hint: "Use your work email",
      style: { italic: true },
      disabled: true,
    });
    assert.equal(vnode.kind, "field");
    if (vnode.kind === "field") {
      assert.equal(vnode.props.label, "Email");
      assert.equal(vnode.props.required, true);
      assert.equal(vnode.props.hint, "Use your work email");
      assert.equal(vnode.props.error, undefined);
      assert.equal(vnode.children.length, 1);

      const child = vnode.children[0];
      assert.equal(child?.kind, "input");
      if (child?.kind === "input") {
        assert.equal(child.props.value, "");
        assert.deepEqual(child.props.style, { italic: true });
        assert.equal(child.props.disabled, true);
        child.props.onBlur?.();
      }
    }

    form = h.render(options);
    vnode = form.field("email", { label: "Email" });
    if (vnode.kind === "field") {
      assert.equal(vnode.props.error, "Required");
      const child = vnode.children[0];
      if (child && child.kind === "input") {
        child.props.onInput?.("ada@example.com", 15);
      }
    }

    form = h.render(options);
    assert.equal(form.values.email, "ada@example.com");

    const fallback = form.field("email");
    if (fallback.kind === "field") {
      assert.equal(fallback.props.label, "email");
    }

    form.setDisabled(true);
    form = h.render(options);
    const forceEnabled = form.field("email", { disabled: false });
    if (forceEnabled.kind === "field") {
      const child = forceEnabled.children[0];
      if (child && child.kind === "input") {
        assert.equal(child.props.disabled, false);
      }
    }
  });

  test("validation on blur when validateOnBlur is true (default)", () => {
    const h = createTestContext();

    const validate = (v: { name: string }) => {
      const errors: Partial<Record<keyof typeof v, string>> = {};
      if (!v.name) errors.name = "Required";
      return errors;
    };

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      validate,
      onSubmit: () => {},
    };

    let form = h.render(options);

    // Before blur, no errors shown
    assert.equal(form.touched.name, undefined);

    // Trigger blur
    form.handleBlur("name")();
    form = h.render(options);
    assert.equal(form.touched.name, true);
    assert.equal(form.errors.name, "Required");
  });

  test("isValid is false when there are validation errors", () => {
    const h = createTestContext();

    const validate = (v: { name: string }) => {
      const errors: Partial<Record<keyof typeof v, string>> = {};
      if (!v.name) errors.name = "Required";
      return errors;
    };

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      validate,
      validateOnChange: true,
      onSubmit: () => {},
    };

    let form = h.render(options);
    const errors = form.validateForm();
    form = h.render(options);
    assert.equal(form.isValid, false);
    assert.equal(errors.name, "Required");
  });

  test("dirty tracking detects changes from initial values", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "John" },
      onSubmit: () => {},
    };

    let form = h.render(options);

    // Initially not dirty
    assert.equal(form.isDirty, false);
    assert.equal(form.dirty.name, undefined);

    // Change value
    form.setFieldValue("name", "Jane");
    form = h.render(options);
    assert.equal(form.isDirty, true);
    assert.equal(form.dirty.name, true);
  });

  test("dirty tracking remains true when array value shrinks with unchanged prefix", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ items: string[] }> = {
      initialValues: { items: ["a", "b"] },
      onSubmit: () => {},
    };

    let form = h.render(options);
    assert.equal(form.isDirty, false);

    form.setFieldValue("items", ["a"]);
    form = h.render(options);

    assert.equal(form.isDirty, true);
    assert.equal(form.dirty.items, true);
  });

  test("deep-clones initial values for nested dirty tracking and reference isolation", () => {
    const h = createTestContext();
    const sourceInitial = { profile: { name: "A" } };
    const options: UseFormOptions<{ profile: { name: string } }> = {
      initialValues: sourceInitial,
      onSubmit: () => {},
    };

    let form = h.render(options);
    sourceInitial.profile.name = "Mutated outside";
    form = h.render(options);
    assert.equal(form.values.profile.name, "A");

    form.setFieldValue("profile", { name: "B" });
    form = h.render(options);
    assert.equal(form.dirty.profile, true);
  });

  test("handleSubmit does not call onSubmit when invalid", () => {
    const h = createTestContext();

    let submitted = false;

    const validate = (v: { name: string }) => {
      const errors: Partial<Record<keyof typeof v, string>> = {};
      if (!v.name) errors.name = "Required";
      return errors;
    };

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      validate,
      onSubmit: () => {
        submitted = true;
      },
    };

    const form = h.render(options);

    // Try to submit invalid form
    form.handleSubmit();

    // onSubmit should not be called
    assert.equal(submitted, false);
  });

  test("reset returns form to initial values", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "John" },
      onSubmit: () => {},
    };

    let form = h.render(options);

    // Change value
    form.setFieldValue("name", "Jane");

    // Reset
    form.reset();
    form = h.render(options);
    assert.equal(form.values.name, "John");
    assert.equal(form.isDirty, false);
  });

  test("setFieldError sets specific field error", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setFieldError("name", "Custom error");
    form = h.render(options);
    assert.equal(form.errors.name, "Custom error");
  });

  test("setFieldTouched marks field as touched", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setFieldTouched("name", true);
    form = h.render(options);
    assert.equal(form.touched.name, true);
  });

  test("validateField validates single field", () => {
    const h = createTestContext();

    const validate = (v: { name: string; email: string }) => {
      const errors: Partial<Record<keyof typeof v, string>> = {};
      if (!v.name) errors.name = "Name required";
      if (!v.email) errors.email = "Email required";
      return errors;
    };

    const options: UseFormOptions<{ name: string; email: string }> = {
      initialValues: { name: "", email: "" },
      validate,
      onSubmit: () => {},
    };

    let form = h.render(options);
    const error = form.validateField("name");
    form = h.render(options);

    assert.equal(error, "Name required");
    assert.equal(form.errors.name, "Name required");
  });

  test("submitCount increments on each submit attempt", () => {
    const h = createTestContext();

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "John" },
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.submitCount, 0);

    form.handleSubmit();
    form = h.render(options);
    assert.equal(form.submitCount, 1);
  });

  test("async validation ignores stale results (race-safe)", async () => {
    const h = createTestContext();
    const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      validateOnChange: true,
      validateAsyncDebounce: 0,
      validateAsync: async (v) => {
        if (v.name === "a") {
          await delay(10);
          return { name: "bad-a" };
        }
        await delay(1);
        return {};
      },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setFieldValue("name", "a");
    await delay(0); // allow debounce timer to start first async validation

    form.setFieldValue("name", "b");
    await delay(25);

    form = h.render(options);
    assert.equal(form.values.name, "b");
    assert.equal(form.errors.name, undefined);
  });

  test("async validation is cancelled on unmount (no post-unmount invalidation)", async () => {
    const h = createTestContext();
    const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const options: UseFormOptions<{ name: string }> = {
      initialValues: { name: "" },
      validateOnChange: true,
      validateAsyncDebounce: 0,
      validateAsync: async (v) => {
        await delay(5);
        return v.name ? { name: "err" } : {};
      },
      onSubmit: () => {},
    };

    const form = h.render(options);
    const before = h.getInvalidateCount();
    form.setFieldValue("name", "x");
    const afterSetValue = h.getInvalidateCount();
    h.unmount();
    await delay(20);
    // Synchronous setState invalidation is expected; ensure async validation does not fire post-unmount.
    assert.equal(afterSetValue, before + 1);
    assert.equal(h.getInvalidateCount(), afterSetValue);
  });
});

describe("validation utilities", () => {
  test("runSyncValidation returns errors from validator", () => {
    const validate = (v: { name: string }) => {
      if (!v.name) return { name: "Required" };
      return {};
    };

    const errors = runSyncValidation({ name: "" }, validate);
    assert.equal(errors.name, "Required");

    const noErrors = runSyncValidation({ name: "John" }, validate);
    assert.equal(noErrors.name, undefined);
  });

  test("runSyncValidation returns empty object when no validator", () => {
    const errors = runSyncValidation({ name: "" }, undefined);
    assert.deepEqual(errors, {});
  });

  test("runFieldValidation returns single field error", () => {
    const validate = (v: { name: string; email: string }) => {
      const errors: Partial<Record<keyof typeof v, string>> = {};
      if (!v.name) errors.name = "Name required";
      if (!v.email) errors.email = "Email required";
      return errors;
    };

    const nameError = runFieldValidation({ name: "", email: "" }, "name", validate);
    assert.equal(nameError, "Name required");

    const emailError = runFieldValidation({ name: "", email: "" }, "email", validate);
    assert.equal(emailError, "Email required");
  });

  test("isValidationClean returns true for empty errors", () => {
    assert.equal(isValidationClean<{ name: string }>({}), true);
    assert.equal(isValidationClean<{ name: string }>({ name: "" }), true);
  });

  test("isValidationClean returns false when errors exist", () => {
    assert.equal(isValidationClean<{ name: string }>({ name: "Required" }), false);
  });

  test("mergeValidationErrors combines sync and async errors", () => {
    type FormValues = { name: string; email: string };
    const syncErrors: Partial<Record<keyof FormValues, string>> = { name: "Sync error" };
    const asyncErrors: Partial<Record<keyof FormValues, string>> = { email: "Async error" };

    const merged = mergeValidationErrors<FormValues>(syncErrors, asyncErrors);

    assert.equal(merged.name, "Sync error");
    assert.equal(merged.email, "Async error");
  });

  test("mergeValidationErrors async errors override sync errors", () => {
    const syncErrors = { name: "Sync error" };
    const asyncErrors = { name: "Async error" };

    const merged = mergeValidationErrors(syncErrors, asyncErrors);

    assert.equal(merged.name, "Async error");
  });

  test("createDebouncedAsyncValidator debounces calls", async () => {
    let callCount = 0;
    let lastResult: Record<string, string> = {};

    const validator = createDebouncedAsyncValidator<{ name: string }>(
      async (values) => {
        callCount++;
        if (!values.name) return { name: "Required" };
        return {};
      },
      50,
      (errors) => {
        lastResult = errors as Record<string, string>;
      },
    );

    // Multiple rapid calls
    validator.run({ name: "" });
    validator.run({ name: "a" });
    validator.run({ name: "ab" });

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should only have one call due to debouncing
    assert.equal(callCount, 1);
  });

  test("createDebouncedAsyncValidator cancel stops pending validation", async () => {
    let resultReceived = false;

    const validator = createDebouncedAsyncValidator<{ name: string }>(
      async () => {
        return { name: "Error" };
      },
      50,
      () => {
        resultReceived = true;
      },
    );

    validator.run({ name: "" });
    validator.cancel();

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(resultReceived, false);
  });
});

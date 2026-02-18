/**
 * packages/core/src/forms/__tests__/form.disabled.test.ts
 *
 * Focused coverage for disabled/readOnly form behavior.
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

type TestValues = {
  name: string;
  email: string;
  age: number;
};

function createTestContext<State = void>(): {
  render: <T extends Record<string, unknown>>(options: UseFormOptions<T>) => UseFormReturn<T>;
  unmount: () => void;
} {
  const registry = createCompositeInstanceRegistry();
  const instanceId = 1;
  const widgetKey = "TestWidget";
  registry.create(instanceId, widgetKey);

  return {
    render: <T extends Record<string, unknown>>(options: UseFormOptions<T>): UseFormReturn<T> => {
      const state = registry.get(instanceId);
      if (!state) {
        throw new Error("test harness: instance missing");
      }

      registry.beginRender(instanceId);
      const hookCtx = createHookContext(state, () => {
        registry.invalidate(instanceId);
      });

      const ctx: WidgetContext<State> = Object.freeze({
        id: (suffix: string) => `${widgetKey}_${instanceId}_${suffix}`,
        useState: hookCtx.useState,
        useRef: hookCtx.useRef,
        useEffect: hookCtx.useEffect,
        useAppState: <U>(_selector: (s: State) => U): U => undefined as U,
        invalidate: () => {
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
  };
}

describe("useForm disabled/readOnly behavior", () => {
  test("setDisabled(true) disables all fields and blocks edits", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setDisabled(true);
    form = h.render(options);

    assert.equal(form.disabled, true);
    assert.equal(form.isFieldDisabled("name"), true);
    assert.equal(form.isFieldDisabled("email"), true);
    assert.equal(form.isFieldDisabled("age"), true);

    form.setFieldValue("name", "Jane");
    form.handleChange("email")("jane@example.com");
    form.setFieldValue("age", 35);
    form = h.render(options);

    assert.equal(form.values.name, "John");
    assert.equal(form.values.email, "john@example.com");
    assert.equal(form.values.age, 30);
  });

  test("setDisabled toggles off and restores editability", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setDisabled(true);
    form = h.render(options);
    assert.equal(form.isFieldDisabled("name"), true);

    form.setFieldValue("name", "Blocked");
    form = h.render(options);
    assert.equal(form.values.name, "John");

    form.setDisabled(false);
    form = h.render(options);
    assert.equal(form.disabled, false);
    assert.equal(form.isFieldDisabled("name"), false);

    form.setFieldValue("name", "Allowed");
    form = h.render(options);
    assert.equal(form.values.name, "Allowed");
  });

  test("fieldDisabled=false overrides form disabled=true for a field", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      disabled: true,
      fieldDisabled: { email: false },
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.isFieldDisabled("name"), true);
    assert.equal(form.isFieldDisabled("email"), false);

    form.setFieldValue("name", "Blocked");
    form.setFieldValue("email", "allowed@example.com");
    form = h.render(options);

    assert.equal(form.values.name, "John");
    assert.equal(form.values.email, "allowed@example.com");
  });

  test("fieldDisabled=true disables one field while form stays enabled", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      fieldDisabled: { email: true },
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.isFieldDisabled("name"), false);
    assert.equal(form.isFieldDisabled("email"), true);

    form.setFieldValue("name", "Jane");
    form.setFieldValue("email", "blocked@example.com");
    form = h.render(options);

    assert.equal(form.values.name, "Jane");
    assert.equal(form.values.email, "john@example.com");
  });

  test("setFieldDisabled override precedence persists until override is cleared", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setDisabled(true);
    form = h.render(options);
    assert.equal(form.isFieldDisabled("name"), true);

    form.setFieldDisabled("name", false);
    form = h.render(options);
    assert.equal(form.isFieldDisabled("name"), false);

    form.setFieldValue("name", "OverrideWorks");
    form = h.render(options);
    assert.equal(form.values.name, "OverrideWorks");

    form.setFieldDisabled("name", undefined);
    form = h.render(options);
    assert.equal(form.isFieldDisabled("name"), true);
  });

  test("readOnly prevents edits while existing values stay visible", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "Visible", email: "visible@example.com", age: 20 },
      readOnly: true,
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.readOnly, true);
    assert.equal(form.values.name, "Visible");
    assert.equal(form.values.email, "visible@example.com");
    assert.equal(form.isFieldReadOnly("name"), true);

    form.setFieldValue("name", "Blocked");
    form.handleChange("email")("blocked@example.com");
    form = h.render(options);

    assert.equal(form.values.name, "Visible");
    assert.equal(form.values.email, "visible@example.com");
  });

  test("setReadOnly toggles edit lock on and off", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setReadOnly(true);
    form = h.render(options);
    assert.equal(form.readOnly, true);
    assert.equal(form.isFieldReadOnly("name"), true);

    form.setFieldValue("name", "Blocked");
    form = h.render(options);
    assert.equal(form.values.name, "John");

    form.setReadOnly(false);
    form = h.render(options);
    assert.equal(form.readOnly, false);
    assert.equal(form.isFieldReadOnly("name"), false);

    form.setFieldValue("name", "Allowed");
    form = h.render(options);
    assert.equal(form.values.name, "Allowed");
  });

  test("setFieldReadOnly override wins while form readOnly is enabled", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setReadOnly(true);
    form = h.render(options);
    assert.equal(form.isFieldReadOnly("name"), true);

    form.setFieldReadOnly("name", false);
    form = h.render(options);
    assert.equal(form.isFieldReadOnly("name"), false);

    form.setFieldValue("name", "OverrideWorks");
    form = h.render(options);
    assert.equal(form.values.name, "OverrideWorks");

    form.setFieldReadOnly("name", undefined);
    form = h.render(options);
    assert.equal(form.isFieldReadOnly("name"), true);

    form.setFieldValue("name", "BlockedAgain");
    form = h.render(options);
    assert.equal(form.values.name, "OverrideWorks");
  });

  test("fieldReadOnly=false overrides form readOnly=true for a field", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      readOnly: true,
      fieldReadOnly: { email: false },
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.isFieldReadOnly("name"), true);
    assert.equal(form.isFieldReadOnly("email"), false);

    form.setFieldValue("name", "Blocked");
    form.setFieldValue("email", "allowed@example.com");
    form = h.render(options);

    assert.equal(form.values.name, "John");
    assert.equal(form.values.email, "allowed@example.com");
  });

  test("fieldReadOnly=true blocks one field while form stays editable", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      fieldReadOnly: { email: true },
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.isFieldReadOnly("name"), false);
    assert.equal(form.isFieldReadOnly("email"), true);

    form.setFieldValue("name", "Jane");
    form.setFieldValue("email", "blocked@example.com");
    form = h.render(options);

    assert.equal(form.values.name, "Jane");
    assert.equal(form.values.email, "john@example.com");
  });

  test("handleSubmit is blocked while disabled", () => {
    const h = createTestContext();
    let submitCalls = 0;

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      onSubmit: () => {
        submitCalls++;
      },
    };

    let form = h.render(options);
    form.setDisabled(true);
    form = h.render(options);

    form.handleSubmit();
    form = h.render(options);

    assert.equal(submitCalls, 0);
    assert.equal(form.submitCount, 0);
  });

  test("validateField returns undefined and clears existing error when field is disabled", () => {
    const h = createTestContext();
    let validateCalls = 0;

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "", email: "john@example.com", age: 30 },
      validate: (values) => {
        validateCalls++;
        const errors: Partial<Record<keyof TestValues, string>> = {};
        if (!values.name) {
          errors.name = "Name required";
        }
        return errors;
      },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setFieldError("name", "Manual error");
    form = h.render(options);
    assert.equal(form.errors.name, "Manual error");

    form.setDisabled(true);
    form = h.render(options);
    const result = form.validateField("name");
    form = h.render(options);

    assert.equal(result, undefined);
    assert.equal(form.errors.name, undefined);
    assert.equal(validateCalls, 0);
  });

  test("isFieldDisabled/isFieldReadOnly resolve effective state from form + overrides", () => {
    const h = createTestContext();

    const options: UseFormOptions<TestValues> = {
      initialValues: { name: "John", email: "john@example.com", age: 30 },
      disabled: true,
      readOnly: true,
      fieldDisabled: { name: false },
      fieldReadOnly: { name: false, email: true },
      onSubmit: () => {},
    };

    let form = h.render(options);

    assert.equal(form.isFieldDisabled("name"), false);
    assert.equal(form.isFieldReadOnly("name"), false);
    assert.equal(form.isFieldDisabled("email"), true);
    assert.equal(form.isFieldReadOnly("email"), true);
    assert.equal(form.isFieldDisabled("age"), true);
    assert.equal(form.isFieldReadOnly("age"), true);

    form.setFieldDisabled("email", false);
    form.setFieldReadOnly("email", false);
    form = h.render(options);

    assert.equal(form.isFieldDisabled("email"), false);
    assert.equal(form.isFieldReadOnly("email"), false);
  });
});

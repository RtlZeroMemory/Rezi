import { assert, describe, test } from "@rezi-ui/testkit";
import type { UseFormOptions } from "../types.js";
import {
  isValidationClean,
  mergeValidationErrors,
  runFieldValidation,
  runSyncValidation,
} from "../validation.js";
import { createFormHarness } from "./harness.js";

type Values = {
  name: string;
  email: string;
  age: string;
};

function validate(values: Values): Partial<Record<keyof Values, string>> {
  const errors: Partial<Record<keyof Values, string>> = {};
  if (!values.name.trim()) errors.name = "Name required";
  if (!values.email.includes("@")) errors.email = "Email invalid";
  if (values.age.trim() === "") errors.age = "Age required";
  return errors;
}

describe("form.sync-validation - utility behavior", () => {
  test("runSyncValidation returns empty object without validator", () => {
    const result = runSyncValidation({ name: "a" }, undefined);
    assert.deepEqual(result, {});
  });

  test("runSyncValidation returns validator output", () => {
    const result = runSyncValidation({ name: "", email: "x", age: "" }, (v: Values) => {
      const errors: Partial<Record<keyof Values, string>> = {};
      if (!v.name) {
        errors.name = "required";
      }
      return errors;
    });
    assert.equal(result.name, "required");
  });

  test("runFieldValidation returns one field's error", () => {
    const result = runFieldValidation({ name: "", email: "x", age: "1" }, "name", (v: Values) => {
      const errors: Partial<Record<keyof Values, string>> = { email: "bad" };
      if (!v.name) {
        errors.name = "required";
      }
      return errors;
    });
    assert.equal(result, "required");
  });

  test("runFieldValidation returns undefined without validator", () => {
    const result = runFieldValidation({ name: "", email: "", age: "" }, "name", undefined);
    assert.equal(result, undefined);
  });

  test("mergeValidationErrors gives async precedence", () => {
    const result = mergeValidationErrors<Values>(
      { name: "sync", email: "sync" },
      { name: "async" },
    );
    assert.deepEqual(result, { name: "async", email: "sync" });
  });

  test("isValidationClean treats undefined and empty string as clean", () => {
    assert.equal(isValidationClean<Values>({}), true);
    assert.equal(isValidationClean<Values>({ name: "" }), true);
  });

  test("isValidationClean treats non-empty message as invalid", () => {
    assert.equal(isValidationClean<Values>({ name: "error" }), false);
  });
});

describe("form.sync-validation - useForm trigger semantics", () => {
  function options(overrides: Partial<UseFormOptions<Values>> = {}): UseFormOptions<Values> {
    return {
      initialValues: { name: "", email: "", age: "" },
      validate,
      onSubmit: () => undefined,
      ...overrides,
    };
  }

  test("validateOnChange=false does not populate errors during change", () => {
    const h = createFormHarness();
    let form = h.render(options({ validateOnChange: false }));

    form.setFieldValue("name", "");
    form = h.render(options({ validateOnChange: false }));
    assert.equal(form.errors.name, undefined);
  });

  test("validateOnChange=true populates errors immediately", () => {
    const h = createFormHarness();
    let form = h.render(options({ validateOnChange: true }));

    form.setFieldValue("name", "");
    form = h.render(options({ validateOnChange: true }));
    assert.equal(form.errors.name, "Name required");
  });

  test("validateOnBlur defaults to true and marks touched+errors", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.handleBlur("email")();
    form = h.render(options());
    assert.equal(form.touched.email, true);
    assert.equal(form.errors.email, "Email invalid");
  });

  test("validateOnBlur=false only marks touched", () => {
    const h = createFormHarness();
    let form = h.render(options({ validateOnBlur: false }));

    form.handleBlur("email")();
    form = h.render(options({ validateOnBlur: false }));
    assert.equal(form.touched.email, true);
    assert.equal(form.errors.email, undefined);
  });

  test("handleSubmit marks all fields touched", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.handleSubmit();
    form = h.render(options());
    assert.equal(form.touched.name, true);
    assert.equal(form.touched.email, true);
    assert.equal(form.touched.age, true);
  });

  test("handleSubmit blocks submit callback when sync errors exist", () => {
    const h = createFormHarness();
    let called = 0;
    const opts = options({
      onSubmit: () => {
        called++;
      },
    });
    const form = h.render(opts);

    form.handleSubmit();
    assert.equal(called, 0);
  });

  test("error clears when field value becomes valid", () => {
    const h = createFormHarness();
    let form = h.render(options({ validateOnChange: true }));

    form.setFieldValue("email", "bad");
    form = h.render(options({ validateOnChange: true }));
    assert.equal(form.errors.email, "Email invalid");

    form.setFieldValue("email", "ok@example.com");
    form = h.render(options({ validateOnChange: true }));
    assert.equal(form.errors.email, undefined);
  });

  test("validateField updates field error and then clears when valid", () => {
    const h = createFormHarness();
    let form = h.render(options());

    let error = form.validateField("name");
    form = h.render(options());
    assert.equal(error, "Name required");
    assert.equal(form.errors.name, "Name required");

    form.setFieldValue("name", "Ada");
    form = h.render(options());
    error = form.validateField("name");
    form = h.render(options());
    assert.equal(error, undefined);
    assert.equal(form.errors.name, undefined);
  });
});

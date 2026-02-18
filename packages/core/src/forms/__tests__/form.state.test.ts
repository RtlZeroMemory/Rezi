import { assert, describe, test } from "@rezi-ui/testkit";
import type { UseFormOptions } from "../types.js";
import { createFormHarness, flushMicrotasks } from "./harness.js";

type Values = {
  name: string;
  email: string;
  age: number;
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function options(overrides: Partial<UseFormOptions<Values>> = {}): UseFormOptions<Values> {
  return {
    initialValues: { name: "Ada", email: "ada@example.com", age: 42 },
    validate: (values) => {
      const errors: Partial<Record<keyof Values, string>> = {};
      if (!values.name.trim()) errors.name = "Name required";
      if (!values.email.includes("@")) errors.email = "Email invalid";
      return errors;
    },
    onSubmit: () => undefined,
    ...overrides,
  };
}

describe("form.state - dirty semantics", () => {
  test("initial state is clean and valid", () => {
    const h = createFormHarness();
    const form = h.render(options());

    assert.equal(form.isDirty, false);
    assert.equal(form.isValid, true);
    assert.equal(form.submitCount, 0);
    assert.deepEqual(form.touched, {});
    assert.deepEqual(form.dirty, {});
  });

  test("setFieldValue marks changed field dirty", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("name", "Grace");
    form = h.render(options());

    assert.equal(form.dirty.name, true);
    assert.equal(form.isDirty, true);
  });

  test("setting field to same initial value keeps dirty false", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("name", "Ada");
    form = h.render(options());

    assert.equal(form.dirty.name, false);
    assert.equal(form.isDirty, false);
  });

  test("setting field back to initial value clears dirty flag", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("name", "Grace");
    form = h.render(options());
    assert.equal(form.isDirty, true);

    form.setFieldValue("name", "Ada");
    form = h.render(options());
    assert.equal(form.dirty.name, false);
    assert.equal(form.isDirty, false);
  });

  test("overall dirty remains true when any field is dirty", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("name", "Grace");
    form.setFieldValue("email", "grace@example.com");
    form = h.render(options());
    assert.equal(form.isDirty, true);

    form.setFieldValue("name", "Ada");
    form = h.render(options());
    assert.equal(form.dirty.name, false);
    assert.equal(form.dirty.email, true);
    assert.equal(form.isDirty, true);
  });

  test("handleChange updates value and dirty map", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.handleChange("name")("Linus");
    form = h.render(options());

    assert.equal(form.values.name, "Linus");
    assert.equal(form.dirty.name, true);
  });
});

describe("form.state - touched and validation state", () => {
  test("handleBlur marks field touched", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.handleBlur("name")();
    form = h.render(options());
    assert.equal(form.touched.name, true);
  });

  test("setFieldTouched can clear touched state", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldTouched("email", true);
    form = h.render(options());
    assert.equal(form.touched.email, true);

    form.setFieldTouched("email", false);
    form = h.render(options());
    assert.equal(form.touched.email, false);
  });

  test("setFieldTouched does not change dirty state", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldTouched("name", true);
    form = h.render(options());

    assert.equal(form.isDirty, false);
    assert.equal(form.dirty.name, undefined);
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

  test("validateForm updates errors and isValid", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("name", "");
    form = h.render(options());
    const errors = form.validateForm();
    form = h.render(options());

    assert.equal(errors.name, "Name required");
    assert.equal(form.errors.name, "Name required");
    assert.equal(form.isValid, false);
  });

  test("setFieldError toggles overall isValid", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldError("name", "Manual error");
    form = h.render(options());
    assert.equal(form.isValid, false);

    form.setFieldError("name", undefined);
    form = h.render(options());
    assert.equal(form.isValid, true);
  });

  test("setFieldError with empty string is treated as valid", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldError("name", "");
    form = h.render(options());

    assert.equal(form.errors.name, "");
    assert.equal(form.isValid, true);
  });
});

describe("form.state - submit and reset lifecycle", () => {
  test("invalid submit increments submitCount and keeps isSubmitting false", () => {
    const h = createFormHarness();
    let submitCalls = 0;
    const opts = options({
      initialValues: { name: "", email: "bad-email", age: 1 },
      onSubmit: () => {
        submitCalls++;
      },
    });

    let form = h.render(opts);
    form.handleSubmit();
    form = h.render(opts);

    assert.equal(form.submitCount, 1);
    assert.equal(form.isSubmitting, false);
    assert.equal(submitCalls, 0);
  });

  test("valid submit increments submitCount and calls onSubmit", async () => {
    const h = createFormHarness();
    let submitCalls = 0;
    const opts = options({
      onSubmit: () => {
        submitCalls++;
      },
    });

    let form = h.render(opts);
    form.handleSubmit();
    await flushMicrotasks();
    form = h.render(opts);

    assert.equal(form.submitCount, 1);
    assert.equal(submitCalls, 1);
  });

  test("isSubmitting is true while submit promise is pending", async () => {
    const h = createFormHarness();
    const submit = createDeferred<void>();
    const opts = options({
      onSubmit: async () => submit.promise,
    });

    let form = h.render(opts);
    form.handleSubmit();
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.isSubmitting, true);

    submit.resolve();
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.isSubmitting, false);
  });

  test("submit rejection clears isSubmitting", async () => {
    const h = createFormHarness();
    const opts = options({
      onSubmit: async () => Promise.reject(new Error("submit failed")),
    });

    let form = h.render(opts);
    form.handleSubmit();
    await flushMicrotasks(4);
    form = h.render(opts);

    assert.equal(form.isSubmitting, false);
    assert.equal(form.submitCount, 1);
  });

  test("reset clears values, errors, touched, dirty and submitCount", () => {
    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("name", "Changed");
    form.setFieldTouched("name", true);
    form.setFieldError("email", "Bad");
    form.handleSubmit();
    form = h.render(options());
    assert.equal(form.submitCount, 1);

    form.reset();
    form = h.render(options());

    assert.deepEqual(form.values, { name: "Ada", email: "ada@example.com", age: 42 });
    assert.deepEqual(form.errors, {});
    assert.deepEqual(form.touched, {});
    assert.deepEqual(form.dirty, {});
    assert.equal(form.isDirty, false);
    assert.equal(form.submitCount, 0);
  });

  test("reset during pending submit immediately clears submitting state", async () => {
    const h = createFormHarness();
    const submit = createDeferred<void>();
    const opts = options({
      onSubmit: async () => submit.promise,
    });

    let form = h.render(opts);
    form.handleSubmit();
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.isSubmitting, true);

    form.reset();
    form = h.render(opts);
    assert.equal(form.isSubmitting, false);

    submit.resolve();
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.isSubmitting, false);
  });

  test("resetOnSubmit restores initial values after successful submit", async () => {
    const h = createFormHarness();
    const opts = options({
      resetOnSubmit: true,
    });

    let form = h.render(opts);
    form.setFieldValue("name", "Not initial");
    form = h.render(opts);
    assert.equal(form.values.name, "Not initial");

    form.handleSubmit();
    await flushMicrotasks(4);
    form = h.render(opts);
    assert.equal(form.values.name, "Ada");
    assert.equal(form.isDirty, false);
  });
});

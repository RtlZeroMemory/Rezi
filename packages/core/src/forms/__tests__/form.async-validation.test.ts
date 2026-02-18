import { assert, describe, test } from "@rezi-ui/testkit";
import type { UseFormOptions } from "../types.js";
import { createDebouncedAsyncValidator, runAsyncValidation } from "../validation.js";
import { createFormHarness, flushMicrotasks } from "./harness.js";

type Values = {
  username: string;
  email: string;
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
    initialValues: { username: "", email: "" },
    validate: (values) => {
      const errors: Partial<Record<keyof Values, string>> = {};
      if (!values.username.trim()) errors.username = "Username required";
      return errors;
    },
    validateOnChange: true,
    validateAsyncDebounce: 20,
    validateAsync: async (values) => {
      if (values.email === "taken@example.com") {
        return { email: "Email already taken" };
      }
      return {};
    },
    onSubmit: () => undefined,
    ...overrides,
  };
}

describe("form.async-validation - utility behavior", () => {
  test("runAsyncValidation returns empty object without validator", async () => {
    const result = await runAsyncValidation({ username: "" }, undefined);
    assert.deepEqual(result, {});
  });

  test("runAsyncValidation returns validator result", async () => {
    const result = await runAsyncValidation(
      { username: "taken" },
      async (values: { username: string }) => {
        if (values.username === "taken") {
          return { username: "Taken" };
        }
        return {};
      },
    );
    assert.deepEqual(result, { username: "Taken" });
  });

  test("runAsyncValidation swallows validator rejection", async () => {
    const result = await runAsyncValidation({ username: "x" }, async () =>
      Promise.reject(new Error("network")),
    );
    assert.deepEqual(result, {});
  });

  test("createDebouncedAsyncValidator executes only after debounce window", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const calls: string[] = [];
    let received: Partial<Record<keyof Values, string>> = {};
    const validator = createDebouncedAsyncValidator<Values>(
      async (values) => {
        calls.push(values.username);
        return values.username === "bad" ? { username: "Bad" } : {};
      },
      25,
      (errors) => {
        received = errors;
      },
    );

    validator.run({ username: "bad", email: "" });
    t.mock.timers.tick(24);
    await flushMicrotasks();
    assert.equal(calls.length, 0);

    t.mock.timers.tick(1);
    await flushMicrotasks();
    assert.deepEqual(calls, ["bad"]);
    assert.deepEqual(received, { username: "Bad" });
  });

  test("createDebouncedAsyncValidator debounces rapid calls and keeps latest value", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const calls: string[] = [];
    const validator = createDebouncedAsyncValidator<Values>(
      async (values) => {
        calls.push(values.username);
        return {};
      },
      30,
      () => {},
    );

    validator.run({ username: "a", email: "" });
    validator.run({ username: "ab", email: "" });
    validator.run({ username: "abc", email: "" });
    t.mock.timers.tick(30);
    await flushMicrotasks();

    assert.deepEqual(calls, ["abc"]);
  });

  test("createDebouncedAsyncValidator ignores stale in-flight results", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const first = createDeferred<Partial<Record<keyof Values, string>>>();
    const second = createDeferred<Partial<Record<keyof Values, string>>>();
    const results: Partial<Record<keyof Values, string>>[] = [];

    let call = 0;
    const validator = createDebouncedAsyncValidator<Values>(
      async () => {
        call++;
        return call === 1 ? first.promise : second.promise;
      },
      0,
      (errors) => {
        results.push(errors);
      },
    );

    validator.run({ username: "first", email: "" });
    t.mock.timers.tick(0);

    validator.run({ username: "second", email: "" });
    t.mock.timers.tick(0);

    first.resolve({ username: "stale" });
    await flushMicrotasks();
    assert.equal(results.length, 0);

    second.resolve({ username: "fresh" });
    await flushMicrotasks();
    assert.deepEqual(results, [{ username: "fresh" }]);
  });

  test("createDebouncedAsyncValidator cancel drops pending invocation", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    let called = 0;
    const validator = createDebouncedAsyncValidator<Values>(
      async () => {
        called++;
        return { username: "Bad" };
      },
      10,
      () => {
        called++;
      },
    );

    validator.run({ username: "x", email: "" });
    validator.cancel();
    t.mock.timers.tick(10);
    await flushMicrotasks();

    assert.equal(called, 0);
  });

  test("createDebouncedAsyncValidator can run again after cancel", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const seen: string[] = [];
    const validator = createDebouncedAsyncValidator<Values>(
      async (values) => {
        seen.push(values.username);
        return {};
      },
      10,
      () => {},
    );

    validator.run({ username: "first", email: "" });
    validator.cancel();
    validator.run({ username: "second", email: "" });
    t.mock.timers.tick(10);
    await flushMicrotasks();

    assert.deepEqual(seen, ["second"]);
  });
});

describe("form.async-validation - useForm behavior", () => {
  test("validateAsync updates async field errors on change", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const h = createFormHarness();
    let form = h.render(options());

    form.setFieldValue("username", "ok");
    form.setFieldValue("email", "taken@example.com");
    t.mock.timers.tick(20);
    await flushMicrotasks();

    form = h.render(options());
    assert.equal(form.errors.email, "Email already taken");
  });

  test("validateAsync debounce coalesces rapid changes in useForm", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const seen: string[] = [];
    const h = createFormHarness();
    const opts = options({
      validateAsyncDebounce: 50,
      validateAsync: async (values) => {
        seen.push(values.email);
        return {};
      },
    });

    const form = h.render(opts);
    form.setFieldValue("username", "ok");
    form.setFieldValue("email", "a@example.com");
    form.setFieldValue("email", "b@example.com");
    form.setFieldValue("email", "c@example.com");

    t.mock.timers.tick(50);
    await flushMicrotasks();

    assert.deepEqual(seen, ["c@example.com"]);
  });

  test("latest async result wins in useForm race", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const h = createFormHarness();
    const first = createDeferred<Partial<Record<keyof Values, string>>>();
    const second = createDeferred<Partial<Record<keyof Values, string>>>();
    let call = 0;
    const opts = options({
      validateAsyncDebounce: 0,
      validateAsync: async () => {
        call++;
        return call === 1 ? first.promise : second.promise;
      },
    });

    let form = h.render(opts);
    form.setFieldValue("username", "ok");
    form.setFieldValue("email", "first@example.com");
    t.mock.timers.tick(0);

    form.setFieldValue("email", "second@example.com");
    t.mock.timers.tick(0);

    first.resolve({ email: "stale error" });
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.errors.email, undefined);

    second.resolve({ email: "fresh error" });
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.errors.email, "fresh error");
  });

  test("async validator rejection clears prior async error", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const h = createFormHarness();
    let call = 0;
    const opts = options({
      validateAsyncDebounce: 0,
      validateAsync: async () => {
        call++;
        if (call === 1) {
          return { email: "server error" };
        }
        throw new Error("network");
      },
    });

    let form = h.render(opts);
    form.setFieldValue("username", "ok");
    form.setFieldValue("email", "first@example.com");
    t.mock.timers.tick(0);
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.errors.email, "server error");

    form.setFieldValue("email", "second@example.com");
    t.mock.timers.tick(0);
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.errors.email, undefined);
  });

  test("handleSubmit sets isSubmitting during async submit lifecycle", async () => {
    const h = createFormHarness();
    const submit = createDeferred<void>();
    const opts = options({
      validateOnChange: false,
      validate: () => ({}),
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

  test("handleSubmit blocks callback when async validation returns errors", async () => {
    const h = createFormHarness();
    let submitCalls = 0;
    const opts = options({
      validateOnChange: false,
      validate: () => ({}),
      validateAsync: async () => ({ email: "taken" }),
      onSubmit: () => {
        submitCalls++;
      },
    });

    let form = h.render(opts);
    form.handleSubmit();
    await flushMicrotasks();
    form = h.render(opts);

    assert.equal(submitCalls, 0);
    assert.equal(form.isSubmitting, false);
    assert.equal(form.errors.email, "taken");
  });

  test("handleSubmit continues when async validation throws network error", async () => {
    const h = createFormHarness();
    let submitCalls = 0;
    const opts = options({
      validateOnChange: false,
      validate: () => ({}),
      validateAsync: async () => Promise.reject(new Error("offline")),
      onSubmit: () => {
        submitCalls++;
      },
    });

    const form = h.render(opts);
    form.handleSubmit();
    await flushMicrotasks(4);

    assert.equal(submitCalls, 1);
  });

  test("handleSubmit rejects concurrent submits while pending", async () => {
    const h = createFormHarness();
    const submit = createDeferred<void>();
    let submitCalls = 0;
    const opts = options({
      validateOnChange: false,
      validate: () => ({}),
      onSubmit: async () => {
        submitCalls++;
        return submit.promise;
      },
    });

    let form = h.render(opts);
    form.handleSubmit();
    form.handleSubmit();
    await flushMicrotasks();
    form = h.render(opts);

    assert.equal(submitCalls, 1);
    assert.equal(form.isSubmitting, true);

    submit.resolve();
    await flushMicrotasks();
    form = h.render(opts);
    assert.equal(form.isSubmitting, false);
  });

  test("async validation overrides sync error for same field", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const h = createFormHarness();
    const opts = options({
      validateAsyncDebounce: 0,
      validate: () => ({ email: "sync email error" }),
      validateAsync: async () => ({ email: "async email error" }),
    });

    let form = h.render(opts);
    form.setFieldValue("username", "ok");
    form.setFieldValue("email", "a@example.com");
    t.mock.timers.tick(0);
    await flushMicrotasks();
    form = h.render(opts);

    assert.equal(form.errors.email, "async email error");
  });

  test("async validation preserves sync errors on other fields", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const h = createFormHarness();
    const opts = options({
      validateAsyncDebounce: 0,
      validate: (values) => {
        const errors: Partial<Record<keyof Values, string>> = {};
        if (!values.username.trim()) {
          errors.username = "username missing";
        }
        return errors;
      },
      validateAsync: async () => ({ email: "email async error" }),
    });

    let form = h.render(opts);
    form.setFieldValue("email", "x@example.com");
    t.mock.timers.tick(0);
    await flushMicrotasks();
    form = h.render(opts);

    assert.equal(form.errors.username, "username missing");
    assert.equal(form.errors.email, "email async error");
  });
});

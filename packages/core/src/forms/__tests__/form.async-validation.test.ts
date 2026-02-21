import { assert, describe, test } from "@rezi-ui/testkit";
import type { UseFormOptions, ValidationResult } from "../types.js";
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

/**
 * Minimal fake-timer utility compatible with Node 18+.
 * Replaces global setTimeout/clearTimeout with a synchronous queue drained by tick().
 */
function useFakeTimers(): { tick: (ms: number) => void; restore: () => void } {
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const queue: Array<{ id: number; cb: () => void; at: number }> = [];
  let now = 0;
  let nextId = 1;

  globalThis.setTimeout = ((cb: () => void, delay?: number) => {
    const id = nextId++;
    const at = now + Math.max(0, delay ?? 0);
    queue.push({ id, cb, at });
    return id as unknown as ReturnType<typeof globalThis.setTimeout>;
  }) as unknown as typeof globalThis.setTimeout;

  globalThis.clearTimeout = ((timerId?: number) => {
    if (typeof timerId !== "number") {
      return;
    }
    const idx = queue.findIndex((entry) => entry.id === timerId);
    if (idx >= 0) {
      queue.splice(idx, 1);
    }
  }) as unknown as typeof globalThis.clearTimeout;

  return {
    tick(ms: number) {
      now += Math.max(0, ms);
      while (true) {
        queue.sort((a, b) => (a.at === b.at ? a.id - b.id : a.at - b.at));
        const entry = queue[0];
        if (!entry || entry.at > now) {
          break;
        }
        queue.shift();
        entry.cb();
      }
    },
    restore() {
      globalThis.setTimeout = origSetTimeout;
      globalThis.clearTimeout = origClearTimeout;
    },
  };
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

  test("createDebouncedAsyncValidator executes only after debounce window", async () => {
    const timers = useFakeTimers();
    try {
      const calls: string[] = [];
      let received: ValidationResult<Values> = {};
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
      timers.tick(24);
      await flushMicrotasks();
      assert.equal(calls.length, 0);

      timers.tick(1);
      await flushMicrotasks();
      assert.deepEqual(calls, ["bad"]);
      assert.deepEqual(received, { username: "Bad" });
    } finally {
      timers.restore();
    }
  });

  test("createDebouncedAsyncValidator debounces rapid calls and keeps latest value", async () => {
    const timers = useFakeTimers();
    try {
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
      timers.tick(30);
      await flushMicrotasks();

      assert.deepEqual(calls, ["abc"]);
    } finally {
      timers.restore();
    }
  });

  test("createDebouncedAsyncValidator ignores stale in-flight results", async () => {
    const timers = useFakeTimers();
    try {
      const first = createDeferred<ValidationResult<Values>>();
      const second = createDeferred<ValidationResult<Values>>();
      const results: ValidationResult<Values>[] = [];

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
      timers.tick(0);

      validator.run({ username: "second", email: "" });
      timers.tick(0);

      first.resolve({ username: "stale" });
      await flushMicrotasks();
      assert.equal(results.length, 0);

      second.resolve({ username: "fresh" });
      await flushMicrotasks();
      assert.deepEqual(results, [{ username: "fresh" }]);
    } finally {
      timers.restore();
    }
  });

  test("createDebouncedAsyncValidator cancel drops pending invocation", async () => {
    const timers = useFakeTimers();
    try {
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
      timers.tick(10);
      await flushMicrotasks();

      assert.equal(called, 0);
    } finally {
      timers.restore();
    }
  });

  test("createDebouncedAsyncValidator can run again after cancel", async () => {
    const timers = useFakeTimers();
    try {
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
      timers.tick(10);
      await flushMicrotasks();

      assert.deepEqual(seen, ["second"]);
    } finally {
      timers.restore();
    }
  });
});

describe("form.async-validation - useForm behavior", () => {
  test("validateAsync updates async field errors on change", async () => {
    const timers = useFakeTimers();
    try {
      const h = createFormHarness();
      let form = h.render(options());

      form.setFieldValue("username", "ok");
      form.setFieldValue("email", "taken@example.com");
      timers.tick(20);
      await flushMicrotasks();

      form = h.render(options());
      assert.equal(form.errors.email, "Email already taken");
    } finally {
      timers.restore();
    }
  });

  test("validateAsync debounce coalesces rapid changes in useForm", async () => {
    const timers = useFakeTimers();
    try {
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

      timers.tick(50);
      await flushMicrotasks();

      assert.deepEqual(seen, ["c@example.com"]);
    } finally {
      timers.restore();
    }
  });

  test("latest async result wins in useForm race", async () => {
    const timers = useFakeTimers();
    try {
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
      timers.tick(0);

      form.setFieldValue("email", "second@example.com");
      timers.tick(0);

      first.resolve({ email: "stale error" });
      await flushMicrotasks();
      form = h.render(opts);
      assert.equal(form.errors.email, undefined);

      second.resolve({ email: "fresh error" });
      await flushMicrotasks();
      form = h.render(opts);
      assert.equal(form.errors.email, "fresh error");
    } finally {
      timers.restore();
    }
  });

  test("async validator rejection clears prior async error", async () => {
    const timers = useFakeTimers();
    try {
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
      timers.tick(0);
      await flushMicrotasks();
      form = h.render(opts);
      assert.equal(form.errors.email, "server error");

      form.setFieldValue("email", "second@example.com");
      timers.tick(0);
      await flushMicrotasks();
      form = h.render(opts);
      assert.equal(form.errors.email, undefined);
    } finally {
      timers.restore();
    }
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

  test("async validation overrides sync error for same field", async () => {
    const timers = useFakeTimers();
    try {
      const h = createFormHarness();
      const opts = options({
        validateAsyncDebounce: 0,
        validate: () => ({ email: "sync email error" }),
        validateAsync: async () => ({ email: "async email error" }),
      });

      let form = h.render(opts);
      form.setFieldValue("username", "ok");
      form.setFieldValue("email", "a@example.com");
      timers.tick(0);
      await flushMicrotasks();
      form = h.render(opts);

      assert.equal(form.errors.email, "async email error");
    } finally {
      timers.restore();
    }
  });

  test("async validation preserves sync errors on other fields", async () => {
    const timers = useFakeTimers();
    try {
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
      timers.tick(0);
      await flushMicrotasks();
      form = h.render(opts);

      assert.equal(form.errors.username, "username missing");
      assert.equal(form.errors.email, "email async error");
    } finally {
      timers.restore();
    }
  });
});

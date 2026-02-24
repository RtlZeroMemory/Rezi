/**
 * packages/core/src/forms/__tests__/form.fieldArray.test.ts — Tests for useFieldArray helpers.
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

type FieldArrayFormValues = {
  items: string[];
  note: string;
};

/**
 * Create a mock widget context for testing hooks.
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

const validateItemsRequired = ((values: FieldArrayFormValues) => ({
  items: values.items.map((item) => (item.trim().length > 0 ? undefined : "Required")),
})) as unknown as NonNullable<UseFormOptions<FieldArrayFormValues>["validate"]>;

describe("useFieldArray", () => {
  test("returns initial array values with deterministic keys", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    let fa = form.useFieldArray("items");

    assert.deepEqual(fa.values, ["a", "b"]);
    assert.deepEqual(fa.keys, ["items_0", "items_1"]);

    form = h.render(options);
    fa = form.useFieldArray("items");
    assert.deepEqual(fa.keys, ["items_0", "items_1"]);
  });

  test("append adds value and initializes item state", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items").append("b");
    form = h.render(options);

    const fa = form.useFieldArray("items");
    assert.deepEqual(fa.values, ["a", "b"]);
    assert.deepEqual(fa.keys, ["items_0", "items_1"]);
    assert.deepEqual(form.touched.items, [false, false]);
    assert.deepEqual(form.dirty.items, [false, true]);
    assert.deepEqual(form.errors.items, [undefined, undefined]);
  });

  test("append works from an empty array", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: [], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    let fa = form.useFieldArray("items");
    assert.deepEqual(fa.values, []);
    assert.deepEqual(fa.keys, []);

    fa.append("x");
    form = h.render(options);
    fa = form.useFieldArray("items");

    assert.deepEqual(fa.values, ["x"]);
    assert.deepEqual(fa.keys, ["items_0"]);
    assert.deepEqual(form.touched.items, [false]);
    assert.deepEqual(form.dirty.items, [true]);
    assert.deepEqual(form.errors.items, [undefined]);
  });

  test("remove deletes value and aligns per-item arrays", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b", "c"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items");
    form.handleSubmit();
    form.setFieldError("items", ["e0", "e1", "e2"]);
    form = h.render(options);
    form.useFieldArray("items").remove(1);
    form = h.render(options);

    const fa = form.useFieldArray("items");
    assert.deepEqual(fa.values, ["a", "c"]);
    assert.deepEqual(fa.keys, ["items_0", "items_2"]);
    assert.deepEqual(form.errors.items, ["e0", "e2"]);
    assert.deepEqual(form.touched.items, [true, true]);
    assert.deepEqual(form.dirty.items, [false, false]);
  });

  test("remove ignores out-of-range indexes", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items");
    form.handleSubmit();
    form.setFieldError("items", ["e0", "e1"]);
    form = h.render(options);
    const fa = form.useFieldArray("items");
    const initialInvalidations = h.getInvalidateCount();
    const touchedBefore = form.touched.items;
    const dirtyBefore = form.dirty.items;
    const errorsBefore = form.errors.items;

    fa.remove(-1);
    fa.remove(3);

    assert.equal(h.getInvalidateCount(), initialInvalidations);
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["a", "b"]);
    assert.deepEqual(form.useFieldArray("items").keys, ["items_0", "items_1"]);
    assert.deepEqual(form.touched.items, touchedBefore);
    assert.deepEqual(form.dirty.items, dirtyBefore);
    assert.deepEqual(form.errors.items, errorsBefore);
  });

  test("move reorders values and keys", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b", "c"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    const initialKeys = form.useFieldArray("items").keys.slice();

    form.useFieldArray("items").move(0, 2);
    form = h.render(options);

    const fa = form.useFieldArray("items");
    assert.deepEqual(fa.values, ["b", "c", "a"]);
    assert.deepEqual(fa.keys, [initialKeys[1], initialKeys[2], initialKeys[0]]);
  });

  test("move preserves per-item error array ordering", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b", "c"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items");
    form.setFieldError("items", [undefined, "err-b", "err-c"]);
    form = h.render(options);

    form.useFieldArray("items").move(2, 0);
    form = h.render(options);

    assert.deepEqual(form.useFieldArray("items").values, ["c", "a", "b"]);
    assert.deepEqual(form.errors.items, ["err-c", undefined, "err-b"]);
  });

  test("move preserves touched state for moved items", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items");
    form.handleSubmit();
    form = h.render(options);

    form.useFieldArray("items").append("c");
    form = h.render(options);
    assert.deepEqual(form.touched.items, [true, true, false]);

    form.useFieldArray("items").move(2, 0);
    form = h.render(options);
    assert.deepEqual(form.touched.items, [false, true, true]);
  });

  test("move preserves dirty state for moved items", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items").append("c");
    form = h.render(options);
    assert.deepEqual(form.dirty.items, [false, false, true]);

    form.useFieldArray("items").move(2, 0);
    form = h.render(options);
    assert.deepEqual(form.dirty.items, [true, false, false]);
  });

  test("move no-ops for same index or invalid indexes", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.useFieldArray("items");
    form.handleSubmit();
    form.setFieldError("items", ["e0", "e1"]);
    form = h.render(options);
    const fa = form.useFieldArray("items");
    const initialInvalidations = h.getInvalidateCount();
    const touchedBefore = form.touched.items;
    const dirtyBefore = form.dirty.items;
    const errorsBefore = form.errors.items;

    fa.move(1, 1);
    fa.move(-1, 0);
    fa.move(0, -1);
    fa.move(0, 3);
    fa.move(3, 0);

    assert.equal(h.getInvalidateCount(), initialInvalidations);
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["a", "b"]);
    assert.deepEqual(form.useFieldArray("items").keys, ["items_0", "items_1"]);
    assert.deepEqual(form.touched.items, touchedBefore);
    assert.deepEqual(form.dirty.items, dirtyBefore);
    assert.deepEqual(form.errors.items, errorsBefore);
  });

  test("remove and move are safe on empty arrays", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: [], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    const fa = form.useFieldArray("items");
    const initialInvalidations = h.getInvalidateCount();

    fa.remove(0);
    fa.move(0, 0);
    fa.move(0, 1);

    assert.equal(h.getInvalidateCount(), initialInvalidations);
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, []);
    assert.deepEqual(form.useFieldArray("items").keys, []);
  });

  test("rapid append/remove sequence is deterministic", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: [], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    const fa = form.useFieldArray("items");

    fa.append("a");
    fa.append("b");
    fa.append("c");
    fa.remove(1);
    fa.append("d");
    fa.remove(0);

    form = h.render(options);
    const next = form.useFieldArray("items");

    assert.deepEqual(next.values, ["c", "d"]);
    assert.deepEqual(next.keys, ["items_2", "items_3"]);
    assert.deepEqual(form.touched.items, [false, false]);
    assert.deepEqual(form.dirty.items, [true, true]);
    assert.deepEqual(form.errors.items, [undefined, undefined]);
  });

  test("rapid alternating append/remove settles to empty state deterministically", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: [], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    const fa = form.useFieldArray("items");

    for (let i = 0; i < 10; i++) {
      fa.append(`item-${i}`);
      fa.remove(0);
    }

    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, []);
    assert.deepEqual(form.useFieldArray("items").keys, []);
    assert.deepEqual(form.touched.items, []);
    assert.deepEqual(form.dirty.items, []);
    assert.deepEqual(form.errors.items, []);
  });

  test("validateForm supports per-item validation arrays", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["ok", "", "  "], note: "" },
      validate: validateItemsRequired,
      onSubmit: () => {},
    };

    let form = h.render(options);
    const errors = form.validateForm();
    form = h.render(options);

    assert.deepEqual(errors.items, [undefined, "Required", "Required"]);
    assert.deepEqual(form.errors.items, [undefined, "Required", "Required"]);
    assert.equal(form.isValid, false);
  });

  test("handleSubmit blocks submission when item validation array has errors", () => {
    const h = createTestContext();
    let submitCount = 0;

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["", "ok"], note: "" },
      validate: validateItemsRequired,
      onSubmit: () => {
        submitCount++;
      },
    };

    let form = h.render(options);
    form.handleSubmit();
    form = h.render(options);

    assert.equal(submitCount, 0);
    assert.equal(form.submitCount, 1);
    assert.deepEqual(form.errors.items, ["Required", undefined]);
    assert.deepEqual(form.touched.items, [true, true]);
  });

  test("setDisabled blocks field-array writes until cleared", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setDisabled(true);
    form = h.render(options);

    let fa = form.useFieldArray("items");
    fa.append("c");
    fa.remove(0);
    fa.move(0, 1);

    form = h.render(options);
    fa = form.useFieldArray("items");
    assert.deepEqual(fa.values, ["a", "b"]);

    form.setDisabled(false);
    form = h.render(options);
    form.useFieldArray("items").append("c");
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["a", "b", "c"]);
  });

  test("setFieldDisabled blocks array writes for that field until cleared", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setFieldDisabled("items", true);
    form = h.render(options);

    form.useFieldArray("items").append("b");
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["a"]);

    form.setFieldDisabled("items", undefined);
    form = h.render(options);
    form.useFieldArray("items").append("b");
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["a", "b"]);
  });

  test("setReadOnly blocks field-array writes until cleared", () => {
    const h = createTestContext();

    const options: UseFormOptions<FieldArrayFormValues> = {
      initialValues: { items: ["a", "b"], note: "" },
      onSubmit: () => {},
    };

    let form = h.render(options);
    form.setReadOnly(true);
    form = h.render(options);

    form.useFieldArray("items").remove(0);
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["a", "b"]);

    form.setReadOnly(false);
    form = h.render(options);
    form.useFieldArray("items").move(1, 0);
    form = h.render(options);
    assert.deepEqual(form.useFieldArray("items").values, ["b", "a"]);
  });
});

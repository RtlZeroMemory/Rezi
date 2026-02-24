/**
 * packages/core/src/forms/__tests__/form.wizard.test.ts — Wizard behavior tests for useForm.
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

type WizardValues = {
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
  const widgetKey = "WizardTestWidget";
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
        useMemo: hookCtx.useMemo,
        useCallback: hookCtx.useCallback,
        useAppState: <U>(_selector: (s: State) => U): U => undefined as U,
        useTheme: () => null,
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

function createWizardOptions(
  overrides: Partial<UseFormOptions<WizardValues>> = {},
): UseFormOptions<WizardValues> {
  return {
    initialValues: {
      name: "",
      email: "",
      age: 0,
    },
    validate: (values) => {
      const errors: Partial<Record<keyof WizardValues, string>> = {};
      if (!values.name) {
        errors.name = "Name required";
      }
      if (!values.email) {
        errors.email = "Email required";
      }
      if (values.age < 18) {
        errors.age = "Age must be 18+";
      }
      return errors;
    },
    onSubmit: () => {},
    wizard: {
      steps: [
        { id: "step-account", fields: ["name"] },
        { id: "step-contact", fields: ["email"] },
        { id: "step-confirm", fields: ["age"] },
      ],
    },
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("useForm wizard", () => {
  test("exposes wizard metadata and clamps initial step", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      wizard: {
        initialStep: 99,
        steps: [
          { id: "step-account", fields: ["name"] },
          { id: "step-contact", fields: ["email"] },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    const form = h.render(options);

    assert.equal(form.hasWizard, true);
    assert.equal(form.stepCount, 3);
    assert.equal(form.currentStep, 2);
  });

  test("nextStep blocks on invalid current step and marks only step fields touched", () => {
    const h = createTestContext();
    const options = createWizardOptions();

    let form = h.render(options);
    const moved = form.nextStep();
    form = h.render(options);

    assert.equal(moved, false);
    assert.equal(form.currentStep, 0);
    assert.equal(form.touched.name, true);
    assert.equal(form.errors.name, "Name required");
    assert.equal(form.touched.email, undefined);
    assert.equal(form.errors.email, undefined);
  });

  test("nextStep advances when current step is valid even if future steps are invalid", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "",
        age: 0,
      },
    });

    let form = h.render(options);
    const moved = form.nextStep();
    form = h.render(options);

    assert.equal(moved, true);
    assert.equal(form.currentStep, 1);
    assert.equal(form.errors.email, undefined);
    assert.equal(form.errors.age, undefined);
  });

  test("nextStep called twice before rerender does not skip intermediate validation", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "",
        age: 30,
      },
    });

    let form = h.render(options);
    const movedFirst = form.nextStep();
    const movedSecond = form.nextStep();
    form = h.render(options);

    assert.equal(movedFirst, true);
    assert.equal(movedSecond, false);
    assert.equal(form.currentStep, 1);
    assert.equal(form.touched.email, true);
    assert.equal(form.errors.email, "Email required");
  });

  test("nextStep applies custom per-step validation", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      initialValues: {
        name: "Bob",
        email: "bob@example.com",
        age: 21,
      },
      wizard: {
        steps: [
          {
            id: "step-account",
            fields: ["name"],
            validate: (values) => {
              if (!values.name.startsWith("A")) {
                return { name: "Name must start with A" };
              }
              return {};
            },
          },
          { id: "step-contact", fields: ["email"] },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    let form = h.render(options);
    const moved = form.nextStep();
    form = h.render(options);

    assert.equal(moved, false);
    assert.equal(form.currentStep, 0);
    assert.equal(form.touched.name, true);
    assert.equal(form.errors.name, "Name must start with A");
  });

  test("nextStep at last step is a no-op that returns true", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "ada@example.com",
        age: 30,
      },
      wizard: {
        initialStep: 2,
        steps: [
          { id: "step-account", fields: ["name"] },
          { id: "step-contact", fields: ["email"] },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    let form = h.render(options);
    const moved = form.nextStep();
    form = h.render(options);

    assert.equal(moved, true);
    assert.equal(form.currentStep, 2);
  });

  test("previousStep navigates backward without running validation", () => {
    const h = createTestContext();
    let stepValidateCalls = 0;

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "",
        age: 0,
      },
      wizard: {
        initialStep: 1,
        steps: [
          { id: "step-account", fields: ["name"] },
          {
            id: "step-contact",
            fields: ["email"],
            validate: () => {
              stepValidateCalls++;
              return { email: "Should never be called" };
            },
          },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    let form = h.render(options);
    form.previousStep();
    form = h.render(options);

    assert.equal(stepValidateCalls, 0);
    assert.equal(form.currentStep, 0);
    assert.equal(form.errors.email, undefined);
  });

  test("goToStep blocks forward navigation when an intermediate step is invalid", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "",
        age: 30,
      },
    });

    let form = h.render(options);
    const moved = form.goToStep(2);
    form = h.render(options);

    assert.equal(moved, false);
    assert.equal(form.currentStep, 0);
    assert.equal(form.touched.email, true);
    assert.equal(form.errors.email, "Email required");
  });

  test("goToStep allows forward navigation when intermediate steps are valid", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "ada@example.com",
        age: 0,
      },
    });

    let form = h.render(options);
    const moved = form.goToStep(2);
    form = h.render(options);

    assert.equal(moved, true);
    assert.equal(form.currentStep, 2);
    assert.equal(form.errors.age, undefined);
  });

  test("goToStep backward navigation does not run validation", () => {
    const h = createTestContext();
    let stepValidateCalls = 0;

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "ada@example.com",
        age: 30,
      },
      wizard: {
        initialStep: 2,
        steps: [
          { id: "step-account", fields: ["name"] },
          {
            id: "step-contact",
            fields: ["email"],
            validate: () => {
              stepValidateCalls++;
              return { email: "Should never be called" };
            },
          },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    let form = h.render(options);
    const moved = form.goToStep(0);
    form = h.render(options);

    assert.equal(moved, true);
    assert.equal(stepValidateCalls, 0);
    assert.equal(form.currentStep, 0);
  });

  test("handleSubmit before last step advances wizard without submitting", () => {
    const h = createTestContext();
    let submitCalls = 0;

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "",
        age: 0,
      },
      onSubmit: () => {
        submitCalls++;
      },
    });

    let form = h.render(options);
    form.handleSubmit();
    form = h.render(options);

    assert.equal(form.currentStep, 1);
    assert.equal(form.submitCount, 0);
    assert.equal(submitCalls, 0);
  });

  test("handleSubmit before last step is gated by current-step validation", () => {
    const h = createTestContext();
    let submitCalls = 0;

    const options = createWizardOptions({
      onSubmit: () => {
        submitCalls++;
      },
    });

    let form = h.render(options);
    form.handleSubmit();
    form = h.render(options);

    assert.equal(form.currentStep, 0);
    assert.equal(form.submitCount, 0);
    assert.equal(submitCalls, 0);
    assert.equal(form.touched.name, true);
    assert.equal(form.errors.name, "Name required");
  });

  test("handleSubmit called twice before rerender does not skip step validation gates", () => {
    const h = createTestContext();
    let submitCalls = 0;

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "",
        age: 30,
      },
      onSubmit: () => {
        submitCalls++;
      },
    });

    let form = h.render(options);
    form.handleSubmit();
    form.handleSubmit();
    form = h.render(options);

    assert.equal(form.currentStep, 1);
    assert.equal(form.submitCount, 0);
    assert.equal(submitCalls, 0);
    assert.equal(form.touched.email, true);
    assert.equal(form.errors.email, "Email required");
  });

  test("form state is preserved across steps and reset restores initial step and values", () => {
    const h = createTestContext();

    const options = createWizardOptions({
      wizard: {
        initialStep: 1,
        steps: [
          { id: "step-account", fields: ["name"] },
          { id: "step-contact", fields: ["email"] },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    let form = h.render(options);

    form.setFieldValue("name", "Ada");
    form = h.render(options);
    form.setFieldValue("email", "ada@example.com");
    form = h.render(options);

    form.nextStep();
    form = h.render(options);
    form.previousStep();
    form = h.render(options);

    assert.equal(form.values.name, "Ada");
    assert.equal(form.values.email, "ada@example.com");
    assert.equal(form.currentStep, 1);

    form.reset();
    form = h.render(options);

    assert.equal(form.values.name, "");
    assert.equal(form.values.email, "");
    assert.equal(form.values.age, 0);
    assert.equal(form.currentStep, 1);
  });

  test("handleSubmit submits successfully on the last step", async () => {
    const h = createTestContext();
    const submissions: WizardValues[] = [];

    const options = createWizardOptions({
      initialValues: {
        name: "Ada",
        email: "ada@example.com",
        age: 30,
      },
      onSubmit: (values) => {
        submissions.push({ ...values });
      },
      wizard: {
        initialStep: 2,
        steps: [
          { id: "step-account", fields: ["name"] },
          { id: "step-contact", fields: ["email"] },
          { id: "step-confirm", fields: ["age"] },
        ],
      },
    });

    let form = h.render(options);
    form.handleSubmit();
    await flushMicrotasks();
    form = h.render(options);

    assert.equal(submissions.length, 1);
    assert.deepEqual(submissions[0], {
      name: "Ada",
      email: "ada@example.com",
      age: 30,
    });
    assert.equal(form.submitCount, 1);
    assert.equal(form.currentStep, 2);
  });
});

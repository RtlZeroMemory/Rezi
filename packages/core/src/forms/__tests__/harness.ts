import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import type { WidgetContext } from "../../widgets/composition.js";
import type { UseFormOptions, UseFormReturn } from "../types.js";
import { useForm } from "../useForm.js";

export function createFormHarness<State = void>(): {
  render: <T extends Record<string, unknown>>(options: UseFormOptions<T>) => UseFormReturn<T>;
  unmount: () => void;
  getInvalidateCount: () => number;
} {
  const registry = createCompositeInstanceRegistry();
  const instanceId = 1;
  const widgetKey = "FormHarness";
  registry.create(instanceId, widgetKey);

  let invalidateCount = 0;

  return {
    render: <T extends Record<string, unknown>>(options: UseFormOptions<T>): UseFormReturn<T> => {
      const state = registry.get(instanceId);
      if (!state) {
        throw new Error("form harness: instance missing");
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

export async function flushMicrotasks(turns = 2): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

import type { VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";

export type StressExampleState = Readonly<{
  phase: number;
  turbo: boolean;
}>;

export type StressExampleAction =
  | Readonly<{ type: "advance-phase" }>
  | Readonly<{ type: "rewind-phase" }>
  | Readonly<{ type: "toggle-turbo" }>;

export function reduceStressExampleState(
  state: StressExampleState,
  action: StressExampleAction,
): StressExampleState {
  if (action.type === "advance-phase") {
    return { ...state, phase: Math.min(5, state.phase + 1) };
  }
  if (action.type === "rewind-phase") {
    return { ...state, phase: Math.max(1, state.phase - 1) };
  }
  if (action.type === "toggle-turbo") {
    return { ...state, turbo: !state.turbo };
  }
  return state;
}

export type StressExampleCommand = "quit" | "advance-phase" | "rewind-phase" | "toggle-turbo";

const COMMAND_BY_KEY: Readonly<Record<string, StressExampleCommand>> = Object.freeze({
  q: "quit",
  "+": "advance-phase",
  "-": "rewind-phase",
  z: "toggle-turbo",
});

export function resolveStressExampleCommand(key: string): StressExampleCommand | undefined {
  return COMMAND_BY_KEY[key.toLowerCase()];
}

export function renderStressExampleWidget(state: StressExampleState): VNode {
  return ui.column({ gap: 1 }, [
    ui.text("Stress Template Test Widget", { variant: "heading" }),
    ui.text(`Phase: ${String(state.phase)}`),
    ui.text(`Turbo: ${state.turbo ? "on" : "off"}`),
  ]);
}

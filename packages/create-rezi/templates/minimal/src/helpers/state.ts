import { cycleTheme } from "../theme.js";
import type { MinimalAction, MinimalState } from "../types.js";

export function createInitialState(): MinimalState {
  return {
    count: 0,
    showHelp: false,
    themeName: "nord",
    lastError: null,
  };
}

export function reduceMinimalState(state: MinimalState, action: MinimalAction): MinimalState {
  if (action.type === "increment") return { ...state, count: state.count + 1 };
  if (action.type === "decrement") return { ...state, count: state.count - 1 };
  if (action.type === "toggle-help") return { ...state, showHelp: !state.showHelp };
  if (action.type === "cycle-theme") return { ...state, themeName: cycleTheme(state.themeName) };
  if (action.type === "set-error") return { ...state, lastError: action.message };
  return state;
}

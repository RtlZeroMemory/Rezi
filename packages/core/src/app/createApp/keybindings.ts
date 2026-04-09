import type { ZrUiErrorCode } from "../../abi.js";
import { describeThrown } from "../../debug/describeThrown.js";
import type {
  BindingMap,
  KeyContext,
  KeybindingManagerState,
  ModeBindingMap,
} from "../../keybindings/index.js";
import {
  registerBindings,
  registerModes,
  removeBindingsBySource,
} from "../../keybindings/index.js";
import { ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { DIRTY_VIEW } from "./dirtyPlan.js";

const ROUTE_KEYBINDING_SOURCE = "__rezi:router";

type CreateAppKeybindingHelpersOptions<S> = Readonly<{
  getState: () => KeybindingManagerState<KeyContext<S>>;
  markDirty: (flags: number) => void;
  setState: (nextState: KeybindingManagerState<KeyContext<S>>) => void;
  throwCode: (code: ZrUiErrorCode, detail: string) => never;
}>;

export type AppKeybindingHelpers<S> = Readonly<{
  applyRoutedKeybindingState: (
    routeInputState: KeybindingManagerState<KeyContext<S>>,
    routeNextState: KeybindingManagerState<KeyContext<S>>,
  ) => void;
  registerAppBindings: (
    bindings: BindingMap<KeyContext<S>>,
    options?: Readonly<{ sourceTag?: string; method?: string }>,
  ) => void;
  registerAppModes: (modes: ModeBindingMap<KeyContext<S>>) => void;
  replaceRouteBindings: (bindings: BindingMap<KeyContext<S>>) => void;
}>;

export function codepointToKeyCode(codepoint: number): number | null {
  if (codepoint >= 97 && codepoint <= 122) {
    return codepoint - 32;
  }
  if (codepoint >= 65 && codepoint <= 90) {
    return codepoint;
  }
  if (codepoint >= 32 && codepoint <= 126) {
    return codepoint;
  }
  return null;
}

export function codepointToCtrlKeyCode(codepoint: number): number | null {
  if (codepoint === 9 || codepoint === 13) {
    return null;
  }
  if (codepoint >= 1 && codepoint <= 26) {
    return codepoint + 64;
  }
  if (codepoint >= 28 && codepoint <= 31) {
    return codepoint + 64;
  }
  return null;
}

export function codepointToImplicitTextMods(codepoint: number): number {
  if (codepoint >= 65 && codepoint <= 90) {
    return ZR_MOD_SHIFT;
  }
  return 0;
}

export function computeKeybindingsEnabled<S>(
  state: KeybindingManagerState<KeyContext<S>>,
): boolean {
  for (const mode of state.modes.values()) {
    if (mode.bindings.length > 0) return true;
  }
  return false;
}

export function formatInvalidKeybindingDetail(
  invalidKeys: readonly Readonly<{ key: string; detail: string }>[],
): string {
  return invalidKeys.map((invalid) => `"${invalid.key}": ${invalid.detail}`).join("; ");
}

export function createAppKeybindingHelpers<S>(
  options: CreateAppKeybindingHelpersOptions<S>,
): AppKeybindingHelpers<S> {
  function registerAppBindings(
    bindings: BindingMap<KeyContext<S>>,
    registerOptions?: Readonly<{ sourceTag?: string; method?: string }>,
  ): void {
    const result = registerBindings(options.getState(), bindings, {
      ...(registerOptions?.sourceTag === undefined ? {} : { sourceTag: registerOptions.sourceTag }),
    });
    if (result.invalidKeys.length > 0) {
      const method = registerOptions?.method ?? "keys";
      options.throwCode(
        "ZRUI_INVALID_PROPS",
        `${method}: invalid keybinding sequence(s): ${formatInvalidKeybindingDetail(result.invalidKeys)}`,
      );
    }
    options.setState(result.state);
  }

  function registerAppModes(modes: ModeBindingMap<KeyContext<S>>): void {
    let result: Readonly<{
      state: KeybindingManagerState<KeyContext<S>>;
      invalidKeys: readonly Readonly<{ key: string; detail: string }>[];
    }>;
    try {
      result = registerModes(options.getState(), modes);
    } catch (error: unknown) {
      options.throwCode("ZRUI_INVALID_PROPS", `modes: ${describeThrown(error)}`);
    }
    if (result.invalidKeys.length > 0) {
      options.throwCode(
        "ZRUI_INVALID_PROPS",
        `modes: invalid keybinding sequence(s): ${formatInvalidKeybindingDetail(result.invalidKeys)}`,
      );
    }
    options.setState(result.state);
  }

  function replaceRouteBindings(bindings: BindingMap<KeyContext<S>>): void {
    const baseState = removeBindingsBySource(options.getState(), ROUTE_KEYBINDING_SOURCE);
    if (Object.keys(bindings).length === 0) {
      options.setState(baseState);
      return;
    }

    const result = registerBindings(baseState, bindings, {
      sourceTag: ROUTE_KEYBINDING_SOURCE,
    });
    if (result.invalidKeys.length > 0) {
      options.throwCode(
        "ZRUI_INVALID_PROPS",
        `replaceRoutes: invalid keybinding sequence(s): ${formatInvalidKeybindingDetail(result.invalidKeys)}`,
      );
    }
    options.setState(result.state);
  }

  function applyRoutedKeybindingState(
    routeInputState: KeybindingManagerState<KeyContext<S>>,
    routeNextState: KeybindingManagerState<KeyContext<S>>,
  ): void {
    const currentState = options.getState();
    const previousChordState = currentState.chordState;

    if (currentState === routeInputState) {
      options.setState(routeNextState);
      if (routeNextState.chordState !== previousChordState) {
        options.markDirty(DIRTY_VIEW);
      }
      return;
    }

    if (currentState.currentMode !== routeInputState.currentMode) {
      return;
    }

    const nextState = Object.freeze({
      ...currentState,
      chordState: routeNextState.chordState,
    });
    options.setState(nextState);
    if (nextState.chordState !== previousChordState) {
      options.markDirty(DIRTY_VIEW);
    }
  }

  return {
    applyRoutedKeybindingState,
    registerAppBindings,
    registerAppModes,
    replaceRouteBindings,
  };
}

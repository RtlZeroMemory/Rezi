/**
 * packages/core/src/keybindings/manager.ts — Keybinding registry and event routing.
 *
 * Why: Central manager for registering keybindings, handling mode switching,
 * and routing key events through the binding system. Provides the main API
 * for the app runtime to integrate keybindings.
 *
 * @see docs/guide/input-and-focus.md
 */

import type { ZrevEvent } from "../events.js";
import {
  CHORD_TIMEOUT_MS,
  INITIAL_CHORD_STATE,
  type TrieNode,
  buildTrie,
  matchKey,
  resetChordState,
} from "./chordMatcher.js";
import { modsFromBitmask } from "./keyCodes.js";
import { keyToString, keysEqual, parseKeySequence, sequenceToString } from "./parser.js";
import type {
  ChordState,
  KeyBinding,
  KeyContext,
  KeySequence,
  MatchResult,
  ModeDefinition,
  ParsedKey,
} from "./types.js";

/** Default mode name. */
export const DEFAULT_MODE = "default";

/**
 * Internal mode structure with computed trie.
 */
type CompiledMode<C> = Readonly<{
  name: string;
  bindings: readonly KeyBinding<C>[];
  parent?: string;
  trie: TrieNode<C>;
}>;

/**
 * State of the keybinding manager.
 *
 * @typeParam C - Context type (usually KeyContext<S>)
 */
export type KeybindingManagerState<C> = Readonly<{
  /** Current active mode name */
  currentMode: string;
  /** Chord state for multi-key sequences */
  chordState: ChordState;
  /** Registered modes with their bindings */
  modes: ReadonlyMap<string, CompiledMode<C>>;
}>;

/**
 * Create initial manager state with empty default mode.
 *
 * @returns Fresh manager state
 */
export function createManagerState<C>(): KeybindingManagerState<C> {
  const defaultMode: CompiledMode<C> = Object.freeze({
    name: DEFAULT_MODE,
    bindings: Object.freeze([]),
    trie: buildTrie([]),
  });

  return Object.freeze({
    currentMode: DEFAULT_MODE,
    chordState: INITIAL_CHORD_STATE,
    modes: new Map([[DEFAULT_MODE, defaultMode]]),
  });
}

/**
 * Handler function type for simple binding registration.
 */
export type KeyHandler<C> = (ctx: C) => void;

/**
 * Binding definition with optional priority and when condition.
 */
export type BindingDefinition<C> =
  | KeyHandler<C>
  | Readonly<{
      handler: KeyHandler<C>;
      priority?: number;
      when?: (ctx: C) => boolean;
      description?: string;
    }>;

/**
 * Binding map for simple registration: key string -> handler or definition.
 */
export type BindingMap<C> = Readonly<Record<string, BindingDefinition<C>>>;

/**
 * Options for registering bindings.
 */
export type RegisterBindingsOptions = Readonly<{
  /** Mode to register bindings in (default: "default") */
  mode?: string;
}>;

/**
 * Invalid key string collected during parsing.
 */
export type InvalidKey = Readonly<{
  key: string;
  detail: string;
}>;

/**
 * Result of parsing binding definitions.
 */
export type ParseBindingsResult<C> = Readonly<{
  bindings: readonly KeyBinding<C>[];
  invalidKeys: readonly InvalidKey[];
}>;

/**
 * Parse binding definitions into KeyBinding array.
 * Returns both valid bindings and any invalid keys that were skipped.
 */
function parseBindings<C>(map: BindingMap<C>): ParseBindingsResult<C> {
  const bindings: KeyBinding<C>[] = [];
  const invalidKeys: InvalidKey[] = [];

  for (const [keyStr, def] of Object.entries(map)) {
    const parsed = parseKeySequence(keyStr);
    if (!parsed.ok) {
      invalidKeys.push({ key: keyStr, detail: parsed.error.detail });
      continue;
    }

    let handler: KeyHandler<C>;
    let priority = 0;
    let when: ((ctx: C) => boolean) | undefined;
    let description: string | undefined;

    if (typeof def === "function") {
      handler = def;
    } else {
      handler = def.handler;
      priority = def.priority ?? 0;
      when = def.when;
      description = def.description;
    }

    const binding: KeyBinding<C> =
      when !== undefined && description !== undefined
        ? Object.freeze({ sequence: parsed.value, priority, handler, when, description })
        : when !== undefined
          ? Object.freeze({ sequence: parsed.value, priority, handler, when })
          : description !== undefined
            ? Object.freeze({ sequence: parsed.value, priority, handler, description })
            : Object.freeze({ sequence: parsed.value, priority, handler });

    bindings.push(binding);
  }

  return Object.freeze({
    bindings: Object.freeze(bindings),
    invalidKeys: Object.freeze(invalidKeys),
  });
}

function keySequencesEqual(a: KeySequence, b: KeySequence): boolean {
  if (a.keys.length !== b.keys.length) return false;
  for (let i = 0; i < a.keys.length; i++) {
    const aKey = a.keys[i];
    const bKey = b.keys[i];
    if (!aKey || !bKey || !keysEqual(aKey, bKey)) return false;
  }
  return true;
}

function mergeBindingsReplacingSequences<C>(
  existing: readonly KeyBinding<C>[],
  incoming: readonly KeyBinding<C>[],
): KeyBinding<C>[] {
  const merged = [...existing];
  for (const next of incoming) {
    for (let i = merged.length - 1; i >= 0; i--) {
      const current = merged[i];
      if (current && keySequencesEqual(current.sequence, next.sequence)) {
        merged.splice(i, 1);
      }
    }
    merged.push(next);
  }
  return merged;
}

/**
 * Result of registering bindings.
 */
export type RegisterBindingsResult<C> = Readonly<{
  state: KeybindingManagerState<C>;
  invalidKeys: readonly InvalidKey[];
}>;

/**
 * Register keybindings in the manager.
 *
 * Bindings are added to the specified mode (default mode if not specified).
 * If the mode doesn't exist, it is created.
 *
 * @param state - Current manager state
 * @param bindings - Binding map (key string -> handler)
 * @param options - Registration options
 * @returns New manager state with bindings registered and any invalid keys
 */
export function registerBindings<C>(
  state: KeybindingManagerState<C>,
  bindings: BindingMap<C>,
  options?: RegisterBindingsOptions,
): RegisterBindingsResult<C> {
  const modeName = options?.mode ?? DEFAULT_MODE;
  const parsed = parseBindings(bindings);

  const existingMode = state.modes.get(modeName);
  const existingBindings = existingMode?.bindings ?? [];

  // Merge bindings while replacing existing entries for the same key sequence.
  const mergedBindings = mergeBindingsReplacingSequences(existingBindings, parsed.bindings);
  const mergedTrie = buildTrie(mergedBindings);

  const parentName = existingMode?.parent;
  const newMode: CompiledMode<C> = parentName
    ? Object.freeze({
        name: modeName,
        bindings: Object.freeze(mergedBindings),
        parent: parentName,
        trie: mergedTrie,
      })
    : Object.freeze({
        name: modeName,
        bindings: Object.freeze(mergedBindings),
        trie: mergedTrie,
      });

  const newModes = new Map(state.modes);
  newModes.set(modeName, newMode);

  return Object.freeze({
    state: Object.freeze({
      ...state,
      modes: newModes,
    }),
    invalidKeys: parsed.invalidKeys,
  });
}

/**
 * Mode definition for registration.
 */
export type ModeBindingMap<C> = Readonly<{
  [modeName: string]: BindingMap<C> | ModeWithParent<C>;
}>;

/**
 * Mode definition with optional parent.
 */
export type ModeWithParent<C> = Readonly<{
  parent?: string;
  bindings: BindingMap<C>;
}>;

function isModeWithParent<C>(v: BindingMap<C> | ModeWithParent<C>): v is ModeWithParent<C> {
  return typeof v === "object" && v !== null && "bindings" in v;
}

/**
 * Result of registering modes.
 */
export type RegisterModesResult<C> = Readonly<{
  state: KeybindingManagerState<C>;
  invalidKeys: readonly InvalidKey[];
}>;

/**
 * Register multiple modes with their bindings.
 *
 * @param state - Current manager state
 * @param modes - Map of mode names to binding maps
 * @returns New manager state with modes registered and any invalid keys
 */
export function registerModes<C>(
  state: KeybindingManagerState<C>,
  modes: ModeBindingMap<C>,
): RegisterModesResult<C> {
  let newState = state;
  const allInvalidKeys: InvalidKey[] = [];

  for (const [modeName, modeDef] of Object.entries(modes)) {
    let bindingMap: BindingMap<C>;
    let parent: string | undefined;

    if (isModeWithParent(modeDef)) {
      bindingMap = modeDef.bindings;
      parent = modeDef.parent;
    } else {
      bindingMap = modeDef;
    }

    const parsed = parseBindings(bindingMap);
    for (const inv of parsed.invalidKeys) {
      allInvalidKeys.push(inv);
    }

    const existingMode = newState.modes.get(modeName);
    const existingBindings = existingMode?.bindings ?? [];
    const mergedBindings = mergeBindingsReplacingSequences(existingBindings, parsed.bindings);
    const mergedTrie = buildTrie(mergedBindings);

    const parentName = parent ?? existingMode?.parent;
    const newMode: CompiledMode<C> = parentName
      ? Object.freeze({
          name: modeName,
          bindings: Object.freeze(mergedBindings),
          parent: parentName,
          trie: mergedTrie,
        })
      : Object.freeze({
          name: modeName,
          bindings: Object.freeze(mergedBindings),
          trie: mergedTrie,
        });

    const newModes = new Map(newState.modes);
    newModes.set(modeName, newMode);

    newState = Object.freeze({
      ...newState,
      modes: newModes,
    });
  }

  return Object.freeze({
    state: newState,
    invalidKeys: Object.freeze(allInvalidKeys),
  });
}

/**
 * Switch to a different mode.
 *
 * Resets chord state when switching modes.
 *
 * @param state - Current manager state
 * @param modeName - Name of the mode to switch to
 * @returns New manager state with mode switched
 */
export function setMode<C>(
  state: KeybindingManagerState<C>,
  modeName: string,
): KeybindingManagerState<C> {
  if (state.currentMode === modeName) return state;

  // Mode names must be registered up front.
  if (!state.modes.has(modeName)) {
    throw new Error(
      `unknown keybinding mode "${modeName}" (register it first via app.modes() or registerBindings(..., { mode }))`,
    );
  }

  return Object.freeze({
    ...state,
    currentMode: modeName,
    chordState: resetChordState(),
    modes: state.modes,
  });
}

/**
 * Get the current mode name.
 *
 * @param state - Manager state
 * @returns Current mode name
 */
export function getMode<C>(state: KeybindingManagerState<C>): string {
  return state.currentMode;
}

/**
 * Introspection record for a registered keybinding.
 */
export type RegisteredBinding = Readonly<{
  sequence: string;
  description?: string;
  mode: string;
}>;

/**
 * Get registered keybindings as user-facing sequence strings.
 *
 * @param state - Manager state
 * @param mode - Optional mode name to filter by
 * @returns Bindings in registration order (grouped by mode insertion order)
 */
export function getBindings<C>(
  state: KeybindingManagerState<C>,
  mode?: string,
): readonly RegisteredBinding[] {
  const out: RegisteredBinding[] = [];

  if (mode !== undefined) {
    const compiled = state.modes.get(mode);
    if (!compiled) return Object.freeze(out);
    for (const binding of compiled.bindings) {
      out.push(
        binding.description === undefined
          ? Object.freeze({
              sequence: sequenceToString(binding.sequence),
              mode,
            })
          : Object.freeze({
              sequence: sequenceToString(binding.sequence),
              description: binding.description,
              mode,
            }),
      );
    }
    return Object.freeze(out);
  }

  for (const [modeName, compiled] of state.modes) {
    for (const binding of compiled.bindings) {
      out.push(
        binding.description === undefined
          ? Object.freeze({
              sequence: sequenceToString(binding.sequence),
              mode: modeName,
            })
          : Object.freeze({
              sequence: sequenceToString(binding.sequence),
              description: binding.description,
              mode: modeName,
            }),
      );
    }
  }

  return Object.freeze(out);
}

/**
 * Get pending chord as a sequence string, or null when idle.
 */
export function getPendingChord<C>(state: KeybindingManagerState<C>): string | null {
  const pendingKeys = state.chordState.pendingKeys;
  if (pendingKeys.length === 0) return null;
  return pendingKeys.map((key) => keyToString(key)).join(" ");
}

/**
 * Result of routing a key event.
 */
export type RouteKeyResult<C> = Readonly<{
  /** New manager state after processing */
  nextState: KeybindingManagerState<C>;
  /** Whether the key was consumed (matched or pending) */
  consumed: boolean;
  /** Error thrown by handler, if any */
  handlerError?: unknown;
}>;

/**
 * Try to match a key in a mode and its parents.
 */
function matchInModeChain<C>(
  state: KeybindingManagerState<C>,
  key: ParsedKey,
  timeMs: number,
  context: C,
): { nextChordState: ChordState; result: MatchResult<C> } {
  let modeName: string | undefined = state.currentMode;
  const visited = new Set<string>();

  while (modeName !== undefined) {
    if (visited.has(modeName)) break; // Prevent infinite loops
    visited.add(modeName);

    const mode = state.modes.get(modeName);
    if (!mode) break;

    const matchResult = matchKey(mode.trie, state.chordState, key, timeMs);

    if (matchResult.result.kind === "matched") {
      const binding = matchResult.result.binding;

      // Check when condition
      if (binding.when && !binding.when(context)) {
        // Condition failed, continue to parent
        modeName = mode.parent;
        continue;
      }

      return {
        nextChordState: matchResult.nextState,
        result: matchResult.result,
      };
    }

    if (matchResult.result.kind === "pending") {
      return {
        nextChordState: matchResult.nextState,
        result: matchResult.result,
      };
    }

    // No match in this mode, try parent
    modeName = mode.parent;
  }

  return {
    nextChordState: resetChordState(),
    result: Object.freeze({ kind: "none" }),
  };
}

/**
 * Route a key event through the keybinding system.
 *
 * Only processes "key" events with "down" action.
 * Returns consumed=true if the key matched a binding or is pending for a chord.
 *
 * @param state - Current manager state
 * @param event - Engine event from ZREV
 * @param context - Context to pass to handlers
 * @returns New state and consumed flag
 */
export function routeKeyEvent<S>(
  state: KeybindingManagerState<KeyContext<S>>,
  event: ZrevEvent,
  context: KeyContext<S>,
): RouteKeyResult<KeyContext<S>> {
  // Only handle key down events
  if (event.kind !== "key" || event.action !== "down") {
    return { nextState: state, consumed: false };
  }

  // Convert event to ParsedKey
  const key: ParsedKey = { key: event.key, mods: modsFromBitmask(event.mods) };

  // Match in current mode chain
  const { nextChordState, result } = matchInModeChain(state, key, event.timeMs, context);

  const nextState: KeybindingManagerState<KeyContext<S>> = Object.freeze({
    ...state,
    chordState: nextChordState,
  });

  if (result.kind === "matched") {
    // Execute handler
    try {
      result.binding.handler(context);
    } catch (e) {
      // Return error to caller instead of logging
      return { nextState, consumed: true, handlerError: e };
    }
    return { nextState, consumed: true };
  }

  if (result.kind === "pending") {
    // Chord in progress, consume the key
    return { nextState, consumed: true };
  }

  // No match
  return { nextState, consumed: false };
}

// Re-export for convenience
export { CHORD_TIMEOUT_MS };

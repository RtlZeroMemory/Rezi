/**
 * packages/core/src/keybindings/types.ts — Keybinding system type definitions.
 *
 * Why: Defines the TypeScript representations of key sequences, bindings, and
 * modal contexts. These types form the contract between the parser, matcher,
 * and manager components of the keybinding system.
 *
 * @see docs/guide/input-and-focus.md
 */

/**
 * Keyboard modifier state.
 * Matches the ZREV modifier bitmask semantics.
 */
export type Modifiers = Readonly<{
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}>;

/**
 * A single parsed key with its code and modifiers.
 * key is the numeric key code (see keyCodes.ts).
 */
export type ParsedKey = Readonly<{
  key: number;
  mods: Modifiers;
}>;

/**
 * A sequence of keys forming a keybinding.
 * Single keys have length 1; chord sequences have length > 1.
 */
export type KeySequence = Readonly<{
  keys: readonly ParsedKey[];
}>;

/**
 * Context passed to keybinding handlers.
 * Provides state access and update capability.
 *
 * @typeParam S - Application state type
 */
export type KeyContext<S> = Readonly<{
  /** Current committed application state (read-only) */
  state: Readonly<S>;
  /** Schedule a state update (same as app.update()) */
  update: (updater: S | ((prev: Readonly<S>) => S)) => void;
  /** Currently focused widget ID, or null if nothing focused */
  focusedId: string | null;
}>;

/**
 * A keybinding definition.
 *
 * @typeParam C - Context type (usually KeyContext<S>)
 */
export type KeyBinding<C> = Readonly<{
  /** Parsed key sequence to match */
  sequence: KeySequence;
  /**
   * Priority for conflict resolution.
   * Higher priority bindings are checked first.
   * Default is 0.
   */
  priority: number;
  /** Handler function called when binding matches */
  handler: (ctx: C) => void;
  /**
   * Optional condition function.
   * When present, binding only matches if when(ctx) returns true.
   */
  when?: (ctx: C) => boolean;
  /** Optional user-facing description for help overlays/introspection. */
  description?: string;
}>;

/**
 * A mode definition for modal keybindings (e.g., Vim normal/insert).
 *
 * @typeParam C - Context type (usually KeyContext<S>)
 */
export type ModeDefinition<C> = Readonly<{
  /** Unique mode name */
  name: string;
  /** Bindings active in this mode */
  bindings: readonly KeyBinding<C>[];
  /**
   * Optional parent mode name.
   * If a binding is not found in this mode, the parent mode is searched.
   */
  parent?: string;
}>;

/**
 * Result of chord matching.
 *
 * Discriminated union:
 *   - "matched": Complete sequence matched, execute the binding
 *   - "pending": Partial match, waiting for more keys
 *   - "none": No match found
 */
export type MatchResult<C> =
  | Readonly<{ kind: "matched"; binding: KeyBinding<C> }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "none" }>;

/**
 * State for tracking in-progress chord sequences.
 */
export type ChordState = Readonly<{
  /** Keys pressed so far in the current chord */
  pendingKeys: readonly ParsedKey[];
  /** Timestamp (ms) when chord started (for timeout detection) */
  startTimeMs: number;
}>;

/**
 * Error returned when parsing a key sequence string fails.
 */
export type KeyParseError = Readonly<{
  /** Error code for programmatic handling */
  code: "INVALID_KEY" | "EMPTY_SEQUENCE" | "INVALID_MODIFIER";
  /** Human-readable detail */
  detail: string;
}>;

/**
 * Result of parsing a key sequence string.
 */
export type ParseKeyResult =
  | Readonly<{ ok: true; value: KeySequence }>
  | Readonly<{ ok: false; error: KeyParseError }>;

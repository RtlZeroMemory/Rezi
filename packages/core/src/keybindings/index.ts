/**
 * packages/core/src/keybindings/index.ts — Public exports for keybinding system.
 *
 * Why: Single entry point for keybinding functionality. Re-exports types,
 * constants, and functions needed by the app runtime and users.
 *
 * @see docs/guide/input-and-focus.md
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  ChordState,
  KeyBinding,
  KeyContext,
  KeyParseError,
  KeySequence,
  MatchResult,
  ModeDefinition,
  Modifiers,
  ParsedKey,
  ParseKeyResult,
} from "./types.js";

export type {
  BindingDefinition,
  BindingMap,
  InvalidKey,
  RegisteredBinding,
  KeybindingManagerState,
  KeyHandler,
  ModeBindingMap,
  ModeWithParent,
  ParseBindingsResult,
  RegisterBindingsOptions,
  RegisterBindingsResult,
  RegisterModesResult,
  RouteKeyResult,
} from "./manager.js";

export type { ChordMatchResult, TrieNode } from "./chordMatcher.js";

// =============================================================================
// Key Codes and Constants
// =============================================================================

export {
  // Key codes
  ZR_KEY_UNKNOWN,
  ZR_KEY_ESCAPE,
  ZR_KEY_ENTER,
  ZR_KEY_TAB,
  ZR_KEY_BACKSPACE,
  ZR_KEY_INSERT,
  ZR_KEY_DELETE,
  ZR_KEY_HOME,
  ZR_KEY_END,
  ZR_KEY_PAGE_UP,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_UP,
  ZR_KEY_DOWN,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_F1,
  ZR_KEY_F2,
  ZR_KEY_F3,
  ZR_KEY_F4,
  ZR_KEY_F5,
  ZR_KEY_F6,
  ZR_KEY_F7,
  ZR_KEY_F8,
  ZR_KEY_F9,
  ZR_KEY_F10,
  ZR_KEY_F11,
  ZR_KEY_F12,
  ZR_KEY_SPACE,
  // Modifier bits
  ZR_MOD_SHIFT,
  ZR_MOD_CTRL,
  ZR_MOD_ALT,
  ZR_MOD_META,
  // Maps and utilities
  KEY_NAME_TO_CODE,
  MODIFIER_NAMES,
  EMPTY_MODS,
  charToKeyCode,
  modsFromBitmask,
  modsToBitmask,
  makeTrieKey,
} from "./keyCodes.js";

// =============================================================================
// Parser
// =============================================================================

export {
  parseKeySequence,
  keysEqual,
  keyToString,
  sequenceToString,
} from "./parser.js";

// =============================================================================
// Chord Matcher
// =============================================================================

export {
  CHORD_TIMEOUT_MS,
  INITIAL_CHORD_STATE,
  buildTrie,
  matchKey,
  isChordTimedOut,
  resetChordState,
} from "./chordMatcher.js";

// =============================================================================
// Manager
// =============================================================================

export {
  DEFAULT_MODE,
  createManagerState,
  getBindings,
  registerBindings,
  getPendingChord,
  registerModes,
  setMode,
  getMode,
  routeKeyEvent,
} from "./manager.js";

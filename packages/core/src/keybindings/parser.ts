/**
 * packages/core/src/keybindings/parser.ts — Parse keybinding strings to KeySequence.
 *
 * Why: Converts human-readable keybinding strings like "ctrl+s" or "g g" into
 * structured KeySequence objects that can be used for matching. Handles single
 * keys, modifier combinations, and chord sequences.
 *
 * Format examples:
 *   - Single key: "a", "escape", "f1"
 *   - With modifiers: "ctrl+s", "shift+a", "ctrl+shift+z"
 *   - Chords (space-separated): "g g", "ctrl+k ctrl+c"
 *
 * @see docs/guide/input-and-focus.md
 */

import { EMPTY_MODS, KEY_NAME_TO_CODE, MODIFIER_NAMES, charToKeyCode } from "./keyCodes.js";
import type { KeyParseError, KeySequence, Modifiers, ParseKeyResult, ParsedKey } from "./types.js";

/**
 * Parse a single key part (e.g., "ctrl+s" or just "a").
 *
 * @param part - Single key/modifier combination (no spaces)
 * @returns ParsedKey or error
 */
function parseKeyPart(
  part: string,
): { ok: true; value: ParsedKey } | { ok: false; error: KeyParseError } {
  if (part.length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_SEQUENCE", detail: "empty key part" },
    };
  }

  const lower = part.toLowerCase();

  // Split on "+" to get modifiers and key
  const pieces = lower.split("+");
  if (pieces.length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_SEQUENCE", detail: "empty key part" },
    };
  }

  let shift = false;
  let ctrl = false;
  let alt = false;
  let meta = false;
  let keyName: string | undefined;
  const seenModifiers = new Set<"shift" | "ctrl" | "alt" | "meta">();

  // Process each piece - all but last should be modifiers, last is the key
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (piece === undefined || piece.length === 0) {
      return {
        ok: false,
        error: { code: "INVALID_KEY", detail: `empty component in "${part}"` },
      };
    }

    const isLast = i === pieces.length - 1;

    if (MODIFIER_NAMES.has(piece)) {
      // It's a modifier
      let modifier: "shift" | "ctrl" | "alt" | "meta" | null = null;
      switch (piece) {
        case "shift":
          modifier = "shift";
          shift = true;
          break;
        case "ctrl":
        case "control":
          modifier = "ctrl";
          ctrl = true;
          break;
        case "alt":
          modifier = "alt";
          alt = true;
          break;
        case "meta":
        case "cmd":
        case "command":
        case "win":
        case "super":
          modifier = "meta";
          meta = true;
          break;
      }
      if (modifier === null) {
        return {
          ok: false,
          error: {
            code: "INVALID_MODIFIER",
            detail: `"${piece}" is not a valid modifier in "${part}"`,
          },
        };
      }
      if (seenModifiers.has(modifier)) {
        return {
          ok: false,
          error: {
            code: "INVALID_MODIFIER",
            detail: `duplicate modifier "${piece}" in "${part}"`,
          },
        };
      }
      seenModifiers.add(modifier);
      // If this is the last piece and it's a modifier, that's an error
      if (isLast) {
        return {
          ok: false,
          error: {
            code: "INVALID_KEY",
            detail: `modifier "${piece}" cannot be the final key in "${part}"`,
          },
        };
      }
    } else {
      // It's a key name
      if (!isLast) {
        // Non-modifier in non-last position
        return {
          ok: false,
          error: {
            code: "INVALID_MODIFIER",
            detail: `"${piece}" is not a valid modifier in "${part}"`,
          },
        };
      }
      keyName = piece;
    }
  }

  if (keyName === undefined) {
    return {
      ok: false,
      error: { code: "INVALID_KEY", detail: `no key found in "${part}"` },
    };
  }

  // Look up the key code
  let keyCode: number | null = null;

  // First try named keys
  const namedCode = KEY_NAME_TO_CODE.get(keyName);
  if (namedCode !== undefined) {
    keyCode = namedCode;
  } else if (keyName.length === 1) {
    // Single character - convert to key code
    keyCode = charToKeyCode(keyName);
  }

  if (keyCode === null) {
    return {
      ok: false,
      error: { code: "INVALID_KEY", detail: `unknown key "${keyName}" in "${part}"` },
    };
  }

  const mods: Modifiers = Object.freeze({ shift, ctrl, alt, meta });

  return {
    ok: true,
    value: Object.freeze({ key: keyCode, mods }),
  };
}

/**
 * Parse a keybinding string into a KeySequence.
 *
 * Supports:
 *   - Single keys: "a", "escape", "f1"
 *   - With modifiers: "ctrl+s", "shift+a", "ctrl+shift+z"
 *   - Chord sequences (space-separated): "g g", "ctrl+k ctrl+c"
 *
 * Modifier names (case-insensitive):
 *   - shift
 *   - ctrl, control
 *   - alt
 *   - meta, cmd, command, win, super
 *
 * Key names (case-insensitive):
 *   - Single letters: a-z
 *   - Digits: 0-9
 *   - Named keys: escape, enter, tab, backspace, space, etc.
 *   - Function keys: f1-f12
 *   - Navigation: up, down, left, right, home, end, pageup, pagedown
 *   - Editing: insert, delete
 *
 * @param input - Keybinding string to parse
 * @returns ParseKeyResult with KeySequence or error
 *
 * @example
 * ```ts
 * parseKeySequence("ctrl+s")      // Single key with modifier
 * parseKeySequence("g g")         // Two-key chord
 * parseKeySequence("ctrl+k ctrl+c") // Chord with modifiers
 * ```
 */
export function parseKeySequence(input: string): ParseKeyResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_SEQUENCE", detail: "keybinding string is empty" },
    };
  }

  // Split on whitespace for chord sequences
  const parts = trimmed.split(/\s+/);
  const keys: ParsedKey[] = [];

  for (const part of parts) {
    const result = parseKeyPart(part);
    if (!result.ok) {
      return result;
    }
    keys.push(result.value);
  }

  if (keys.length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_SEQUENCE", detail: "no keys in sequence" },
    };
  }

  return {
    ok: true,
    value: Object.freeze({ keys: Object.freeze(keys) }),
  };
}

/**
 * Check if two ParsedKey objects are equal.
 *
 * @param a - First key
 * @param b - Second key
 * @returns True if keys and modifiers match
 */
export function keysEqual(a: ParsedKey, b: ParsedKey): boolean {
  return (
    a.key === b.key &&
    a.mods.shift === b.mods.shift &&
    a.mods.ctrl === b.mods.ctrl &&
    a.mods.alt === b.mods.alt &&
    a.mods.meta === b.mods.meta
  );
}

/**
 * Convert a ParsedKey to a human-readable string (for debugging).
 *
 * @param key - ParsedKey to stringify
 * @returns String representation like "ctrl+a" or "escape"
 */
export function keyToString(key: ParsedKey): string {
  const parts: string[] = [];

  if (key.mods.ctrl) parts.push("ctrl");
  if (key.mods.alt) parts.push("alt");
  if (key.mods.shift) parts.push("shift");
  if (key.mods.meta) parts.push("meta");

  // Find key name
  let keyName: string | undefined;

  for (const [name, code] of KEY_NAME_TO_CODE) {
    if (code === key.key) {
      keyName = name;
      break;
    }
  }

  if (keyName === undefined) {
    // Try to convert from ASCII
    if (key.key >= 65 && key.key <= 90) {
      keyName = String.fromCharCode(key.key).toLowerCase();
    } else if (key.key >= 48 && key.key <= 57) {
      keyName = String.fromCharCode(key.key);
    } else {
      keyName = `key${String(key.key)}`;
    }
  }

  parts.push(keyName);
  return parts.join("+");
}

/**
 * Convert a KeySequence to a human-readable string (for debugging).
 *
 * @param seq - KeySequence to stringify
 * @returns String representation like "g g" or "ctrl+k ctrl+c"
 */
export function sequenceToString(seq: KeySequence): string {
  return seq.keys.map(keyToString).join(" ");
}

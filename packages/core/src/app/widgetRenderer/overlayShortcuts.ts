import type { ZrevEvent } from "../../events.js";
import {
  buildTrie,
  matchKey,
  modsFromBitmask,
  parseKeySequence,
  resetChordState,
  sequenceToString,
} from "../../keybindings/index.js";
import type { ChordState, KeyBinding, ParsedKey } from "../../keybindings/index.js";
import type { CommandItem, CommandPaletteProps, DropdownProps } from "../../widgets/types.js";

export type OverlayShortcutOwner =
  | Readonly<{ kind: "dropdown"; id: string }>
  | Readonly<{ kind: "commandPalette"; id: string }>;

export type OverlayShortcutTarget =
  | Readonly<{ kind: "dropdown"; dropdownId: string; itemId: string }>
  | Readonly<{ kind: "commandPalette"; paletteId: string; itemId: string }>;

export type OverlayShortcutContext = Readonly<Record<string, never>>;

export type OverlayShortcutBinding = KeyBinding<OverlayShortcutContext> &
  Readonly<{
    target: OverlayShortcutTarget;
    ownerLabel: string;
    sequenceLabel: string;
    rawShortcut: string;
  }>;

export type OverlayShortcutTrie = ReturnType<typeof buildTrie<OverlayShortcutContext>>;

type SelectDropdownShortcutContext = Readonly<{
  dropdownById: ReadonlyMap<string, DropdownProps>;
  dropdownSelectedIndexById: Map<string, number>;
  clearPressedDropdown: () => void;
}>;

type SelectCommandPaletteShortcutContext = Readonly<{
  commandPaletteById: ReadonlyMap<string, CommandPaletteProps>;
  commandPaletteItemsById: ReadonlyMap<string, readonly CommandItem[]>;
}>;

type InvokeOverlayShortcutTargetContext = SelectDropdownShortcutContext &
  SelectCommandPaletteShortcutContext;

type RegisterOverlayShortcutContext = Readonly<{
  overlayShortcutBySequence: Map<string, OverlayShortcutBinding>;
  warnShortcutIssue: (key: string, detail: string) => void;
}>;

type RebuildOverlayShortcutBindingsContext = RegisterOverlayShortcutContext &
  Readonly<{
    overlayShortcutOwners: readonly OverlayShortcutOwner[];
    dropdownById: ReadonlyMap<string, DropdownProps>;
    commandPaletteById: ReadonlyMap<string, CommandPaletteProps>;
    commandPaletteItemsById: ReadonlyMap<string, readonly CommandItem[]>;
  }>;

type RouteOverlayShortcutContext = Readonly<{
  overlayShortcutBySequence: ReadonlyMap<string, OverlayShortcutBinding>;
  overlayShortcutTrie: OverlayShortcutTrie;
  overlayShortcutChordState: ChordState;
  invokeTarget: (target: OverlayShortcutTarget) => boolean;
}>;

const EMPTY_COMMAND_ITEMS: readonly CommandItem[] = Object.freeze([]);

function noopOverlayShortcutHandler(_ctx: OverlayShortcutContext): void {}

export function selectDropdownShortcutItem(
  ctx: SelectDropdownShortcutContext,
  dropdownId: string,
  itemId: string,
): boolean {
  const dropdown = ctx.dropdownById.get(dropdownId);
  if (!dropdown) return false;

  const idx = dropdown.items.findIndex((item) => item?.id === itemId);
  if (idx < 0) return false;
  const item = dropdown.items[idx];
  if (!item || item.divider || item.disabled === true) return false;

  ctx.dropdownSelectedIndexById.set(dropdownId, idx);
  ctx.clearPressedDropdown();

  if (dropdown.onSelect) {
    try {
      dropdown.onSelect(item);
    } catch {
      // Swallow select callback errors to preserve routing determinism.
    }
  }
  if (dropdown.onClose) {
    try {
      dropdown.onClose();
    } catch {
      // Swallow close callback errors to preserve routing determinism.
    }
  }
  return true;
}

export function selectCommandPaletteShortcutItem(
  ctx: SelectCommandPaletteShortcutContext,
  paletteId: string,
  itemId: string,
): boolean {
  const palette = ctx.commandPaletteById.get(paletteId);
  if (!palette || palette.open !== true) return false;

  const items = ctx.commandPaletteItemsById.get(paletteId) ?? EMPTY_COMMAND_ITEMS;
  const item = items.find((entry) => entry?.id === itemId);
  if (!item || item.disabled === true) return false;

  try {
    palette.onSelect(item);
  } catch {
    // Swallow select callback errors to preserve routing determinism.
  }
  try {
    palette.onClose();
  } catch {
    // Swallow close callback errors to preserve routing determinism.
  }
  return true;
}

export function invokeOverlayShortcutTarget(
  ctx: InvokeOverlayShortcutTargetContext,
  target: OverlayShortcutTarget,
): boolean {
  if (target.kind === "dropdown") {
    return selectDropdownShortcutItem(ctx, target.dropdownId, target.itemId);
  }
  return selectCommandPaletteShortcutItem(ctx, target.paletteId, target.itemId);
}

export function registerOverlayShortcut(
  ctx: RegisterOverlayShortcutContext,
  shortcutRaw: string,
  target: OverlayShortcutTarget,
  ownerLabel: string,
): void {
  const parsed = parseKeySequence(shortcutRaw);
  if (!parsed.ok) return;

  const sequenceLabel = sequenceToString(parsed.value);
  const existing = ctx.overlayShortcutBySequence.get(sequenceLabel);
  if (existing) {
    ctx.warnShortcutIssue(
      `shortcutConflict:${sequenceLabel}`,
      `Shortcut "${sequenceLabel}" is declared by ${existing.ownerLabel} and ${ownerLabel}. Topmost overlay binding wins.`,
    );
  }

  const binding: OverlayShortcutBinding = Object.freeze({
    sequence: parsed.value,
    priority: 0,
    handler: noopOverlayShortcutHandler,
    target,
    ownerLabel,
    sequenceLabel,
    rawShortcut: shortcutRaw,
  });
  ctx.overlayShortcutBySequence.set(sequenceLabel, binding);
}

export function rebuildOverlayShortcutBindings(
  ctx: RebuildOverlayShortcutBindingsContext,
): Readonly<{ overlayShortcutTrie: OverlayShortcutTrie; overlayShortcutChordState: ChordState }> {
  ctx.overlayShortcutBySequence.clear();

  const topOwner =
    ctx.overlayShortcutOwners.length > 0
      ? (ctx.overlayShortcutOwners[ctx.overlayShortcutOwners.length - 1] ?? null)
      : null;

  if (topOwner) {
    if (topOwner.kind === "dropdown") {
      const dropdown = ctx.dropdownById.get(topOwner.id);
      if (dropdown) {
        for (const item of dropdown.items) {
          if (!item || item.divider || item.disabled === true) continue;
          const shortcut = item.shortcut?.trim();
          if (!shortcut) continue;
          registerOverlayShortcut(
            ctx,
            shortcut,
            Object.freeze({ kind: "dropdown", dropdownId: topOwner.id, itemId: item.id }),
            `dropdown#${topOwner.id}:${item.id}`,
          );
        }
      }
    } else {
      const palette = ctx.commandPaletteById.get(topOwner.id);
      if (palette && palette.open === true) {
        const items = ctx.commandPaletteItemsById.get(topOwner.id) ?? EMPTY_COMMAND_ITEMS;
        for (const item of items) {
          if (!item || item.disabled === true) continue;
          const shortcut = item.shortcut?.trim();
          if (!shortcut) continue;
          registerOverlayShortcut(
            ctx,
            shortcut,
            Object.freeze({
              kind: "commandPalette",
              paletteId: topOwner.id,
              itemId: item.id,
            }),
            `commandPalette#${topOwner.id}:${item.id}`,
          );
        }
      }
    }
  }

  return Object.freeze({
    overlayShortcutChordState: resetChordState(),
    overlayShortcutTrie: buildTrie<OverlayShortcutContext>(
      Object.freeze([...ctx.overlayShortcutBySequence.values()]),
    ),
  });
}

export function routeOverlayShortcut(
  event: ZrevEvent,
  ctx: RouteOverlayShortcutContext,
): Readonly<{
  result: "matched" | "pending" | "none";
  nextChordState: ChordState;
}> {
  if (event.kind !== "key" || event.action !== "down") {
    return Object.freeze({ result: "none", nextChordState: ctx.overlayShortcutChordState });
  }

  if (ctx.overlayShortcutBySequence.size === 0) {
    const reset = resetChordState();
    return Object.freeze({ result: "none", nextChordState: reset });
  }

  const key: ParsedKey = Object.freeze({ key: event.key, mods: modsFromBitmask(event.mods) });
  const match = matchKey(ctx.overlayShortcutTrie, ctx.overlayShortcutChordState, key, event.timeMs);
  const nextChordState = match.nextState;

  if (match.result.kind === "pending") {
    return Object.freeze({ result: "pending", nextChordState });
  }
  if (match.result.kind !== "matched") {
    return Object.freeze({ result: "none", nextChordState });
  }

  const binding = match.result.binding as OverlayShortcutBinding;
  return Object.freeze({
    result: ctx.invokeTarget(binding.target) ? "matched" : "none",
    nextChordState,
  });
}

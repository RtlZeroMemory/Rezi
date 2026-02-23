import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  ZR_MOD_CTRL,
} from "../../keybindings/keyCodes.js";
import { getFilteredItems } from "../../widgets/commandPalette.js";
import type { CommandItem, CommandPaletteProps } from "../../widgets/types.js";

function popLastCodePoint(s: string): string {
  if (s.length === 0) return s;
  const last = s.charCodeAt(s.length - 1);
  // Surrogate pair: [high][low]
  if (last >= 0xdc00 && last <= 0xdfff && s.length >= 2) {
    const prev = s.charCodeAt(s.length - 2);
    if (prev >= 0xd800 && prev <= 0xdbff) {
      return s.slice(0, -2);
    }
  }
  return s.slice(0, -1);
}

export function routeCommandPaletteKeyDown(
  event: ZrevEvent,
  palette: CommandPaletteProps,
  items: readonly CommandItem[],
): boolean {
  if (event.kind !== "key" || event.action !== "down") return false;
  if (palette.open !== true) return false;

  if (event.key === ZR_KEY_ESCAPE) {
    palette.onClose();
    return true;
  }

  const findNextEnabledIndex = (startIndex: number, dir: -1 | 1): number | null => {
    const n = items.length;
    if (n === 0) return null;
    const start = Math.max(0, Math.min(startIndex, n - 1));
    for (let step = 0; step < n; step++) {
      const idx = (start + dir * (step + 1) + n * 4) % n;
      const it = items[idx];
      if (it && it.disabled !== true) return idx;
    }
    return null;
  };

  const findFirstEnabledIndex = (): number | null => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.disabled !== true) return i;
    }
    return null;
  };

  const isCtrl = (event.mods & ZR_MOD_CTRL) !== 0;
  const keyDown = event.key === ZR_KEY_DOWN || (isCtrl && event.key === 78) /* N */;
  const keyUp = event.key === ZR_KEY_UP || (isCtrl && event.key === 80) /* P */;

  if (keyDown || keyUp) {
    if (palette.onSelectionChange) {
      const next =
        (keyUp ? findNextEnabledIndex(palette.selectedIndex, -1) : null) ??
        (keyDown ? findNextEnabledIndex(palette.selectedIndex, 1) : null) ??
        findFirstEnabledIndex() ??
        0;
      if (next !== palette.selectedIndex) palette.onSelectionChange(next);
    }
    return true;
  }

  if (event.key === ZR_KEY_TAB) {
    const prefixes: string[] = [];
    for (const src of palette.sources) {
      if (src.prefix && src.prefix.length > 0) prefixes.push(src.prefix);
    }
    if (prefixes.length > 0) {
      let activePrefix: string | null = null;
      for (const pfx of prefixes) {
        if (palette.query.startsWith(pfx)) {
          activePrefix = pfx;
          break;
        }
      }

      const bare = activePrefix
        ? palette.query.slice(activePrefix.length).trimStart()
        : palette.query;
      const idx = activePrefix ? prefixes.indexOf(activePrefix) : -1;
      const nextPrefix =
        prefixes[(idx + 1 + prefixes.length) % prefixes.length] ?? prefixes[0] ?? "";
      const nextQuery = bare.length > 0 ? `${nextPrefix} ${bare}` : nextPrefix;

      palette.onQueryChange(nextQuery);
      if (palette.onSelectionChange) palette.onSelectionChange(0);
      return true;
    }
  }

  if (event.key === ZR_KEY_ENTER) {
    const fallback = findFirstEnabledIndex();
    const idx =
      items.length === 0 ? 0 : Math.max(0, Math.min(palette.selectedIndex, items.length - 1));
    const selected = items[idx];
    const item =
      selected && selected.disabled !== true
        ? selected
        : fallback !== null
          ? items[fallback]
          : null;
    if (item && item.disabled !== true) {
      palette.onSelect(item);
      palette.onClose();
    }
    return true;
  }

  if (event.key === ZR_KEY_BACKSPACE && palette.query.length > 0) {
    palette.onQueryChange(popLastCodePoint(palette.query));
    if (palette.onSelectionChange) palette.onSelectionChange(0);
    return true;
  }

  return false;
}

export function kickoffCommandPaletteItemFetches(
  commandPaletteById: ReadonlyMap<string, CommandPaletteProps>,
  commandPaletteItemsById: Map<string, readonly CommandItem[]>,
  commandPaletteLoadingById: Map<string, boolean>,
  commandPaletteFetchTokenById: Map<string, number>,
  commandPaletteLastQueryById: Map<string, string>,
  commandPaletteLastSourcesRefById: Map<string, readonly unknown[]>,
  requestView: () => void,
): void {
  // Kick off command palette item fetches (async sources) outside the render pipeline.
  for (const p of commandPaletteById.values()) {
    if (!p.open) continue;

    const prevQuery = commandPaletteLastQueryById.get(p.id);
    const prevSourcesRef = commandPaletteLastSourcesRefById.get(p.id);
    const sourcesRef = p.sources as readonly unknown[];

    if (prevQuery === p.query && prevSourcesRef === sourcesRef) continue;

    const nextToken = (commandPaletteFetchTokenById.get(p.id) ?? 0) + 1;
    commandPaletteFetchTokenById.set(p.id, nextToken);
    commandPaletteLastQueryById.set(p.id, p.query);
    commandPaletteLastSourcesRefById.set(p.id, sourcesRef);
    commandPaletteLoadingById.set(p.id, true);

    void getFilteredItems(p.sources, p.query).then(
      (items) => {
        if (commandPaletteFetchTokenById.get(p.id) !== nextToken) return;
        if (!commandPaletteById.has(p.id)) return;

        commandPaletteItemsById.set(p.id, Object.freeze(items.slice()));
        commandPaletteLoadingById.set(p.id, false);
        requestView();
      },
      () => {
        if (commandPaletteFetchTokenById.get(p.id) !== nextToken) return;
        if (!commandPaletteById.has(p.id)) return;

        commandPaletteItemsById.set(p.id, Object.freeze([]));
        commandPaletteLoadingById.set(p.id, false);
        requestView();
      },
    );
  }
}

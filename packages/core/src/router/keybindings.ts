import { ZrUiError } from "../abi.js";
import type { BindingMap, KeyContext } from "../keybindings/index.js";
import type { RouteDefinition, RouterApi } from "./types.js";

export type RouteKeybindingResolver = (keybinding: string) => string | undefined;

export type CreateRouteKeybindingsOptions = Readonly<{
  /**
   * Resolve the currently active route id for a keybinding sequence.
   *
   * When provided, generated handlers no-op unless the resolver still maps the
   * key sequence to the route id captured at registration time.
   */
  resolveRouteIdForKeybinding?: RouteKeybindingResolver;
}>;

export type RouteKeybindingEntry = Readonly<{
  sequence: string;
  routeId: string;
  title?: string;
}>;

export function collectRouteKeybindingEntries<S>(
  routes: readonly RouteDefinition<S>[],
): readonly RouteKeybindingEntry[] {
  const entries: RouteKeybindingEntry[] = [];
  const seenBySequence = new Map<string, string>();

  function visit(routeList: readonly RouteDefinition<S>[]): void {
    for (const route of routeList) {
      const keybinding = route.keybinding?.trim();
      if (keybinding) {
        const existingRouteId = seenBySequence.get(keybinding);
        if (existingRouteId !== undefined && existingRouteId !== route.id) {
          throw new ZrUiError(
            "ZRUI_INVALID_PROPS",
            `duplicate route keybinding "${keybinding}" for routes "${existingRouteId}" and "${route.id}"`,
          );
        }
        seenBySequence.set(keybinding, route.id);
        entries.push(
          route.title === undefined
            ? Object.freeze({ sequence: keybinding, routeId: route.id })
            : Object.freeze({ sequence: keybinding, routeId: route.id, title: route.title }),
        );
      }

      if (route.children !== undefined) {
        visit(route.children);
      }
    }
  }

  visit(routes);
  return Object.freeze(entries);
}

/**
 * Build route keybindings that navigate to route ids.
 *
 * Keybindings push a history entry unless the target route is already active.
 */
export function createRouteKeybindings<S>(
  routes: readonly RouteDefinition<S>[],
  router: RouterApi,
  options?: CreateRouteKeybindingsOptions,
): BindingMap<KeyContext<S>> {
  const bindings: Record<string, BindingMap<KeyContext<S>>[string]> = {};
  const resolveRouteIdForKeybinding = options?.resolveRouteIdForKeybinding;
  const entries = collectRouteKeybindingEntries(routes);
  for (const entry of entries) {
    bindings[entry.sequence] = {
      priority: -100,
      ...(entry.title === undefined ? {} : { description: `Navigate to ${entry.title}` }),
      handler: () => {
        if (resolveRouteIdForKeybinding) {
          const currentTargetRouteId = resolveRouteIdForKeybinding(entry.sequence);
          if (currentTargetRouteId !== entry.routeId) return;
        }
        if (router.currentRoute().id === entry.routeId) return;
        router.navigate(entry.routeId);
      },
    };
  }

  return Object.freeze(bindings);
}

import type { BindingMap, KeyContext } from "../keybindings/index.js";
import type { RouteDefinition, RouterApi } from "./types.js";

/**
 * Build route keybindings that navigate to route ids.
 *
 * Keybindings push a history entry unless the target route is already active.
 */
export function createRouteKeybindings<S>(
  routes: readonly RouteDefinition<S>[],
  router: RouterApi,
): BindingMap<KeyContext<S>> {
  const bindings: Record<string, BindingMap<KeyContext<S>>[string]> = {};

  for (const route of routes) {
    const keybinding = route.keybinding?.trim();
    if (!keybinding) continue;

    bindings[keybinding] = {
      priority: -100,
      handler: () => {
        if (router.currentRoute().id === route.id) return;
        router.navigate(route.id);
      },
    };
  }

  return Object.freeze(bindings);
}

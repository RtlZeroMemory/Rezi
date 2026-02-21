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

  function visit(routeList: readonly RouteDefinition<S>[]): void {
    for (const route of routeList) {
      const keybinding = route.keybinding?.trim();
      if (keybinding) {
        bindings[keybinding] = {
          priority: -100,
          handler: () => {
            if (router.currentRoute().id === route.id) return;
            router.navigate(route.id);
          },
        };
      }

      if (route.children !== undefined) {
        visit(route.children);
      }
    }
  }

  visit(routes);

  return Object.freeze(bindings);
}

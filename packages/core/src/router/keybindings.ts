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

  function visit(routeList: readonly RouteDefinition<S>[]): void {
    for (const route of routeList) {
      const keybinding = route.keybinding?.trim();
      if (keybinding) {
        const boundRouteId = route.id;
        bindings[keybinding] = {
          priority: -100,
          ...(route.title === undefined ? {} : { description: `Navigate to ${route.title}` }),
          handler: () => {
            if (resolveRouteIdForKeybinding) {
              const currentTargetRouteId = resolveRouteIdForKeybinding(keybinding);
              if (currentTargetRouteId !== boundRouteId) return;
            }
            if (router.currentRoute().id === boundRouteId) return;
            router.navigate(boundRouteId);
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

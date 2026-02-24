import type { RouteDefinition } from "@rezi-ui/core";
import type { RouteDeps, RouteId, StarshipState } from "../types.js";
import { renderBridgeScreen } from "./bridge.js";
import { renderCargoScreen } from "./cargo.js";
import { renderCommsScreen } from "./comms.js";
import { renderCrewScreen } from "./crew.js";
import { renderEngineeringScreen } from "./engineering.js";
import { renderSettingsScreen } from "./settings.js";

export const STARSHIP_ROUTES: readonly Readonly<{ id: RouteId; title: string }>[] = Object.freeze([
  { id: "bridge", title: "Bridge" },
  { id: "engineering", title: "Engineering" },
  { id: "crew", title: "Crew" },
  { id: "comms", title: "Comms" },
  { id: "cargo", title: "Cargo" },
  { id: "settings", title: "Settings" },
]);

export function createStarshipRoutes(deps: RouteDeps): readonly RouteDefinition<StarshipState>[] {
  return Object.freeze([
    { id: "bridge", title: "Bridge", screen: (_params, ctx) => renderBridgeScreen(ctx, deps) },
    {
      id: "engineering",
      title: "Engineering",
      screen: (_params, ctx) => renderEngineeringScreen(ctx, deps),
    },
    { id: "crew", title: "Crew", screen: (_params, ctx) => renderCrewScreen(ctx, deps) },
    { id: "comms", title: "Comms", screen: (_params, ctx) => renderCommsScreen(ctx, deps) },
    { id: "cargo", title: "Cargo", screen: (_params, ctx) => renderCargoScreen(ctx, deps) },
    {
      id: "settings",
      title: "Settings",
      screen: (_params, ctx) => renderSettingsScreen(ctx, deps),
    },
  ]);
}

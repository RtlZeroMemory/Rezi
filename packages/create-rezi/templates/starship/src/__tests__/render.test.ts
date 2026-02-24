import assert from "node:assert/strict";
import test from "node:test";
import type { RouteRenderContext, RouterApi } from "@rezi-ui/core";
import { createTestRenderer } from "@rezi-ui/core/testing";
import { createInitialState } from "../helpers/state.js";
import { STARSHIP_ROUTES } from "../screens/index.js";
import { renderBridgeScreen } from "../screens/bridge.js";
import { renderCargoScreen } from "../screens/cargo.js";
import { renderCommsScreen } from "../screens/comms.js";
import { renderCrewScreen } from "../screens/crew.js";
import { renderEngineeringScreen } from "../screens/engineering.js";
import { renderSettingsScreen } from "../screens/settings.js";
import type { RouteDeps, RouteId, StarshipState } from "../types.js";

function createRouter(initialRoute: RouteId): RouterApi {
  let current = initialRoute;
  const historyStack: Array<{ id: string; params: Readonly<Record<string, string>> }> = [
    { id: initialRoute, params: Object.freeze({}) },
  ];

  return {
    navigate: (routeId, params = Object.freeze({})) => {
      current = routeId as RouteId;
      historyStack.push({ id: routeId, params });
    },
    replace: (routeId, params = Object.freeze({})) => {
      current = routeId as RouteId;
      historyStack[historyStack.length - 1] = { id: routeId, params };
    },
    back: () => {
      if (historyStack.length > 1) {
        historyStack.pop();
      }
      current = historyStack[historyStack.length - 1]?.id as RouteId;
    },
    currentRoute: () => ({ id: current, params: Object.freeze({}) }),
    canGoBack: () => historyStack.length > 1,
    history: () => Object.freeze(historyStack.map((entry) => Object.freeze({ ...entry }))),
  };
}

function createContext(state: StarshipState, routeId: RouteId): RouteRenderContext<StarshipState> {
  return {
    router: createRouter(routeId),
    state,
    update: () => {},
    outlet: null,
  };
}

function createDeps(): RouteDeps {
  return {
    dispatch: () => {},
    navigate: () => {},
    routes: STARSHIP_ROUTES,
    getBindings: () => [],
  };
}

test("bridge screen renders core markers", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer
    .render(renderBridgeScreen(createContext(state, "bridge"), createDeps()))
    .toText();

  assert.match(output, /USS Rezi/);
  assert.match(output, /Telemetry/);
  assert.match(output, /Systems Status/);
});

test("engineering screen renders subsystem tree", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer
    .render(renderEngineeringScreen(createContext(state, "engineering"), createDeps()))
    .toText();

  assert.match(output, /Subsystem Tree/);
  assert.match(output, /Reactor Schematic/);
});

test("crew screen renders table headers", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer
    .render(renderCrewScreen(createContext(state, "crew"), createDeps()))
    .toText();

  assert.match(output, /Crew Manifest/);
  assert.match(output, /Name/);
  assert.match(output, /Rank/);
});

test("comms screen renders channel tabs", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer
    .render(renderCommsScreen(createContext(state, "comms"), createDeps()))
    .toText();

  assert.match(output, /Communications/);
  assert.match(output, /Fleet/);
  assert.match(output, /Emergency/);
});

test("settings screen renders form fields", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer
    .render(renderSettingsScreen(createContext(state, "settings"), createDeps()))
    .toText();

  assert.match(output, /Ship Settings/);
  assert.match(output, /Ship Name/);
  assert.match(output, /Alert Threshold/);
});

test("cargo screen renders manifest widgets", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer
    .render(renderCargoScreen(createContext(state, "cargo"), createDeps()))
    .toText();

  assert.match(output, /Cargo Hold/);
  assert.match(output, /Manifest/);
});

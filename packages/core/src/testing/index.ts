export {
  TEST_MOUSE_KIND_DOWN,
  TEST_MOUSE_KIND_SCROLL,
  TEST_MOUSE_KIND_UP,
  TestEventBuilder,
  encodeZrevBatchV1,
  makeBackendBatch,
} from "./events.js";
export type {
  TestEventBuilderOptions,
  TestEventInput,
  TestZrevEvent,
} from "./events.js";

export { createTestRenderer } from "./renderer.js";
export type {
  TestRenderNode,
  TestRenderLayoutVisitor,
  TestRendererMode,
  TestRenderOptions,
  TestRenderResult,
  TestRenderTraceEvent,
  TestRenderer,
  TestRendererOptions,
  TestViewport,
} from "./renderer.js";

export { runSemanticScenario } from "./semanticScenario.js";
export { runReplayScenario } from "./replayScenario.js";
export {
  createScenarioScreenSnapshot,
  validateScenarioDefinition,
  type ScenarioCapabilityProfile,
  type ScenarioCursorAssertion,
  type ScenarioCursorSnapshot,
  type ScenarioDefinition,
  type ScenarioExpectedAction,
  type ScenarioFixture,
  type ScenarioFixtureFactory,
  type ScenarioInvariant,
  type ScenarioInvariantAssertion,
  type ScenarioKeyMod,
  type ScenarioMismatch,
  type ScenarioMismatchCode,
  type ScenarioRunResult,
  type ScenarioScreenCheckpoint,
  type ScenarioScreenRegionAssertion,
  type ScenarioScreenSnapshot,
  type ScenarioScriptedInputEvent,
  type ScenarioScriptedInputStep,
  type ScenarioStepObservation,
  type ScenarioTheme,
  type ScenarioWidgetFamily,
} from "./scenario.js";
export { evaluateScenarioResult } from "./assertions.js";
export {
  referenceInputModalScenario,
  createReferenceInputModalFixture,
} from "./referenceScenarios/inputModalBlocking.js";

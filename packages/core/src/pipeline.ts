/**
 * packages/core/src/pipeline.ts — Pipeline primitives for external renderers.
 *
 * Re-exports the commit, layout, drawlist, and stability APIs that
 * ink-compat (and similar consumers) need to build an optimized render loop
 * without depending on the test-only createTestRenderer helper.
 */

// Commit
export { commitVNodeTree, __commitDiag } from "./runtime/commit.js";
export type { RuntimeInstance, CommitDiagEntry } from "./runtime/commit.js";
export { createInstanceIdAllocator } from "./runtime/instance.js";
export type { InstanceId, InstanceIdAllocator } from "./runtime/instance.js";

// Layout
export { layout } from "./layout/layout.js";
export type { LayoutTree } from "./layout/layout.js";

// Drawlist rendering
export { renderToDrawlist } from "./renderer/renderToDrawlist.js";

// Layout stability
export { updateLayoutStabilitySignatures } from "./app/widgetRenderer/submitFramePipeline.js";

// Layout dirty set
export {
  computeDirtyLayoutSet,
  instanceDirtySetToVNodeDirtySet,
} from "./layout/engine/dirtySet.js";

// Damage tracking (for collecting dirty instance IDs from commit flags)
export { collectSelfDirtyInstanceIds } from "./app/widgetRenderer/damageTracking.js";

// Temporary profiling (remove after investigation)
export { __layoutProfile } from "./layout/engine/layoutEngine.js";

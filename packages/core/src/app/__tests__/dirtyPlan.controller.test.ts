import { assert, test } from "@rezi-ui/testkit";
import {
  DIRTY_LAYOUT,
  DIRTY_RENDER,
  DIRTY_VIEW,
  buildWidgetRenderPlan,
  createDirtyTracker,
} from "../createApp/dirtyPlan.js";

test("dirty tracker keeps dirty bits when a newer version supersedes the snapshot", () => {
  const tracker = createDirtyTracker();

  tracker.markDirty(DIRTY_VIEW);
  const staleSnapshot = tracker.snapshotVersions();
  tracker.markDirty(DIRTY_VIEW);
  tracker.clearConsumedFlags(DIRTY_VIEW, staleSnapshot);

  assert.equal(tracker.getFlags() & DIRTY_VIEW, DIRTY_VIEW);
});

test("dirty tracker clears only the matching dirty bits", () => {
  const tracker = createDirtyTracker();

  tracker.markDirty(DIRTY_VIEW | DIRTY_LAYOUT);
  const snapshot = tracker.snapshotVersions();
  tracker.markDirty(DIRTY_RENDER);
  tracker.clearConsumedFlags(DIRTY_VIEW | DIRTY_LAYOUT, snapshot);

  assert.equal(tracker.getFlags(), DIRTY_RENDER);
});

test("widget render plan derives commit/layout intent from dirty flags", () => {
  assert.deepEqual(buildWidgetRenderPlan(DIRTY_VIEW, 12), {
    commit: true,
    layout: false,
    checkLayoutStability: true,
    nowMs: 12,
  });

  assert.deepEqual(buildWidgetRenderPlan(DIRTY_LAYOUT | DIRTY_RENDER, 27), {
    commit: false,
    layout: true,
    checkLayoutStability: false,
    nowMs: 27,
  });
});

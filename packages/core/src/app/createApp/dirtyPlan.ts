import type { WidgetRenderPlan } from "../widgetRenderer.js";

export const DIRTY_RENDER = 1 << 0;
export const DIRTY_LAYOUT = 1 << 1;
export const DIRTY_VIEW = 1 << 2;

export type DirtyVersionSnapshot = Readonly<{
  render: number;
  layout: number;
  view: number;
}>;

export type DirtyTracker = Readonly<{
  clearConsumedFlags: (consumedFlags: number, snapshot: DirtyVersionSnapshot) => void;
  getFlags: () => number;
  markDirty: (flags: number) => Readonly<{ wasDirty: boolean; flags: number }>;
  snapshotVersions: () => DirtyVersionSnapshot;
}>;

export function createDirtyTracker(): DirtyTracker {
  let dirtyFlags = 0;
  let dirtyRenderVersion = 0;
  let dirtyLayoutVersion = 0;
  let dirtyViewVersion = 0;

  return {
    clearConsumedFlags(consumedFlags: number, snapshot: DirtyVersionSnapshot): void {
      let clearMask = 0;
      if ((consumedFlags & DIRTY_RENDER) !== 0 && dirtyRenderVersion === snapshot.render) {
        clearMask |= DIRTY_RENDER;
      }
      if ((consumedFlags & DIRTY_LAYOUT) !== 0 && dirtyLayoutVersion === snapshot.layout) {
        clearMask |= DIRTY_LAYOUT;
      }
      if ((consumedFlags & DIRTY_VIEW) !== 0 && dirtyViewVersion === snapshot.view) {
        clearMask |= DIRTY_VIEW;
      }
      dirtyFlags &= ~clearMask;
    },

    getFlags(): number {
      return dirtyFlags;
    },

    markDirty(flags: number): Readonly<{ wasDirty: boolean; flags: number }> {
      const wasDirty = dirtyFlags !== 0;
      dirtyFlags |= flags;
      if ((flags & DIRTY_RENDER) !== 0) dirtyRenderVersion++;
      if ((flags & DIRTY_LAYOUT) !== 0) dirtyLayoutVersion++;
      if ((flags & DIRTY_VIEW) !== 0) dirtyViewVersion++;
      return { wasDirty, flags: dirtyFlags };
    },

    snapshotVersions(): DirtyVersionSnapshot {
      return {
        render: dirtyRenderVersion,
        layout: dirtyLayoutVersion,
        view: dirtyViewVersion,
      };
    },
  };
}

export function buildWidgetRenderPlan(dirtyFlags: number, nowMs: number): WidgetRenderPlan {
  return {
    commit: (dirtyFlags & DIRTY_VIEW) !== 0,
    layout: (dirtyFlags & DIRTY_LAYOUT) !== 0,
    checkLayoutStability: (dirtyFlags & DIRTY_LAYOUT) === 0 && (dirtyFlags & DIRTY_VIEW) !== 0,
    nowMs,
  };
}

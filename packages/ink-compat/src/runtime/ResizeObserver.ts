import type { InkHostNode } from "../reconciler/types.js";
import { readCurrentLayout } from "./layoutState.js";
const activeObservers = new Set<InkResizeObserver>();

export interface ResizeObserverEntry {
  target: InkHostNode;
  contentRect: {
    width: number;
    height: number;
  };
}

export type ResizeObserverCallback = (entries: ResizeObserverEntry[]) => void;

/**
 * Minimal ResizeObserver implementation for Ink compat.
 *
 * Gemini CLI uses `new ResizeObserver(callback)` with `.observe(node)` and
 * `.disconnect()`. The callback receives entries with `entry.contentRect.height`.
 *
 * This implementation polls the observed element's layout on each commit
 * (via the node's onCommit hook) and fires the callback when dimensions change.
 */
export class InkResizeObserver {
  private callback: ResizeObserverCallback;
  private observed: Map<InkHostNode, { w: number; h: number }> = new Map();
  private disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    activeObservers.add(this);
  }

  observe(element: InkHostNode): void {
    if (this.disconnected) return;
    const layout = readCurrentLayout(element);
    const w = layout?.w ?? 0;
    const h = layout?.h ?? 0;
    this.observed.set(element, { w, h });

    // Fire initial callback with current size
    this.callback([
      {
        target: element,
        contentRect: { width: w, height: h },
      },
    ]);
  }

  /**
   * Check for size changes on all observed elements.
   * Should be called after each layout pass / commit.
   */
  check(): void {
    if (this.disconnected) return;
    for (const [element, prev] of this.observed) {
      const layout = readCurrentLayout(element);
      const w = layout?.w ?? 0;
      const h = layout?.h ?? 0;
      if (w !== prev.w || h !== prev.h) {
        prev.w = w;
        prev.h = h;
        this.callback([
          {
            target: element,
            contentRect: { width: w, height: h },
          },
        ]);
      }
    }
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
    activeObservers.delete(this);
  }
}

export function checkAllResizeObservers(): void {
  for (const observer of activeObservers) {
    observer.check();
  }
}

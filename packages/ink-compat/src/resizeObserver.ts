import type { DOMElement } from "./types.js";

export type ResizeObserverCallback = (
  entries: ResizeObserverEntry[],
  observer: ResizeObserver,
) => void;

export class ResizeObserverEntry {
  readonly target: DOMElement;
  readonly contentRect: Readonly<{ width: number; height: number }>;

  constructor(target: DOMElement, contentRect: Readonly<{ width: number; height: number }>) {
    this.target = target;
    this.contentRect = contentRect;
  }
}

export default class ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly observedElements = new Set<DOMElement>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(element: DOMElement): void {
    if (this.observedElements.has(element)) return;

    this.observedElements.add(element);
    const target = element as DOMElement & {
      resizeObservers?: Set<unknown>;
      internal_lastMeasuredSize?: Readonly<{ width: number; height: number }>;
    };
    if (!target.resizeObservers) target.resizeObservers = new Set<unknown>();
    target.resizeObservers.add(this as unknown);

    const size = target.internal_lastMeasuredSize;
    if (size) {
      this.safeTrigger([new ResizeObserverEntry(element, size)]);
    }
  }

  unobserve(element: DOMElement): void {
    this.observedElements.delete(element);

    const target = element as DOMElement & { resizeObservers?: Set<unknown> };
    target.resizeObservers?.delete(this as unknown);
  }

  disconnect(): void {
    for (const element of this.observedElements) {
      const target = element as DOMElement & { resizeObservers?: Set<unknown> };
      target.resizeObservers?.delete(this as unknown);
    }
    this.observedElements.clear();
  }

  internalTrigger(entries: ResizeObserverEntry[]): void {
    this.safeTrigger(entries);
  }

  private safeTrigger(entries: ResizeObserverEntry[]): void {
    try {
      this.callback(entries, this);
    } catch (error) {
      // Keep observer failures isolated, matching Ink's behavior.
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }
}

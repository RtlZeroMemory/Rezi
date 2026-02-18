/**
 * packages/core/src/__tests__/stress/stress.rapid-events.test.ts
 *
 * Deterministic stress tests for high-frequency event routing.
 *
 * Requirements covered:
 * - 1000 key-event bursts
 * - mixed mouse + keyboard streams
 * - rapid focus-change churn
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import { WidgetRenderer, type WidgetRoutingOutcome } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import type { VNode } from "../../index.js";
import { ui } from "../../index.js";
import { ZR_KEY_ENTER, ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";

type Rng = () => number;

type StressSummary = Readonly<{
  finalFocusedId: string | null;
  renderCount: number;
  actionCount: number;
  focusHash: number;
  actionHash: number;
  seenFocusIds: readonly string[];
}>;

type ButtonHarness = Readonly<{
  renderer: WidgetRenderer<void>;
  centers: ReadonlyMap<string, Readonly<{ x: number; y: number }>>;
  focusableIds: ReadonlySet<string>;
}>;

function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function withSeed<T>(seed: number, run: (rng: Rng) => T): T {
  try {
    return run(createRng(seed));
  } catch (error) {
    throw new Error(`[stress.rapid-events] seed=${String(seed)} failed: ${describeError(error)}`);
  }
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    hash ^= ch;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function mixHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Unit-style widget renderer tests do not poll backend events.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function keyEvent(timeMs: number, key: number, mods = 0): ZrevEvent {
  return {
    kind: "key",
    timeMs,
    key,
    mods,
    action: "down",
  };
}

function mouseEvent(
  timeMs: number,
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  opts: Readonly<{ buttons?: number; wheelY?: number }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs,
    x,
    y,
    mouseKind,
    mods: 0,
    buttons: opts.buttons ?? 0,
    wheelX: 0,
    wheelY: opts.wheelY ?? 0,
  };
}

function buttonId(index: number): string {
  return `btn-${String(index).padStart(3, "0")}`;
}

function buttonsView(buttonCount: number): VNode {
  const children: VNode[] = [];
  for (let i = 0; i < buttonCount; i++) {
    children.push(ui.button({ id: buttonId(i), label: `Button ${String(i)}` }));
  }
  return ui.column({ p: 0, gap: 0 }, children);
}

function createButtonHarness(buttonCount: number): ButtonHarness {
  const renderer = new WidgetRenderer<void>({
    backend: createNoopBackend(),
    requestRender: () => {},
  });

  const submit = renderer.submitFrame(
    () => buttonsView(buttonCount),
    undefined,
    { cols: 90, rows: Math.max(40, buttonCount + 6) },
    defaultTheme,
    noRenderHooks(),
  );
  if (!submit.ok) {
    assert.fail(`submitFrame failed: ${submit.code}: ${submit.detail}`);
  }

  const rectById = renderer.getRectByIdIndex();
  const centers = new Map<string, Readonly<{ x: number; y: number }>>();
  const focusableIds = new Set<string>();

  for (let i = 0; i < buttonCount; i++) {
    const id = buttonId(i);
    focusableIds.add(id);
    const rect = rectById.get(id);
    assert.ok(rect !== undefined, `missing button rect for ${id}`);
    if (!rect) continue;
    centers.set(
      id,
      Object.freeze({
        x: rect.x + Math.max(0, Math.floor(rect.w / 2)),
        y: rect.y + Math.max(0, Math.floor(rect.h / 2)),
      }),
    );
  }

  return Object.freeze({
    renderer,
    centers,
    focusableIds,
  });
}

type MutableSummary = {
  renderCount: number;
  actionCount: number;
  focusHash: number;
  actionHash: number;
  seenFocus: Set<string>;
};

function recordOutcome(
  seed: number,
  summary: MutableSummary,
  harness: ButtonHarness,
  outcome: WidgetRoutingOutcome,
): void {
  if (outcome.needsRender) {
    summary.renderCount++;
  }
  if (outcome.action && outcome.action.action === "press") {
    summary.actionCount++;
    summary.actionHash = mixHash(summary.actionHash, hashString(outcome.action.id));
  }

  const focusedId = harness.renderer.getFocusedId();
  if (focusedId !== null) {
    assert.equal(
      harness.focusableIds.has(focusedId),
      true,
      `seed=${String(seed)} routed to unexpected focus id: ${focusedId}`,
    );
    summary.seenFocus.add(focusedId);
    summary.focusHash = mixHash(summary.focusHash, hashString(focusedId));
  } else {
    summary.focusHash = mixHash(summary.focusHash, 0);
  }
}

function toReadonlySummary(summary: MutableSummary, finalFocusedId: string | null): StressSummary {
  const seenFocusIds = [...summary.seenFocus];
  seenFocusIds.sort();
  return Object.freeze({
    finalFocusedId,
    renderCount: summary.renderCount,
    actionCount: summary.actionCount,
    focusHash: summary.focusHash,
    actionHash: summary.actionHash,
    seenFocusIds: Object.freeze(seenFocusIds),
  });
}

function runKeyBurst(seed: number, keyEvents: number): StressSummary {
  return withSeed(seed, (rng) => {
    const harness = createButtonHarness(23);
    const summary: MutableSummary = {
      renderCount: 0,
      actionCount: 0,
      focusHash: 2166136261 >>> 0,
      actionHash: 2166136261 >>> 0,
      seenFocus: new Set<string>(),
    };

    for (let i = 0; i < keyEvents; i++) {
      const roll = nextInt(rng, 0, 99);
      const key = roll < 78 ? ZR_KEY_TAB : ZR_KEY_ENTER;
      const outcome = harness.renderer.routeEngineEvent(keyEvent(i, key));
      recordOutcome(seed, summary, harness, outcome);
    }

    return toReadonlySummary(summary, harness.renderer.getFocusedId());
  });
}

function runMixedScenario(seed: number, steps: number, sameTimestamp: boolean): StressSummary {
  return withSeed(seed, (rng) => {
    const buttonCount = 24;
    const harness = createButtonHarness(buttonCount);

    const centerForIndex = (index: number): Readonly<{ x: number; y: number }> => {
      const id = buttonId(index);
      const center = harness.centers.get(id);
      assert.ok(center !== undefined, `missing center for ${id}`);
      if (!center) {
        return Object.freeze({ x: 0, y: 0 });
      }
      return center;
    };

    const summary: MutableSummary = {
      renderCount: 0,
      actionCount: 0,
      focusHash: 2166136261 >>> 0,
      actionHash: 2166136261 >>> 0,
      seenFocus: new Set<string>(),
    };

    const apply = (event: ZrevEvent): void => {
      const outcome = harness.renderer.routeEngineEvent(event);
      recordOutcome(seed, summary, harness, outcome);
    };

    for (let i = 0; i < steps; i++) {
      const timeMs = sameTimestamp ? 77 : i;
      const roll = nextInt(rng, 0, 99);

      if (roll < 45) {
        apply(keyEvent(timeMs, ZR_KEY_TAB));
        continue;
      }

      if (roll < 65) {
        apply(keyEvent(timeMs, ZR_KEY_ENTER));
        continue;
      }

      if (roll < 90) {
        const targetIndex = nextInt(rng, 0, buttonCount - 1);
        const center = centerForIndex(targetIndex);
        apply(mouseEvent(timeMs, center.x, center.y, 3, { buttons: 1 }));
        apply(mouseEvent(timeMs, center.x, center.y, 4, { buttons: 0 }));
        continue;
      }

      const downIndex = nextInt(rng, 0, buttonCount - 1);
      const upIndex = nextInt(rng, 0, buttonCount - 1);
      const downCenter = centerForIndex(downIndex);
      const upCenter = centerForIndex(upIndex);
      apply(mouseEvent(timeMs, downCenter.x, downCenter.y, 3, { buttons: 1 }));
      apply(mouseEvent(timeMs, upCenter.x, upCenter.y, 4, { buttons: 0 }));
    }

    return toReadonlySummary(summary, harness.renderer.getFocusedId());
  });
}

describe("stress rapid events", () => {
  test("1000 TAB key events keep focus cycling deterministic", () => {
    const buttonCount = 17;
    const keyEventCount = 1000;
    const harness = createButtonHarness(buttonCount);
    let needsRenderCount = 0;

    for (let i = 0; i < keyEventCount; i++) {
      const outcome = harness.renderer.routeEngineEvent(keyEvent(i, ZR_KEY_TAB));
      assert.equal(outcome.action, undefined, `TAB should not emit action at index=${String(i)}`);
      if (outcome.needsRender) {
        needsRenderCount++;
      }
    }

    const expectedFocusedId = buttonId((keyEventCount - 1) % buttonCount);
    assert.equal(harness.renderer.getFocusedId(), expectedFocusedId);
    assert.equal(needsRenderCount, keyEventCount);
  });

  test("seeded 1000-key burst replays identically", () => {
    const seed = 0x24ad0f31;
    const a = runKeyBurst(seed, 1000);
    const b = runKeyBurst(seed, 1000);

    assert.deepEqual(b, a, `seed=${String(seed)} should replay identically`);
    assert.equal(a.renderCount > 0, true, "stress stream should include render-triggering events");
    assert.equal(a.actionCount > 0, true, "stress stream should include key-driven button presses");
  });

  test("mixed mouse + keyboard stream replays identically", () => {
    const seed = 0x51a2b3c4;
    const a = runMixedScenario(seed, 450, false);
    const b = runMixedScenario(seed, 450, false);

    assert.deepEqual(b, a, `seed=${String(seed)} should replay identically`);
    assert.equal(a.actionCount > 0, true, "mixed stream should trigger press actions");
    assert.equal(
      a.seenFocusIds.length > 6,
      true,
      "mixed stream should traverse many focus targets",
    );
  });

  test("rapid focus changes from alternating click + TAB remain exact", () => {
    const seed = 0x9e3779b9;

    withSeed(seed, (rng) => {
      const buttonCount = 31;
      const cycles = 320;
      const harness = createButtonHarness(buttonCount);

      for (let i = 0; i < cycles; i++) {
        const targetIndex = nextInt(rng, 0, buttonCount - 1);
        const targetId = buttonId(targetIndex);
        const center = harness.centers.get(targetId);
        assert.ok(center !== undefined, `missing center for ${targetId}`);
        if (!center) continue;

        const baseTime = i * 3;
        harness.renderer.routeEngineEvent(
          mouseEvent(baseTime, center.x, center.y, 3, { buttons: 1 }),
        );
        harness.renderer.routeEngineEvent(
          mouseEvent(baseTime + 1, center.x, center.y, 4, { buttons: 0 }),
        );
        assert.equal(
          harness.renderer.getFocusedId(),
          targetId,
          `seed=${String(seed)} cycle=${String(i)} click focus mismatch`,
        );

        harness.renderer.routeEngineEvent(keyEvent(baseTime + 2, ZR_KEY_TAB));
        const expectedAfterTab = buttonId((targetIndex + 1) % buttonCount);
        assert.equal(
          harness.renderer.getFocusedId(),
          expectedAfterTab,
          `seed=${String(seed)} cycle=${String(i)} tab focus mismatch`,
        );
      }
    });
  });

  test("same-timestamp mixed bursts remain deterministic", () => {
    const seed = 0x1337c0de;
    const a = runMixedScenario(seed, 700, true);
    const b = runMixedScenario(seed, 700, true);

    assert.deepEqual(b, a, `seed=${String(seed)} should be stable with identical timestamps`);
    assert.equal(a.renderCount > 0, true);
  });

  test("long mixed stream keeps focus constrained to known ids", () => {
    const seed = 0x0ddc0ffe;
    const summary = runMixedScenario(seed, 2000, false);

    assert.equal(summary.seenFocusIds.length > 0, true, "expected at least one focused id");
    assert.equal(
      summary.seenFocusIds.length <= 24,
      true,
      "focus should remain within declared ids",
    );
  });
});

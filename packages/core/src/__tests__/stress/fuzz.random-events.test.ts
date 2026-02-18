import { assert, createRng, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_TAB,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import { ui } from "../../widgets/ui.js";

const ITERATIONS = 1024;

const LETTER_KEYS = Object.freeze(Array.from({ length: 26 }, (_unused, idx) => 65 + idx));
const DIGIT_KEYS = Object.freeze(Array.from({ length: 10 }, (_unused, idx) => 48 + idx));
const NAV_KEYS = Object.freeze([
  ZR_KEY_TAB,
  ZR_KEY_ENTER,
  ZR_KEY_BACKSPACE,
  ZR_KEY_ESCAPE,
  ZR_KEY_UP,
  ZR_KEY_DOWN,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_HOME,
  ZR_KEY_END,
]);
const KEY_POOL = Object.freeze([...NAV_KEYS, ...LETTER_KEYS, ...DIGIT_KEYS]);

type Rng = ReturnType<typeof createRng>;
type EncodedBatchEvent = NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>[number];
type EncodedInputEvent = Extract<EncodedBatchEvent, { kind: "key" | "mouse" | "text" }>;
type EngineInputEvent = Extract<ZrevEvent, { kind: "key" | "mouse" | "text" }>;
type EventProfile = Readonly<{
  minSeqLen: number;
  maxSeqLen: number;
  keyWeight: number;
  mouseWeight: number;
  textWeight: number;
  interactiveKeyBias: boolean;
  targetMouseBias: boolean;
}>;

type StreamState = {
  nextTimeMs: number;
  keyDown: number[];
  mouseDown: boolean;
  x: number;
  y: number;
};

type EngineState = Readonly<{
  keyCount: number;
  mouseCount: number;
  textCount: number;
  totalCount: number;
  checksum: number;
  lastTimeMs: number;
}>;

type FuzzState = EngineState &
  Readonly<{
    actionCount: number;
    pressCount: number;
    inputCount: number;
    mainValue: string;
    mainCursor: number;
    auxValue: string;
    auxCursor: number;
  }>;

const INITIAL_ENGINE_STATE: EngineState = Object.freeze({
  keyCount: 0,
  mouseCount: 0,
  textCount: 0,
  totalCount: 0,
  checksum: 0,
  lastTimeMs: 0,
});

const INITIAL_STATE: FuzzState = Object.freeze({
  ...INITIAL_ENGINE_STATE,
  actionCount: 0,
  pressCount: 0,
  inputCount: 0,
  mainValue: "",
  mainCursor: 0,
  auxValue: "",
  auxCursor: 0,
});

function hexSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16).padStart(8, "0")}`;
}

function failCtx(seed: number, iter: number): string {
  return `seed=${hexSeed(seed)} iter=${String(iter)}`;
}

function randomInt(rng: Rng, min: number, max: number): number {
  return min + (rng.u32() % (max - min + 1));
}

function chance(rng: Rng, percent: number): boolean {
  return rng.u32() % 100 < percent;
}

function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[rng.u32() % values.length] as T;
}

function mix32(x: number, value: number): number {
  let out = (x ^ (value >>> 0)) >>> 0;
  out = Math.imul(out ^ (out >>> 16), 0x85ebca6b) >>> 0;
  out = Math.imul(out ^ (out >>> 13), 0xc2b2ae35) >>> 0;
  return (out ^ (out >>> 16)) >>> 0;
}

function actionCode(action: "down" | "up" | "repeat"): number {
  if (action === "down") return 1;
  if (action === "up") return 2;
  return 3;
}

function checksumKey(
  prev: number,
  timeMs: number,
  key: number,
  mods: number,
  action: "down" | "up" | "repeat",
): number {
  let x = mix32(prev, 0x11);
  x = mix32(x, timeMs);
  x = mix32(x, key);
  x = mix32(x, mods);
  x = mix32(x, actionCode(action));
  return x >>> 0;
}

function checksumMouse(
  prev: number,
  timeMs: number,
  xPos: number,
  yPos: number,
  mouseKind: number,
  mods: number,
  buttons: number,
  wheelX: number,
  wheelY: number,
): number {
  let x = mix32(prev, 0x22);
  x = mix32(x, timeMs);
  x = mix32(x, xPos);
  x = mix32(x, yPos);
  x = mix32(x, mouseKind);
  x = mix32(x, mods);
  x = mix32(x, buttons);
  x = mix32(x, wheelX);
  x = mix32(x, wheelY);
  return x >>> 0;
}

function checksumText(prev: number, timeMs: number, codepoint: number): number {
  let x = mix32(prev, 0x33);
  x = mix32(x, timeMs);
  x = mix32(x, codepoint);
  return x >>> 0;
}

function applyExpectedEngine(prev: EngineState, event: EncodedInputEvent): EngineState {
  if (event.kind === "key") {
    return {
      keyCount: prev.keyCount + 1,
      mouseCount: prev.mouseCount,
      textCount: prev.textCount,
      totalCount: prev.totalCount + 1,
      checksum: checksumKey(prev.checksum, event.timeMs, event.key, event.mods ?? 0, event.action),
      lastTimeMs: event.timeMs,
    };
  }

  if (event.kind === "mouse") {
    return {
      keyCount: prev.keyCount,
      mouseCount: prev.mouseCount + 1,
      textCount: prev.textCount,
      totalCount: prev.totalCount + 1,
      checksum: checksumMouse(
        prev.checksum,
        event.timeMs,
        event.x,
        event.y,
        event.mouseKind,
        event.mods ?? 0,
        event.buttons ?? 0,
        event.wheelX ?? 0,
        event.wheelY ?? 0,
      ),
      lastTimeMs: event.timeMs,
    };
  }

  return {
    keyCount: prev.keyCount,
    mouseCount: prev.mouseCount,
    textCount: prev.textCount + 1,
    totalCount: prev.totalCount + 1,
    checksum: checksumText(prev.checksum, event.timeMs, event.codepoint),
    lastTimeMs: event.timeMs,
  };
}

function applyActualEngine(prev: FuzzState, event: EngineInputEvent): FuzzState {
  if (event.kind === "key") {
    return {
      ...prev,
      keyCount: prev.keyCount + 1,
      totalCount: prev.totalCount + 1,
      checksum: checksumKey(prev.checksum, event.timeMs, event.key, event.mods, event.action),
      lastTimeMs: event.timeMs,
    };
  }

  if (event.kind === "mouse") {
    return {
      ...prev,
      mouseCount: prev.mouseCount + 1,
      totalCount: prev.totalCount + 1,
      checksum: checksumMouse(
        prev.checksum,
        event.timeMs,
        event.x,
        event.y,
        event.mouseKind,
        event.mods,
        event.buttons,
        event.wheelX,
        event.wheelY,
      ),
      lastTimeMs: event.timeMs,
    };
  }

  return {
    ...prev,
    textCount: prev.textCount + 1,
    totalCount: prev.totalCount + 1,
    checksum: checksumText(prev.checksum, event.timeMs, event.codepoint),
    lastTimeMs: event.timeMs,
  };
}

function weightedKind(rng: Rng, profile: EventProfile): "key" | "mouse" | "text" {
  const total = profile.keyWeight + profile.mouseWeight + profile.textWeight;
  const roll = rng.u32() % total;
  if (roll < profile.keyWeight) return "key";
  if (roll < profile.keyWeight + profile.mouseWeight) return "mouse";
  return "text";
}

function randomMods(rng: Rng): number {
  const roll = rng.u32() % 100;
  if (roll < 60) return 0;
  return rng.u32() & 0x0f;
}

function randomKeyCode(rng: Rng, profile: EventProfile): number {
  if (profile.interactiveKeyBias && chance(rng, 65)) {
    return pick(rng, NAV_KEYS);
  }
  return pick(rng, KEY_POOL);
}

function nextTime(stream: StreamState, rng: Rng): number {
  stream.nextTimeMs += 1 + (rng.u32() % 5);
  return stream.nextTimeMs;
}

function generateKeyEvent(rng: Rng, stream: StreamState, profile: EventProfile): EncodedInputEvent {
  let action: "down" | "up" | "repeat";
  if (stream.keyDown.length === 0) {
    action = "down";
  } else {
    const roll = rng.u32() % 100;
    action = roll < 58 ? "down" : roll < 82 ? "repeat" : "up";
  }

  let key = randomKeyCode(rng, profile);
  if (action === "down") {
    if (!stream.keyDown.includes(key)) stream.keyDown.push(key);
  } else {
    key = stream.keyDown[rng.u32() % stream.keyDown.length] ?? key;
    if (action === "up") {
      stream.keyDown = stream.keyDown.filter((v) => v !== key);
    }
  }

  return {
    kind: "key",
    timeMs: nextTime(stream, rng),
    key,
    mods: randomMods(rng),
    action,
  };
}

function randomMousePoint(
  rng: Rng,
  profile: EventProfile,
  viewport: Readonly<{ cols: number; rows: number }>,
): Readonly<{ x: number; y: number }> {
  if (profile.targetMouseBias && chance(rng, 72)) {
    const zones = [
      { x0: 1, x1: 28, y0: 1, y1: 2 },
      { x0: 1, x1: 52, y0: 3, y1: 3 },
      { x0: 1, x1: 52, y0: 4, y1: 4 },
    ] as const;
    const zone = pick(rng, zones);
    return {
      x: Math.min(viewport.cols - 1, randomInt(rng, zone.x0, zone.x1)),
      y: Math.min(viewport.rows - 1, randomInt(rng, zone.y0, zone.y1)),
    };
  }

  return {
    x: randomInt(rng, 0, viewport.cols - 1),
    y: randomInt(rng, 0, viewport.rows - 1),
  };
}

function generateMouseEvent(
  rng: Rng,
  stream: StreamState,
  profile: EventProfile,
  viewport: Readonly<{ cols: number; rows: number }>,
): EncodedInputEvent {
  const kindPool: readonly (1 | 2 | 3 | 4 | 5)[] = stream.mouseDown
    ? [4, 4, 1, 3, 5]
    : [1, 1, 2, 5, 1];
  const mouseKind = pick(rng, kindPool);

  if (mouseKind === 2) stream.mouseDown = true;
  if (mouseKind === 3) stream.mouseDown = false;

  const point = randomMousePoint(rng, profile, viewport);
  stream.x = point.x;
  stream.y = point.y;

  const wheelX = mouseKind === 5 ? randomInt(rng, -1, 1) : 0;
  const wheelY = mouseKind === 5 ? randomInt(rng, -1, 1) : 0;
  const buttons = mouseKind === 2 || mouseKind === 4 ? 1 : 0;

  return {
    kind: "mouse",
    timeMs: nextTime(stream, rng),
    x: point.x,
    y: point.y,
    mouseKind,
    mods: randomMods(rng),
    buttons,
    wheelX,
    wheelY,
  };
}

function generateTextEvent(rng: Rng, stream: StreamState): EncodedInputEvent {
  return {
    kind: "text",
    timeMs: nextTime(stream, rng),
    codepoint: 32 + (rng.u32() % 95),
  };
}

function generateSequence(
  rng: Rng,
  stream: StreamState,
  profile: EventProfile,
  viewport: Readonly<{ cols: number; rows: number }>,
): readonly EncodedInputEvent[] {
  const len = randomInt(rng, profile.minSeqLen, profile.maxSeqLen);
  const out: EncodedInputEvent[] = [];

  for (let i = 0; i < len; i++) {
    const kind = weightedKind(rng, profile);
    if (kind === "key") {
      out.push(generateKeyEvent(rng, stream, profile));
      continue;
    }
    if (kind === "mouse") {
      out.push(generateMouseEvent(rng, stream, profile, viewport));
      continue;
    }
    out.push(generateTextEvent(rng, stream));
  }

  if (stream.mouseDown && chance(rng, 20)) {
    stream.mouseDown = false;
    out.push({
      kind: "mouse",
      timeMs: nextTime(stream, rng),
      x: stream.x,
      y: stream.y,
      mouseKind: 3,
      mods: 0,
      buttons: 0,
      wheelX: 0,
      wheelY: 0,
    });
  }

  return out;
}

function isInputEngineEvent(event: ZrevEvent): event is EngineInputEvent {
  return event.kind === "key" || event.kind === "mouse" || event.kind === "text";
}

async function pushBatch(
  backend: StubBackend,
  events: readonly EncodedBatchEvent[],
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(2);
}

async function waitForEngineTotal(targetTotal: number, read: () => FuzzState): Promise<boolean> {
  for (let spin = 0; spin < 30; spin++) {
    if (read().totalCount >= targetTotal) return true;
    await flushMicrotasks(2);
  }
  return read().totalCount >= targetTotal;
}

function assertStateInvariants(
  state: FuzzState,
  expected: EngineState,
  seed: number,
  iter: number,
): void {
  const ctx = failCtx(seed, iter);

  assert.equal(state.keyCount, expected.keyCount, `key count mismatch (${ctx})`);
  assert.equal(state.mouseCount, expected.mouseCount, `mouse count mismatch (${ctx})`);
  assert.equal(state.textCount, expected.textCount, `text count mismatch (${ctx})`);
  assert.equal(state.totalCount, expected.totalCount, `total count mismatch (${ctx})`);
  assert.equal(state.checksum >>> 0, expected.checksum >>> 0, `checksum mismatch (${ctx})`);
  assert.equal(state.lastTimeMs, expected.lastTimeMs, `lastTimeMs mismatch (${ctx})`);

  assert.equal(
    state.totalCount,
    state.keyCount + state.mouseCount + state.textCount,
    `engine count decomposition mismatch (${ctx})`,
  );
  assert.equal(
    state.actionCount,
    state.pressCount + state.inputCount,
    `action decomposition mismatch (${ctx})`,
  );
  assert.equal(
    state.mainCursor >= 0 && state.mainCursor <= state.mainValue.length,
    true,
    `main cursor bounds mismatch (${ctx})`,
  );
  assert.equal(
    state.auxCursor >= 0 && state.auxCursor <= state.auxValue.length,
    true,
    `aux cursor bounds mismatch (${ctx})`,
  );
}

async function runEventFuzz(seed: number, profile: EventProfile): Promise<void> {
  const rng = createRng(seed);
  const backend = new StubBackend();
  const viewport = Object.freeze({ cols: 80, rows: 24 });

  let latestState: FuzzState = INITIAL_STATE;
  let expectedState: EngineState = INITIAL_ENGINE_STATE;
  let activeCtx = `seed=${hexSeed(seed)} boot`;

  const fatals: string[] = [];
  const violations: string[] = [];

  const app = createApp({
    backend,
    initialState: INITIAL_STATE,
  });

  app.view((state) => {
    latestState = state as FuzzState;
    return ui.column({ gap: 1 }, [
      ui.text(
        `k:${String(state.keyCount)} m:${String(state.mouseCount)} t:${String(state.textCount)}`,
      ),
      ui.row({ gap: 1 }, [ui.button("btn-main", "Main"), ui.button("btn-aux", "Aux")]),
      ui.input("inp-main", state.mainValue),
      ui.input("inp-aux", state.auxValue),
    ]);
  });

  app.onEvent((ev) => {
    if (ev.kind === "fatal") {
      fatals.push(`${activeCtx}: ${ev.code}: ${ev.detail}`);
      return;
    }

    if (ev.kind === "engine") {
      if (!isInputEngineEvent(ev.event)) return;
      const engineEvent = ev.event;

      app.update((prev) => {
        const prevState = prev as FuzzState;
        if (engineEvent.timeMs < prevState.lastTimeMs) {
          violations.push(
            `${activeCtx}: non-monotonic event time ${String(engineEvent.timeMs)} < ${String(prevState.lastTimeMs)}`,
          );
        }
        const next = applyActualEngine(prevState, engineEvent);
        latestState = next;
        return next;
      });
      return;
    }

    if (ev.kind !== "action") return;

    app.update((prev) => {
      const prevState = prev as FuzzState;
      const knownIds = new Set(["btn-main", "btn-aux", "inp-main", "inp-aux"]);
      if (!knownIds.has(ev.id)) {
        violations.push(`${activeCtx}: unknown action id ${ev.id}`);
        return prevState;
      }

      if (ev.action === "press") {
        const next = {
          ...prevState,
          actionCount: prevState.actionCount + 1,
          pressCount: prevState.pressCount + 1,
        };
        latestState = next;
        return next;
      }

      if (ev.id !== "inp-main" && ev.id !== "inp-aux") {
        violations.push(`${activeCtx}: input action routed to non-input id ${ev.id}`);
        return prevState;
      }

      if (ev.cursor < 0 || ev.cursor > ev.value.length) {
        violations.push(
          `${activeCtx}: input cursor out of bounds id=${ev.id} cursor=${String(ev.cursor)} len=${String(ev.value.length)}`,
        );
      }

      const next =
        ev.id === "inp-main"
          ? {
              ...prevState,
              actionCount: prevState.actionCount + 1,
              inputCount: prevState.inputCount + 1,
              mainValue: ev.value,
              mainCursor: ev.cursor,
            }
          : {
              ...prevState,
              actionCount: prevState.actionCount + 1,
              inputCount: prevState.inputCount + 1,
              auxValue: ev.value,
              auxCursor: ev.cursor,
            };
      latestState = next;
      return next;
    });
  });

  await app.start();
  await flushMicrotasks(8);
  await pushBatch(backend, [
    { kind: "resize", timeMs: 1, cols: viewport.cols, rows: viewport.rows },
  ]);
  await flushMicrotasks(8);

  const stream: StreamState = {
    nextTimeMs: 1,
    keyDown: [],
    mouseDown: false,
    x: 1,
    y: 1,
  };

  for (let iter = 0; iter < ITERATIONS; iter++) {
    activeCtx = failCtx(seed, iter);
    const sequence = generateSequence(rng, stream, profile, viewport);
    for (const event of sequence) {
      expectedState = applyExpectedEngine(expectedState, event);
    }

    await pushBatch(backend, sequence);
    const reached = await waitForEngineTotal(expectedState.totalCount, () => latestState);
    if (!reached) {
      assert.fail(
        `engine updates stalled (${activeCtx}): expected total=${String(expectedState.totalCount)} actual total=${String(latestState.totalCount)}`,
      );
    }

    if (fatals.length > 0) {
      assert.fail(`fatal event in fuzz run (${activeCtx}): ${fatals[0]}`);
    }
    if (violations.length > 0) {
      assert.fail(`state invariant violation (${activeCtx}): ${violations[0]}`);
    }

    assertStateInvariants(latestState, expectedState, seed, iter);
  }
}

describe("seeded random event sequence fuzz (running app)", () => {
  test("key-heavy stream (1024 iters, seed 0x6e7e1001)", async () => {
    await runEventFuzz(0x6e7e_1001, {
      minSeqLen: 2,
      maxSeqLen: 6,
      keyWeight: 66,
      mouseWeight: 20,
      textWeight: 14,
      interactiveKeyBias: true,
      targetMouseBias: false,
    });
  });

  test("mouse-heavy stream (1024 iters, seed 0x6e7e1002)", async () => {
    await runEventFuzz(0x6e7e_1002, {
      minSeqLen: 2,
      maxSeqLen: 7,
      keyWeight: 18,
      mouseWeight: 68,
      textWeight: 14,
      interactiveKeyBias: false,
      targetMouseBias: true,
    });
  });

  test("text-heavy stream (1024 iters, seed 0x6e7e1003)", async () => {
    await runEventFuzz(0x6e7e_1003, {
      minSeqLen: 2,
      maxSeqLen: 8,
      keyWeight: 18,
      mouseWeight: 20,
      textWeight: 62,
      interactiveKeyBias: true,
      targetMouseBias: false,
    });
  });

  test("balanced mixed stream (1024 iters, seed 0x6e7e1004)", async () => {
    await runEventFuzz(0x6e7e_1004, {
      minSeqLen: 3,
      maxSeqLen: 9,
      keyWeight: 34,
      mouseWeight: 33,
      textWeight: 33,
      interactiveKeyBias: true,
      targetMouseBias: true,
    });
  });

  test("long burst sequences (1024 iters, seed 0x6e7e1005)", async () => {
    await runEventFuzz(0x6e7e_1005, {
      minSeqLen: 8,
      maxSeqLen: 16,
      keyWeight: 38,
      mouseWeight: 30,
      textWeight: 32,
      interactiveKeyBias: false,
      targetMouseBias: true,
    });
  });

  test("interaction-biased stream (1024 iters, seed 0x6e7e1006)", async () => {
    await runEventFuzz(0x6e7e_1006, {
      minSeqLen: 4,
      maxSeqLen: 10,
      keyWeight: 42,
      mouseWeight: 36,
      textWeight: 22,
      interactiveKeyBias: true,
      targetMouseBias: true,
    });
  });
});

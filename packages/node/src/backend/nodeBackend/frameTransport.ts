import {
  FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD,
  FRAME_SAB_CONTROL_HEADER_WORDS,
  FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
  FRAME_SAB_CONTROL_WORDS_PER_SLOT,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_SAB_SLOT_STATE_WRITING,
} from "../../worker/protocol.js";

export const FRAME_SAB_SLOT_COUNT_DEFAULT = 8 as const;
export const FRAME_SAB_SLOT_BYTES_DEFAULT = 1 << 20;

export type SabFrameTransport = Readonly<{
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
  slotCount: number;
  slotBytes: number;
  controlHeader: Int32Array;
  states: Int32Array;
  tokens: Int32Array;
  dataBytes: Uint8Array;
  nextSlot: { value: number };
}>;

export type SabSlotAcquireResult = Readonly<{
  slotIndex: number;
  reclaimedReady: boolean;
}>;

export function copyInto(buf: ArrayBuffer, bytes: Uint8Array): void {
  new Uint8Array(buf, 0, bytes.byteLength).set(bytes);
}

export function frameSeqToSlotToken(frameSeq: number): number {
  const token = frameSeq & 0x7fff_ffff;
  return token === 0 ? 1 : token;
}

export function createSabFrameTransport(
  slotCount: number,
  slotBytes: number,
): SabFrameTransport | null {
  if (typeof SharedArrayBuffer !== "function") return null;
  const control = new SharedArrayBuffer(
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount * FRAME_SAB_CONTROL_WORDS_PER_SLOT) *
      Int32Array.BYTES_PER_ELEMENT,
  );
  const controlHeader = new Int32Array(control, 0, FRAME_SAB_CONTROL_HEADER_WORDS);
  const states = new Int32Array(
    control,
    FRAME_SAB_CONTROL_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const tokens = new Int32Array(
    control,
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount) * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD, 0);
  for (let i = 0; i < slotCount; i++) {
    Atomics.store(states, i, FRAME_SAB_SLOT_STATE_FREE);
    Atomics.store(tokens, i, 0);
  }
  const data = new SharedArrayBuffer(slotCount * slotBytes);
  return {
    control,
    data,
    slotCount,
    slotBytes,
    controlHeader,
    states,
    tokens,
    dataBytes: new Uint8Array(data),
    nextSlot: { value: 0 },
  };
}

export function resetSabFrameTransport(t: SabFrameTransport): void {
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD, 0);
  for (let i = 0; i < t.slotCount; i++) {
    Atomics.store(t.states, i, FRAME_SAB_SLOT_STATE_FREE);
    Atomics.store(t.tokens, i, 0);
  }
  t.nextSlot.value = 0;
}

export function acquireSabSlot(t: SabFrameTransport): number {
  const start = t.nextSlot.value % t.slotCount;
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_FREE,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_FREE) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return slot;
    }
  }
  // Latest-wins semantics allow reclaiming stale READY slots instead of
  // falling back to transfer under pressure.
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_READY,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_READY) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return slot;
    }
  }
  return -1;
}

export function acquireSabSlotTracked(t: SabFrameTransport): SabSlotAcquireResult {
  const start = t.nextSlot.value % t.slotCount;
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_FREE,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_FREE) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return { slotIndex: slot, reclaimedReady: false };
    }
  }
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_READY,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_READY) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return { slotIndex: slot, reclaimedReady: true };
    }
  }
  return { slotIndex: -1, reclaimedReady: false };
}

export function acquireSabFreeSlot(t: SabFrameTransport): number {
  const start = t.nextSlot.value % t.slotCount;
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_FREE,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_FREE) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return slot;
    }
  }
  return -1;
}

export function publishSabFrame(
  t: SabFrameTransport,
  frameSeq: number,
  slotIndex: number,
  slotToken: number,
  byteLen: number,
): void {
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, slotIndex);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, byteLen);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, slotToken);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, frameSeq);
}

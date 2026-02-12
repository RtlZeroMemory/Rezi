import type { Key as InkKey } from "ink";

type LegacyKeyFields = Readonly<{
  enter: boolean;
  home: boolean;
  end: boolean;
  super: boolean;
  hyper: boolean;
  capsLock: boolean;
  numLock: boolean;
  eventType: string | undefined;
}>;

type InkCompatKeyInput = Partial<InkKey> &
  Readonly<{
    enter?: boolean;
    home?: boolean;
    end?: boolean;
    super?: boolean;
    hyper?: boolean;
    capsLock?: boolean;
    numLock?: boolean;
    eventType?: unknown;
  }>;

export type InkCompatKey = InkKey & LegacyKeyFields;

function isTrue(value: unknown): boolean {
  return value === true;
}

export function normalizeKey(key: InkCompatKeyInput | null | undefined): InkCompatKey {
  const safe = key ?? {};
  const isReturn = isTrue(safe.return);
  const isDelete = isTrue(safe.delete);
  const isBackspace = isTrue(safe.backspace) || isDelete;
  const eventType = typeof safe.eventType === "string" ? safe.eventType : undefined;

  return {
    upArrow: isTrue(safe.upArrow),
    downArrow: isTrue(safe.downArrow),
    leftArrow: isTrue(safe.leftArrow),
    rightArrow: isTrue(safe.rightArrow),
    pageDown: isTrue(safe.pageDown),
    pageUp: isTrue(safe.pageUp),
    home: isTrue(safe.home),
    end: isTrue(safe.end),
    return: isReturn,
    enter: isReturn,
    escape: isTrue(safe.escape),
    ctrl: isTrue(safe.ctrl),
    shift: isTrue(safe.shift),
    tab: isTrue(safe.tab),
    backspace: isBackspace,
    delete: isDelete,
    meta: isTrue(safe.meta),
    super: isTrue(safe.super),
    hyper: isTrue(safe.hyper),
    capsLock: isTrue(safe.capsLock),
    numLock: isTrue(safe.numLock),
    eventType,
  };
}

export function isCtrlC(input: string, key: Partial<InkCompatKey> | null | undefined): boolean {
  if (!isTrue(key?.ctrl)) return false;
  return input.length === 1 && input.toLowerCase() === "c";
}

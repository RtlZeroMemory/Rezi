import { ZrUiError, type ZrUiErrorCode } from "../../abi.js";
import type { AppRuntimeState } from "../stateMachine.js";

type CreateAppGuardsOptions = Readonly<{
  getEventHandlerDepth: () => number;
  getLifecycleBusy: () => "start" | "stop" | null;
  getRuntimeState: () => AppRuntimeState;
  isInCommit: () => boolean;
  isInRender: () => boolean;
}>;

export type AppGuards = Readonly<{
  assertKeybindingMutationAllowed: (method: string) => void;
  assertLifecycleIdle: (method: string) => void;
  assertNotReentrant: (method: string) => void;
  assertOperational: (method: string) => void;
  assertRouterMutationAllowed: (method: string) => void;
  throwCode: (code: ZrUiErrorCode, detail: string) => never;
  updateDuringRenderDetail: (method: string) => string;
}>;

export function createAppGuards(options: CreateAppGuardsOptions): AppGuards {
  function throwCode(code: ZrUiErrorCode, detail: string): never {
    throw new ZrUiError(code, detail);
  }

  function assertOperational(method: string): void {
    const st = options.getRuntimeState();
    if (st === "Disposed" || st === "Faulted") {
      throwCode("ZRUI_INVALID_STATE", `${method}: app is ${st}`);
    }
    if (options.getLifecycleBusy() !== null) {
      throwCode("ZRUI_INVALID_STATE", `${method}: lifecycle operation already in flight`);
    }
  }

  function assertLifecycleIdle(method: string): void {
    if (options.getLifecycleBusy() !== null) {
      throwCode("ZRUI_INVALID_STATE", `${method}: lifecycle operation already in flight`);
    }
  }

  function assertNotReentrant(method: string): void {
    if (options.isInCommit() || options.isInRender() || options.getEventHandlerDepth() > 0) {
      throwCode("ZRUI_REENTRANT_CALL", `${method}: re-entrant call`);
    }
  }

  function updateDuringRenderDetail(method: string): string {
    return `${method}: called during render. Hint: This usually means an onPress/onChange callback calls app.update() synchronously during the render phase. Move state updates to event handlers or useEffect.`;
  }

  function assertRouterMutationAllowed(method: string): void {
    assertOperational(method);
    if (options.isInCommit()) throwCode("ZRUI_REENTRANT_CALL", `${method}: called during commit`);
    if (options.isInRender()) {
      throwCode("ZRUI_UPDATE_DURING_RENDER", updateDuringRenderDetail(method));
    }
  }

  function assertKeybindingMutationAllowed(method: string): void {
    assertOperational(method);
    if (options.isInCommit()) throwCode("ZRUI_REENTRANT_CALL", `${method}: called during commit`);
    if (options.isInRender()) {
      throwCode("ZRUI_UPDATE_DURING_RENDER", updateDuringRenderDetail(method));
    }
  }

  return {
    assertKeybindingMutationAllowed,
    assertLifecycleIdle,
    assertNotReentrant,
    assertOperational,
    assertRouterMutationAllowed,
    throwCode,
    updateDuringRenderDetail,
  };
}

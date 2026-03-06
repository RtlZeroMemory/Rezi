import { describeThrown } from "../../debug/describeThrown.js";
import type { ZrevEvent } from "../../events.js";
import type { LayerRoutingCtx, LayerRoutingResult } from "./types.js";

/* --- Key Codes (locked by engine ABI) --- */
/* MUST match packages/core/src/keybindings/keyCodes.ts */
const ZR_KEY_ESCAPE = 1;

const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
const DEV_MODE = NODE_ENV !== "production";

function warnDev(message: string): void {
  if (!DEV_MODE) return;
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

/**
 * Route ESC key to the topmost layer only.
 *
 * @param event - The ZREV event
 * @param ctx - Layer routing context
 * @returns Routing result
 */
export function routeLayerEscape(event: ZrevEvent, ctx: LayerRoutingCtx): LayerRoutingResult {
  if (event.kind !== "key") return Object.freeze({ consumed: false });
  if (event.action !== "down") return Object.freeze({ consumed: false });
  if (event.key !== ZR_KEY_ESCAPE) return Object.freeze({ consumed: false });

  const { layerStack, closeOnEscape, onClose } = ctx;

  const layerId = layerStack[layerStack.length - 1];
  if (!layerId) {
    return Object.freeze({ consumed: false });
  }

  const canClose = closeOnEscape.get(layerId) ?? true;
  if (canClose !== true) {
    return Object.freeze({ consumed: false });
  }

  const closeCallback = onClose.get(layerId);
  if (!closeCallback) {
    return Object.freeze({ consumed: true });
  }

  try {
    closeCallback();
  } catch (error: unknown) {
    warnDev(`[rezi] layer onClose callback threw: ${describeThrown(error)}`);
    return Object.freeze({
      consumed: true,
      callbackError: error,
    });
  }

  return Object.freeze({
    closedLayerId: layerId,
    consumed: true,
  });
}

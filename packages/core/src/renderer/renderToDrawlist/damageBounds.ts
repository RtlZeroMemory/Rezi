import type { Rect } from "../../layout/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import { getRectWithShadow, readShadowOffset } from "../shadow.js";

type BoxShadowProps = Readonly<{
  shadow?: unknown;
}>;

function resolveShadowOffsets(
  shadow: unknown,
): Readonly<{ offsetX: number; offsetY: number }> | null {
  if (shadow !== true && (shadow === false || shadow === undefined || shadow === null)) {
    return null;
  }
  if (shadow === true) {
    return Object.freeze({ offsetX: 1, offsetY: 1 });
  }
  if (typeof shadow !== "object") {
    return null;
  }

  const config = shadow as { offsetX?: unknown; offsetY?: unknown };
  const offsetX = readShadowOffset(config.offsetX, 1);
  const offsetY = readShadowOffset(config.offsetY, 1);
  if (offsetX <= 0 && offsetY <= 0) {
    return null;
  }
  return Object.freeze({ offsetX, offsetY });
}

export function getRuntimeNodeDamageRect(node: RuntimeInstance, rect: Rect): Rect {
  if (node.vnode.kind !== "box") return rect;
  const offsets = resolveShadowOffsets((node.vnode.props as BoxShadowProps).shadow);
  if (!offsets) return rect;
  return getRectWithShadow(rect, offsets);
}

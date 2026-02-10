import type { DOMElement } from "./types.js";
import { warnOnce } from "./internal/warn.js";

type Output = {
  width: number;
  height: number;
};

/**
 * Measure the dimensions of a `<Box>` element.
 *
 * In Ink this reads computed layout from the Yoga node. In ink-compat,
 * layout is computed by the Zireael C engine and not exposed back to JS,
 * so this function returns explicitly-set `width`/`height` props when
 * available, or `0` with a one-time warning.
 */
export default function measureElement(node: DOMElement): Output {
  const attrs = (node as { props?: Record<string, unknown> }).props ?? node.attributes;

  const width = typeof attrs["width"] === "number" ? attrs["width"] : 0;
  const height = typeof attrs["height"] === "number" ? attrs["height"] : 0;

  if (width === 0 && height === 0) {
    warnOnce(
      "measureElement: Rezi computes layout in the native engine. " +
        "Measurements are only available when explicit width/height props are set on the <Box>.",
    );
  }

  return { width, height };
}

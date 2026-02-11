import {
  getBoundingBox,
  getInnerHeight,
  getInnerWidth,
  getScrollHeight,
  getScrollWidth,
  measureElementFromLayout,
} from "./measurement.js";
import type { DOMElement } from "./types.js";
export {
  getBoundingBox,
  getInnerHeight,
  getInnerWidth,
  getScrollHeight,
  getScrollWidth,
} from "./measurement.js";

/**
 * Measure the dimensions of a `<Box>` element.
 *
 * In ink-compat this reads committed layout from the latest renderer frame.
 */
export default function measureElement(node: DOMElement): { width: number; height: number } {
  return measureElementFromLayout(node);
}

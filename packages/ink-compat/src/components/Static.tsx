import React, { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import type { Styles } from "../types.js";

export type Props<T> = Readonly<{
  /**
   * Array of items of any type to render using a function you pass as a component child.
   */
  items: T[];
  /**
   * Styles to apply to a container of child elements. See `<Box>` for supported properties.
   */
  style?: Styles;
  /**
   * Function that is called to render every item in `items` array.
   * First argument is an item itself and second argument is index of that item in `items` array.
   * Note that `key` must be assigned to the root component.
   */
  children: (item: T, index: number) => ReactNode;
}>;

/**
 * Ink-compatible `<Static>` component.
 *
 * Ink's implementation relies on static output being rendered separately and left on the terminal.
 * Rezi re-renders the full framebuffer, so we emulate Ink semantics by accumulating static nodes
 * in the renderer layer (see `internal_static` handling in the compat reconciler).
 */
export default function Static<T>(props: Props<T>): React.JSX.Element {
  const { items, children: render, style: customStyle } = props;
  const [index, setIndex] = useState(0);

  const itemsToRender = useMemo(() => items.slice(index), [items, index]);

  useLayoutEffect(() => {
    setIndex(items.length);
  }, [items.length]);

  const children = itemsToRender.map((item, itemIndex) => render(item, index + itemIndex));

  const style = useMemo(
    () => ({
      position: "absolute" as const,
      flexDirection: "column" as const,
      ...(customStyle ?? {}),
    }),
    [customStyle],
  );

  return React.createElement("ink-box", { internal_static: true, ...style }, children);
}

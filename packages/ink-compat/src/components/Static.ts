import React, { useLayoutEffect, useMemo, useState } from "react";

export interface StaticProps<T> {
  items: T[];
  children: (item: T, index: number) => React.ReactNode;
  style?: Record<string, unknown>;
}

/**
 * <Static> renders items once. This implementation marks the subtree as static
 * so renderers can treat it as scrollback-oriented output.
 */
export function Static<T>(props: StaticProps<T>): React.ReactElement {
  const { items, children: renderItem, style } = props;
  const [index, setIndex] = useState(0);

  const itemsToRender = useMemo(() => {
    return items.slice(index);
  }, [items, index]);

  useLayoutEffect(() => {
    setIndex(items.length);
  }, [items.length]);

  const staticStyle: Record<string, unknown> = {
    position: "absolute",
    flexDirection: "column",
    ...(style ?? {}),
  };

  return React.createElement(
    "ink-box",
    { __inkStatic: true, ...staticStyle },
    ...itemsToRender.map((item, itemIndex) =>
      React.createElement(
        React.Fragment,
        { key: index + itemIndex },
        renderItem(item, index + itemIndex),
      ),
    ),
  );
}

Static.displayName = "Static";

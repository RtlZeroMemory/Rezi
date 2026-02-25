import React from "react";

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
  const { items, children, style } = props;

  return React.createElement(
    "ink-box",
    { ...style, __inkStatic: true },
    ...items.map((item, index) =>
      React.createElement(React.Fragment, { key: index }, children(item, index)),
    ),
  );
}

Static.displayName = "Static";

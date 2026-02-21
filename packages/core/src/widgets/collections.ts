/**
 * packages/core/src/widgets/collections.ts — Collection helpers.
 */

import type { VNode } from "./types.js";

export type EachOptions<T> = Readonly<{
  key: (item: T, index: number) => string;
  empty?: () => VNode;
  container?: "column" | "row";
}>;

export type EachInlineOptions<T> = Readonly<{
  key: (item: T, index: number) => string;
  empty?: () => readonly VNode[];
}>;

function collectEachChildren<T>(
  items: readonly T[],
  render: (item: T, index: number) => VNode,
  keyFor: (item: T, index: number) => string,
): readonly VNode[] {
  const children: VNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
    const node = render(item, i);
    children.push(injectKey(node, keyFor(item, i)));
  }
  return Object.freeze(children);
}

export function eachInline<T>(
  items: readonly T[],
  render: (item: T, index: number) => VNode,
  options: EachInlineOptions<T>,
): readonly VNode[] {
  if (items.length === 0) {
    return options.empty ? Object.freeze([...options.empty()]) : Object.freeze([]);
  }
  return collectEachChildren(items, render, options.key);
}

export function each<T>(
  items: readonly T[],
  render: (item: T, index: number) => VNode,
  options: EachOptions<T>,
): VNode {
  if (items.length === 0 && options.empty) {
    return options.empty();
  }

  return {
    kind: options.container ?? "column",
    props: { gap: 0 },
    children: collectEachChildren(items, render, options.key),
  };
}

function injectKey(node: VNode, key: string): VNode {
  const props = node.props as { key?: unknown } & Record<string, unknown>;
  if (props.key === key) return node;
  return {
    ...node,
    props: { ...props, key },
  } as VNode;
}

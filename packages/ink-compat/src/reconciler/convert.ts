import { type RichTextSpan, type VNode, ui } from "@rezi-ui/core";
import { InkCompatError } from "../errors.js";
import { mapBoxProps } from "../props.js";
import type { BoxProps } from "../types.js";
import { convertText, sanitizeTextForTerminal, splitSpansByNewline } from "./textUtils.js";
import type { HostNode, HostRoot } from "./types.js";

type ConvertCtx = Readonly<{ staticVNodes: VNode[] }>;

function convertNode(node: HostNode, ctx: ConvertCtx): VNode | null {
  if (node.kind === "text") {
    // Strings are only valid inside <Text>. The reconciler enforces this already.
    const text = sanitizeTextForTerminal(node.text);
    if (text.length === 0) return null;
    const spans: RichTextSpan[] = [{ text }];
    if (text.includes("\n")) {
      const lines = splitSpansByNewline(spans);
      const children: VNode[] = lines.map((line) =>
        line.length === 0 ? ui.text("") : ui.text(line[0]?.text ?? ""),
      );
      return children.length === 1 ? (children[0] ?? ui.text("")) : ui.column({}, children);
    }
    return ui.text(text);
  }

  switch (node.type) {
    case "ink-box": {
      const isStatic = (node.props as { internal_static?: unknown }).internal_static === true;
      const mapped = mapBoxProps(node.props as unknown as BoxProps);
      if (mapped.hidden) return null;

      const childVNodes: VNode[] = [];
      for (const c of node.children) {
        const v = convertNode(c, ctx);
        if (v) childVNodes.push(v);
      }
      if (isStatic && childVNodes.length === 0) return null;
      if (mapped.reverseChildren) childVNodes.reverse();

      const measuredId = node.internal_id;
      const stackPropsWithId = mapped.wrapper
        ? mapped.stackProps
        : { ...mapped.stackProps, id: measuredId };
      const stack =
        mapped.stackKind === "row"
          ? ui.row(stackPropsWithId, childVNodes)
          : ui.column(stackPropsWithId, childVNodes);

      const wrapperWithId = mapped.wrapper ? { ...mapped.wrapper, id: measuredId } : null;
      const vnode = wrapperWithId ? ui.box(wrapperWithId, [stack]) : stack;

      if (isStatic) {
        ctx.staticVNodes.push(vnode);
        return null;
      }

      return vnode;
    }
    case "ink-text":
    case "ink-virtual-text":
      return convertText(node);
    case "ink-spacer":
      return ui.spacer({ flex: 1 });
    default:
      throw new InkCompatError("INK_COMPAT_UNSUPPORTED", `Unsupported host type: ${String(node)}`);
  }
}

export function convertRoot(root: HostRoot): VNode {
  const out: VNode[] = [];
  const ctx: ConvertCtx = { staticVNodes: root.staticVNodes };
  for (const c of root.children) {
    const v = convertNode(c, ctx);
    if (v) out.push(v);
  }

  const all = [...root.staticVNodes, ...out];
  if (all.length === 0) return ui.text("");
  if (all.length === 1) return all[0] ?? ui.text("");
  return ui.column({}, all);
}

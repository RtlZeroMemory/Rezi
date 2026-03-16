import type {
  AppShellOptions,
  CardOptions,
  HeaderOptions,
  LayersProps,
  MasterDetailOptions,
  PageOptions,
  SidebarOptions,
  StatusBarOptions,
  ToolbarOptions,
  VNode,
} from "../types.js";
import { box, column, row, spacer, text } from "./basic.js";
import {
  type ActionsOptions,
  type CenterOptions,
  type FormOptions,
  type PanelOptions,
  type UiChild,
  filterChildren,
  isUiChildren,
} from "./helpers.js";
import { button } from "./interactive.js";

export function layers(children: readonly UiChild[]): VNode;
export function layers(props: LayersProps, children?: readonly UiChild[]): VNode;
export function layers(
  propsOrChildren: LayersProps | readonly UiChild[],
  children: readonly UiChild[] = [],
): VNode {
  if (isUiChildren(propsOrChildren)) {
    return { kind: "layers", props: {}, children: filterChildren(propsOrChildren) };
  }
  return { kind: "layers", props: propsOrChildren, children: filterChildren(children) };
}

export function panel(title: string, children: readonly UiChild[]): VNode;
export function panel(options: PanelOptions, children: readonly UiChild[]): VNode;
export function panel(
  titleOrOptions: string | PanelOptions,
  children: readonly UiChild[] = [],
): VNode {
  const options: PanelOptions =
    typeof titleOrOptions === "string" ? { title: titleOrOptions } : titleOrOptions;
  const resolvedChildren = filterChildren(children);
  const inner =
    resolvedChildren.length <= 1
      ? resolvedChildren
      : [column({ gap: options.gap ?? 1 }, resolvedChildren)];
  return box(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      preset: "card",
      ...(options.title === undefined ? {} : { title: options.title }),
      border: options.variant ?? "rounded",
      p: options.p ?? 1,
      ...(options.style === undefined ? {} : { style: options.style }),
    },
    inner,
  );
}

export function form(children: readonly UiChild[]): VNode;
export function form(options: FormOptions, children: readonly UiChild[]): VNode;
export function form(
  optionsOrChildren: FormOptions | readonly UiChild[],
  children: readonly UiChild[] = [],
): VNode {
  if (isUiChildren(optionsOrChildren)) {
    return column({ gap: 1 }, optionsOrChildren);
  }
  const options = optionsOrChildren;
  return column(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      gap: options.gap ?? 1,
    },
    children,
  );
}

export function actions(children: readonly UiChild[]): VNode;
export function actions(options: ActionsOptions, children: readonly UiChild[]): VNode;
export function actions(
  optionsOrChildren: ActionsOptions | readonly UiChild[],
  children: readonly UiChild[] = [],
): VNode {
  if (isUiChildren(optionsOrChildren)) {
    return row({ justify: "end", gap: 1 }, optionsOrChildren);
  }
  const options = optionsOrChildren;
  return row(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      justify: "end",
      gap: options.gap ?? 1,
    },
    children,
  );
}

export function center(child: VNode, options: CenterOptions = {}): VNode {
  return column(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      width: "full",
      height: "full",
      align: "center",
      justify: "center",
      ...(options.p === undefined ? {} : { p: options.p }),
    },
    [child],
  );
}

export function page(options: PageOptions): VNode {
  const { id, key, header, body, footer, gap, p, width, height, ...layoutConstraints } = options;
  return column(
    {
      ...(id === undefined ? {} : { id }),
      ...(key === undefined ? {} : { key }),
      width: width ?? "full",
      height: height ?? "full",
      ...layoutConstraints,
      gap: gap ?? 1,
      p: p ?? 1,
    },
    [header ?? null, box({ border: "none", flex: 1 }, [body]), footer ?? null],
  );
}

export function appShell(options: AppShellOptions): VNode {
  const { id, key, header, sidebar, body, footer, gap, p, ...layoutConstraints } = options;
  const headerNode = header ? box({ border: "rounded", px: 1, py: 0 }, [header]) : null;
  const bodyNode = sidebar
    ? row({ gap: 1, items: "stretch" }, [
        box({ border: "rounded", width: sidebar.width ?? 25, p: 1 }, [sidebar.content]),
        box({ flex: 1 }, [body]),
      ])
    : body;
  const footerNode = footer ? row({ gap: 1, items: "center", wrap: true }, [footer]) : null;

  return page({
    ...(id === undefined ? {} : { id }),
    ...(key === undefined ? {} : { key }),
    header: headerNode,
    body: bodyNode,
    footer: footerNode,
    gap: gap ?? 1,
    p: p ?? 1,
    ...layoutConstraints,
  });
}

export function card(options: CardOptions, children: readonly UiChild[]): VNode;
export function card(title: string, children: readonly UiChild[]): VNode;
export function card(
  optionsOrTitle: CardOptions | string,
  children: readonly UiChild[] = [],
): VNode {
  const options: CardOptions =
    typeof optionsOrTitle === "string" ? { title: optionsOrTitle } : optionsOrTitle;
  const bodyChildren = filterChildren(children);
  const headerActions = options.actions ?? [];

  const cardChildren: UiChild[] = [];
  if (options.title !== undefined || headerActions.length > 0) {
    cardChildren.push(
      row({ gap: 1, items: "center", wrap: true }, [
        ...(options.title === undefined ? [] : [text(options.title, { variant: "heading" })]),
        ...(headerActions.length === 0 ? [] : [spacer({ flex: 1 }), ...headerActions]),
      ]),
    );
  }
  if (options.subtitle !== undefined) {
    cardChildren.push(text(options.subtitle, { dim: true }));
  }
  cardChildren.push(...bodyChildren);

  return box(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      preset: "card",
      border: options.border ?? "rounded",
      p: options.p ?? 1,
      ...(options.style === undefined ? {} : { style: options.style }),
    },
    [column({ gap: options.gap ?? 1 }, cardChildren)],
  );
}

export function toolbar(children: readonly UiChild[]): VNode;
export function toolbar(options: ToolbarOptions, children: readonly UiChild[]): VNode;
export function toolbar(
  optionsOrChildren: ToolbarOptions | readonly UiChild[],
  children: readonly UiChild[] = [],
): VNode {
  if (isUiChildren(optionsOrChildren)) {
    return row({ gap: 1, items: "center", wrap: true }, optionsOrChildren);
  }
  const options = optionsOrChildren;
  return row(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      gap: options.gap ?? 1,
      items: "center",
      wrap: true,
    },
    children,
  );
}

export function statusBar(options: StatusBarOptions): VNode {
  return row(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      width: "full",
      items: "center",
      ...(options.style === undefined ? {} : { style: options.style }),
    },
    [...(options.left ?? []), spacer({ flex: 1 }), ...(options.right ?? [])],
  );
}

export function header(options: HeaderOptions): VNode {
  return box(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      border: "rounded",
      px: 1,
      py: 0,
    },
    [
      row({ gap: 1, items: "center", wrap: true }, [
        text(options.title, { variant: "heading" }),
        options.subtitle ? text(options.subtitle, { dim: true }) : null,
        spacer({ flex: 1 }),
        ...(options.actions ?? []),
      ]),
    ],
  );
}

export function sidebar(options: SidebarOptions): VNode {
  const idPrefix = options.id ?? "sidebar";
  const buttonNodes = options.items.map((item) =>
    button({
      id: `${idPrefix}-${item.id}`,
      label: item.icon ? `${item.icon} ${item.label}` : item.label,
      onPress: () => {
        options.onSelect?.(item.id);
      },
      dsVariant: options.selected === item.id ? "soft" : "ghost",
      dsTone: options.selected === item.id ? "primary" : "default",
    }),
  );

  return box(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      border: "rounded",
      width: options.width ?? 25,
      p: 1,
    },
    [
      column({ gap: 1 }, [
        options.title ? text(options.title, { variant: "heading" }) : null,
        column({ gap: 0 }, buttonNodes),
      ]),
    ],
  );
}

export function masterDetail(options: MasterDetailOptions): VNode {
  return row(
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.key === undefined ? {} : { key: options.key }),
      gap: options.gap ?? 1,
      items: "stretch",
    },
    [
      box({ width: options.masterWidth ?? 30 }, [options.master]),
      box({ flex: 1 }, [options.detail]),
    ],
  );
}

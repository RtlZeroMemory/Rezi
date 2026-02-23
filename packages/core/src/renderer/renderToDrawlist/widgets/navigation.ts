import type { DrawlistBuilderV1 } from "../../../drawlist/types.js";
import type { LayoutTree } from "../../../layout/layout.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { Theme } from "../../../theme/theme.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../../ui/designTokens.js";
import {
  accordionRecipe,
  breadcrumbRecipe,
  paginationRecipe,
  tabsRecipe,
} from "../../../ui/recipes.js";
import { getAccordionHeadersZoneId } from "../../../widgets/accordion.js";
import { getBreadcrumbZoneId } from "../../../widgets/breadcrumb.js";
import { getPaginationZoneId } from "../../../widgets/pagination.js";
import { getTabsBarZoneId } from "../../../widgets/tabs.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import {
  getColorTokens,
  readWidgetSize,
  readWidgetTone,
  readWidgetVariant,
} from "../themeTokens.js";

type ClipRect = Readonly<Rect>;

type NavigationDsProps = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
}>;

function readString(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

function readNavigationDsProps(raw: unknown): NavigationDsProps {
  if (typeof raw !== "object" || raw === null) return {};
  const props = raw as {
    dsVariant?: unknown;
    dsTone?: unknown;
    dsSize?: unknown;
  };
  const variant = readWidgetVariant(props.dsVariant);
  const tone = readWidgetTone(props.dsTone);
  const size = readWidgetSize(props.dsSize);
  return {
    ...(variant !== undefined ? { variant } : {}),
    ...(tone !== undefined ? { tone } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

function hasNavigationDsProps(dsProps: NavigationDsProps): boolean {
  return dsProps.variant !== undefined || dsProps.tone !== undefined || dsProps.size !== undefined;
}

function findChildById(
  children: readonly RuntimeInstance[],
  expectedId: string,
): RuntimeInstance | undefined {
  for (const child of children) {
    if (!child) continue;
    const childId = readString((child.vnode.props as { id?: unknown } | undefined)?.id);
    if (childId === expectedId) return child;
  }
  return undefined;
}

function cloneWithNavigationDsProps(
  node: RuntimeInstance,
  dsProps: NavigationDsProps,
): RuntimeInstance {
  let nextVNode = node.vnode;
  let changed = false;

  if (node.vnode.kind === "button") {
    const prevProps = (node.vnode.props ?? {}) as {
      dsVariant?: WidgetVariant;
      dsTone?: WidgetTone;
      dsSize?: WidgetSize;
    };
    const nextProps = {
      ...prevProps,
      ...(dsProps.variant !== undefined ? { dsVariant: dsProps.variant } : {}),
      ...(dsProps.tone !== undefined ? { dsTone: dsProps.tone } : {}),
      ...(dsProps.size !== undefined ? { dsSize: dsProps.size } : {}),
    };

    if (
      nextProps.dsVariant !== prevProps.dsVariant ||
      nextProps.dsTone !== prevProps.dsTone ||
      nextProps.dsSize !== prevProps.dsSize
    ) {
      nextVNode = { ...node.vnode, props: nextProps } as typeof node.vnode;
      changed = true;
    }
  }

  let nextChildren: readonly RuntimeInstance[] = node.children;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!child) continue;
    const nextChild = cloneWithNavigationDsProps(child, dsProps);
    if (nextChild === child) continue;
    if (nextChildren === node.children) {
      nextChildren = node.children.slice();
    }
    (nextChildren as RuntimeInstance[])[i] = nextChild;
    changed = true;
  }

  if (!changed) return node;
  return { ...node, vnode: nextVNode, children: nextChildren };
}

function resolveNavigationControlZoneId(node: RuntimeInstance): string | undefined {
  const id = readString((node.vnode.props as { id?: unknown } | undefined)?.id);
  if (id === undefined) return undefined;

  switch (node.vnode.kind as RuntimeInstance["vnode"]["kind"]) {
    case "tabs": {
      return getTabsBarZoneId(id);
    }
    case "accordion": {
      return getAccordionHeadersZoneId(id);
    }
    case "breadcrumb": {
      return getBreadcrumbZoneId(id);
    }
    case "pagination": {
      return getPaginationZoneId(id);
    }
    default:
      return undefined;
  }
}

function buildNavigationControlOverrides(
  node: RuntimeInstance,
  dsProps: NavigationDsProps,
): ReadonlyMap<RuntimeInstance["instanceId"], RuntimeInstance> | null {
  if (!hasNavigationDsProps(dsProps)) return null;

  const controlZoneId = resolveNavigationControlZoneId(node);
  if (controlZoneId === undefined) return null;

  const controlZone = findChildById(node.children, controlZoneId);
  if (!controlZone) return null;

  const patchedZone = cloneWithNavigationDsProps(controlZone, dsProps);
  if (patchedZone === controlZone) return null;

  return new Map([[controlZone.instanceId, patchedZone]]);
}

function resolveNavigationRenderStyle(
  builder: DrawlistBuilderV1,
  rect: Rect,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  dsProps: NavigationDsProps,
  theme: Theme,
): ResolvedTextStyle {
  const colorTokens = getColorTokens(theme);
  if (colorTokens === null) return parentStyle;

  switch (node.vnode.kind) {
    case "tabs": {
      const styles = tabsRecipe(colorTokens, {
        variant: dsProps.variant ?? "soft",
        tone: dsProps.tone ?? "primary",
        size: dsProps.size ?? "md",
        state: "default",
      });
      if (styles.bg.bg !== undefined) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, { bg: styles.bg.bg });
      }
      return mergeTextStyle(parentStyle, styles.item);
    }
    case "accordion": {
      const styles = accordionRecipe(colorTokens, {
        variant: dsProps.variant ?? "soft",
        tone: dsProps.tone ?? "default",
        size: dsProps.size ?? "md",
        state: "default",
      });
      if (styles.bg.bg !== undefined) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, { bg: styles.bg.bg });
      }
      return mergeTextStyle(parentStyle, styles.header);
    }
    case "breadcrumb": {
      const styles = breadcrumbRecipe(colorTokens, {
        variant: dsProps.variant ?? "ghost",
        tone: dsProps.tone ?? "primary",
        size: dsProps.size ?? "md",
        state: "default",
      });
      if (styles.bg.bg !== undefined) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, { bg: styles.bg.bg });
      }
      return mergeTextStyle(parentStyle, styles.item);
    }
    case "pagination": {
      const styles = paginationRecipe(colorTokens, {
        variant: dsProps.variant ?? "soft",
        tone: dsProps.tone ?? "primary",
        size: dsProps.size ?? "md",
        state: "default",
      });
      if (styles.bg.bg !== undefined) {
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, { bg: styles.bg.bg });
      }
      return mergeTextStyle(parentStyle, styles.control);
    }
    default:
      return parentStyle;
  }
}

export function renderNavigationWidget(
  builder: DrawlistBuilderV1,
  rect: Rect,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (ClipRect | undefined)[],
  currentClip: ClipRect | undefined,
): void {
  if (!isVisibleRect(rect)) return;
  const dsProps = readNavigationDsProps(node.vnode.props);
  const resolvedParentStyle = resolveNavigationRenderStyle(
    builder,
    rect,
    parentStyle,
    node,
    dsProps,
    theme,
  );
  const navigationControlOverrides = buildNavigationControlOverrides(node, dsProps);

  const childCount = Math.min(node.children.length, layoutNode.children.length);
  for (let i = childCount - 1; i >= 0; i--) {
    const child = node.children[i];
    const childLayout = layoutNode.children[i];
    if (!child || !childLayout) continue;
    const renderedChild = navigationControlOverrides?.get(child.instanceId) ?? child;
    nodeStack.push(renderedChild);
    styleStack.push(resolvedParentStyle);
    layoutStack.push(childLayout);
    clipStack.push(currentClip);
  }
}

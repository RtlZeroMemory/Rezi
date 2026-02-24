import type { DrawlistBuilderV1 } from "../../../drawlist/types.js";
import type { LayoutTree } from "../../../layout/layout.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { TerminalProfile } from "../../../terminalProfile.js";
import type { Theme } from "../../../theme/theme.js";
import { kbdRecipe } from "../../../ui/recipes.js";
import type { TextStyle } from "../../../widgets/style.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle, shouldFillForStyleOverride } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import {
  getColorTokens,
  readWidgetSize,
  readWidgetTone,
  readWidgetVariant,
} from "../themeTokens.js";
import type { CursorInfo } from "../types.js";
import { renderCanvasWidgets } from "./renderCanvasWidgets.js";
import { renderChartWidgets } from "./renderChartWidgets.js";
import { renderFormWidgets } from "./renderFormWidgets.js";
import { renderIndicatorWidgets } from "./renderIndicatorWidgets.js";
import { renderTextWidgets } from "./renderTextWidgets.js";

export type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

function maybeFillOwnBackground(
  builder: DrawlistBuilderV1,
  rect: Rect,
  ownStyle: unknown,
  style: ResolvedTextStyle,
): void {
  if (shouldFillForStyleOverride(ownStyle as TextStyle | undefined)) {
    builder.fillRect(rect.x, rect.y, rect.w, rect.h, style);
  }
}

function readZLayer(v: unknown): -1 | 0 | 1 {
  if (v === -1 || v === 1) return v;
  return 0;
}

export function renderBasicWidget(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  pressedId: string | null,
  rect: Rect,
  theme: Theme,
  tick: number,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (Readonly<Rect> | undefined)[],
  currentClip: Readonly<Rect> | undefined,
  cursorInfo: CursorInfo | undefined,
  focusAnnouncement: string | null | undefined,
  terminalProfile: TerminalProfile | undefined,
): ResolvedCursor | null {
  const kind = node.vnode.kind;

  if (kind !== "spacer" && !isVisibleRect(rect)) {
    return null;
  }

  switch (kind) {
    case "text":
    case "richText":
    case "badge":
    case "tag":
    case "spinner":
    case "icon":
    case "kbd":
    case "status":
    case "link":
    case "focusAnnouncer": {
      let textParentStyle = parentStyle;
      if (kind === "kbd") {
        const colorTokens = getColorTokens(theme);
        if (colorTokens !== null) {
          const props = node.vnode.props as {
            dsVariant?: unknown;
            dsTone?: unknown;
            dsSize?: unknown;
          };
          const dsVariant = readWidgetVariant(props.dsVariant) ?? "outline";
          const dsTone = readWidgetTone(props.dsTone) ?? "default";
          const dsSize = readWidgetSize(props.dsSize) ?? "md";
          const recipeResult = kbdRecipe(colorTokens, {
            variant: dsVariant,
            tone: dsTone,
            size: dsSize,
          });
          if (recipeResult.bg.bg !== undefined) {
            builder.fillRect(
              rect.x,
              rect.y,
              rect.w,
              rect.h,
              mergeTextStyle(parentStyle, recipeResult.bg),
            );
          }
          textParentStyle = mergeTextStyle(textParentStyle, recipeResult.key);
        }
      }
      return (
        renderTextWidgets(
          builder,
          focusState,
          rect,
          theme,
          tick,
          textParentStyle,
          node,
          cursorInfo,
          focusAnnouncement,
          maybeFillOwnBackground,
        ) ?? null
      );
    }
    case "button":
    case "input":
    case "select":
    case "checkbox":
    case "radioGroup":
    case "slider":
    case "field": {
      return (
        renderFormWidgets(
          builder,
          focusState,
          pressedId,
          rect,
          theme,
          parentStyle,
          node,
          layoutNode,
          nodeStack,
          styleStack,
          layoutStack,
          clipStack,
          currentClip,
          cursorInfo,
          maybeFillOwnBackground,
        ) ?? null
      );
    }
    case "divider":
    case "progress":
    case "gauge":
    case "skeleton":
    case "spacer":
    case "empty":
    case "errorDisplay":
    case "callout": {
      renderIndicatorWidgets(builder, rect, theme, parentStyle, node, maybeFillOwnBackground);
      return null;
    }
    case "canvas":
    case "image": {
      renderCanvasWidgets(builder, rect, theme, parentStyle, node, terminalProfile, readZLayer);
      return null;
    }
    case "lineChart":
    case "scatter":
    case "heatmap":
    case "sparkline":
    case "barChart":
    case "miniChart": {
      renderChartWidgets(builder, rect, theme, parentStyle, node, maybeFillOwnBackground);
      return null;
    }
    default:
      return null;
  }
}

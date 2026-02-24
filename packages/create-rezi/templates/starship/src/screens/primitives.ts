import { ui, type TableProps, type VNode } from "@rezi-ui/core";
import { padLabel } from "../helpers/layout.js";
import { SPACE, toHex, type StarshipThemeTokens } from "../theme.js";

type PanelTone = "default" | "base" | "inset" | "muted" | "elevated" | "focused" | "danger";

type SurfacePanelOptions = Readonly<{
  tone?: PanelTone;
  p?: number;
  gap?: number;
  fill?: boolean;
}>;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function panelColors(tokens: StarshipThemeTokens, tone: PanelTone): Readonly<{
  background: StarshipThemeTokens["bg"]["panel"]["base"];
  border: StarshipThemeTokens["border"]["default"];
}> {
  if (tone === "inset" || tone === "muted") {
    return {
      background: tokens.bg.panel.inset,
      border: tokens.border.muted,
    };
  }
  if (tone === "elevated") {
    return {
      background: tokens.bg.panel.elevated,
      border: tokens.border.default,
    };
  }
  if (tone === "focused") {
    return {
      background: tokens.bg.panel.elevated,
      border: tokens.border.focus,
    };
  }
  if (tone === "danger") {
    return {
      background: tokens.bg.panel.elevated,
      border: tokens.border.danger,
    };
  }
  return {
    background: tokens.bg.panel.base,
    border: tokens.border.default,
  };
}

export function surfacePanel(
  tokens: StarshipThemeTokens,
  title: string,
  children: readonly VNode[],
  options?: SurfacePanelOptions,
): VNode {
  const tone = options?.tone ?? "default";
  const colors = panelColors(tokens, tone);
  const fill = options?.fill ?? true;
  return ui.box(
    {
      title,
      border: "rounded",
      p: options?.p ?? SPACE.sm,
      gap: options?.gap ?? SPACE.sm,
      ...(fill ? { width: "100%" } : {}),
      style: { bg: colors.background, fg: tokens.text.primary },
      borderStyle: { fg: colors.border, bg: colors.background },
      inheritStyle: { fg: tokens.text.primary },
    },
    children,
  );
}

export function sectionHeader(
  tokens: StarshipThemeTokens,
  title: string,
  subtitle?: string,
): VNode {
  return ui.column({ gap: SPACE.xs }, [
    ui.text(title, { variant: "heading" }),
    ...(subtitle
      ? [ui.text(subtitle, { variant: "caption", style: { fg: tokens.text.muted, dim: true } })]
      : []),
    ui.box({ border: "none", p: 0 }, [ui.divider({ color: toHex(tokens.border.muted) })]),
  ]);
}

export function progressRow(
  tokens: StarshipThemeTokens,
  label: string,
  value: number,
  options?: Readonly<{
    labelWidth?: number;
    width?: number;
    valueWidth?: number;
    tone?: "default" | "warning" | "danger" | "success";
    trend?: number;
  }>,
): VNode {
  const clamped = clamp(value, 0, 1);
  const pctWidth = options?.valueWidth ?? 4;
  const pct = `${Math.round(clamped * 100)}`.padStart(Math.max(3, pctWidth - 1), " ");
  const trend = options?.trend ?? 0;
  const trendGlyph = trend > 0 ? "▲" : trend < 0 ? "▼" : "·";
  const tone = options?.tone ?? "default";
  const fillColor =
    tone === "danger"
      ? tokens.accent.danger
      : tone === "warning"
        ? tokens.accent.warn
        : tone === "success"
          ? tokens.accent.success
          : tokens.progress.fill;

  return ui.row({ gap: SPACE.md, items: "center", wrap: false }, [
    ui.text(padLabel(label, options?.labelWidth ?? 14), {
      variant: "label",
      style: { fg: tokens.text.muted },
    }),
    ui.progress(clamped, {
      width: options?.width ?? 28,
      style: { fg: fillColor },
      trackStyle: { fg: tokens.progress.track },
    }),
    ui.text(`${pct}%`, { variant: "code", style: { fg: tokens.text.primary, bold: true } }),
    ui.text(trendGlyph, {
      variant: "caption",
      style:
        trend > 0
          ? { fg: tokens.accent.success, bold: true }
          : trend < 0
            ? { fg: tokens.accent.warn, bold: true }
            : { fg: tokens.text.dim, dim: true },
    }),
  ]);
}

export function tableSkin<T>(tokens: StarshipThemeTokens): Pick<
  TableProps<T>,
  "stripedRows" | "stripeStyle" | "selectionStyle" | "borderStyle"
> {
  return {
    stripedRows: true,
    stripeStyle: {
      even: tokens.bg.panel.base,
      odd: tokens.table.rowAltBg,
    },
    selectionStyle: {
      bg: tokens.table.rowSelectedBg,
      fg: tokens.state.selectedText,
      bold: true,
    },
    borderStyle: {
      variant: "rounded",
      color: tokens.border.muted,
    },
  };
}

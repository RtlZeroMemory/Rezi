import type { VNode } from "../../widgets/types.js";
import type { AppStateSelection } from "../instances.js";
import type { CommitDiagEntry, RuntimeInstance } from "./shared.js";

export const __commitDiag = {
  enabled: false,
  entries: [] as CommitDiagEntry[],
  reset(): void {
    this.entries.length = 0;
  },
  push(e: CommitDiagEntry): void {
    this.entries.push(e);
  },
};

function colorEqual(a: unknown, b: unknown): boolean {
  return a === b;
}

function textStyleEqual(
  a:
    | {
        bold?: boolean;
        dim?: boolean;
        italic?: boolean;
        underline?: boolean;
        inverse?: boolean;
        strikethrough?: boolean;
        overline?: boolean;
        blink?: boolean;
        fg?: unknown;
        bg?: unknown;
      }
    | undefined,
  b:
    | {
        bold?: boolean;
        dim?: boolean;
        italic?: boolean;
        underline?: boolean;
        inverse?: boolean;
        strikethrough?: boolean;
        overline?: boolean;
        blink?: boolean;
        fg?: unknown;
        bg?: unknown;
      }
    | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strikethrough === b.strikethrough &&
    a.overline === b.overline &&
    a.blink === b.blink &&
    colorEqual(a.fg, b.fg) &&
    colorEqual(a.bg, b.bg)
  );
}

export function leafVNodeEqual(a: VNode, b: VNode): boolean {
  switch (a.kind) {
    case "text": {
      if (b.kind !== "text") return false;
      if (a.text !== b.text) return false;
      if (a.props === b.props) return true;
      const ap = a.props as {
        id?: unknown;
        style?: unknown;
        textOverflow?: unknown;
        variant?: unknown;
        maxWidth?: unknown;
      };
      const bp = b.props as {
        id?: unknown;
        style?: unknown;
        textOverflow?: unknown;
        variant?: unknown;
        maxWidth?: unknown;
      };
      if (ap.id !== bp.id) return false;
      if (ap.textOverflow !== bp.textOverflow) return false;
      if (ap.variant !== bp.variant) return false;
      if (ap.maxWidth !== bp.maxWidth) return false;
      return textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      );
    }
    case "spacer": {
      if (b.kind !== "spacer") return false;
      const ap = a.props as { size?: number; flex?: number };
      const bp = b.props as { size?: number; flex?: number };
      return ap.size === bp.size && ap.flex === bp.flex;
    }
    case "divider": {
      if (b.kind !== "divider") return false;
      const ap = a.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      const bp = b.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      return (
        ap.direction === bp.direction &&
        ap.char === bp.char &&
        ap.label === bp.label &&
        ap.color === bp.color
      );
    }
    case "richText": {
      if (b.kind !== "richText") return false;
      const ap = a.props as { spans?: readonly { text: string; style?: unknown }[] };
      const bp = b.props as { spans?: readonly { text: string; style?: unknown }[] };
      const as = ap.spans;
      const bs = bp.spans;
      if (as === bs) return true;
      if (!as || !bs || as.length !== bs.length) return false;
      for (let i = 0; i < as.length; i++) {
        const sa = as[i];
        const sb = bs[i];
        if (!sa || !sb) return false;
        if (sa.text !== sb.text) return false;
        if (
          !textStyleEqual(
            sa.style as Parameters<typeof textStyleEqual>[0],
            sb.style as Parameters<typeof textStyleEqual>[0],
          )
        )
          return false;
      }
      return true;
    }
    default:
      return false;
  }
}

function boxShadowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ao = a as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  const bo = b as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  return ao.offsetX === bo.offsetX && ao.offsetY === bo.offsetY && ao.density === bo.density;
}

function transitionPropertiesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a === "all" || b === "all") return a === b;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function transitionSpecEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ao = a as { duration?: unknown; easing?: unknown; properties?: unknown };
  const bo = b as typeof ao;
  return (
    ao.duration === bo.duration &&
    ao.easing === bo.easing &&
    transitionPropertiesEqual(ao.properties, bo.properties)
  );
}

function layoutConstraintsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    width?: unknown;
    height?: unknown;
    minWidth?: unknown;
    maxWidth?: unknown;
    minHeight?: unknown;
    maxHeight?: unknown;
    flex?: unknown;
    aspectRatio?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.width === bo.width &&
    ao.height === bo.height &&
    ao.minWidth === bo.minWidth &&
    ao.maxWidth === bo.maxWidth &&
    ao.minHeight === bo.minHeight &&
    ao.maxHeight === bo.maxHeight &&
    ao.flex === bo.flex &&
    ao.aspectRatio === bo.aspectRatio
  );
}

function shallowRecordEqual(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in b)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export function compositePropsEqual(prev: unknown, next: unknown): boolean {
  if (Object.is(prev, next)) return true;
  if (typeof prev !== "object" || prev === null) return false;
  if (typeof next !== "object" || next === null) return false;
  return shallowRecordEqual(
    prev as Readonly<Record<string, unknown>>,
    next as Readonly<Record<string, unknown>>,
  );
}

export function evaluateAppStateSelections(
  selections: readonly AppStateSelection[],
  appState: unknown,
): { changed: boolean; threw: unknown | null } {
  for (const selection of selections) {
    try {
      const nextValue = selection.selector(appState);
      if (!Object.is(nextValue, selection.value)) {
        return { changed: true, threw: null };
      }
    } catch (e: unknown) {
      return { changed: true, threw: e };
    }
  }
  return { changed: false, threw: null };
}

function spacingPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.p === bo.p &&
    ao.px === bo.px &&
    ao.py === bo.py &&
    ao.pt === bo.pt &&
    ao.pb === bo.pb &&
    ao.pl === bo.pl &&
    ao.pr === bo.pr &&
    ao.m === bo.m &&
    ao.mx === bo.mx &&
    ao.my === bo.my &&
    ao.mt === bo.mt &&
    ao.mr === bo.mr &&
    ao.mb === bo.mb &&
    ao.ml === bo.ml
  );
}

function boxPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    title?: unknown;
    titleAlign?: unknown;
    pad?: unknown;
    border?: unknown;
    borderTop?: unknown;
    borderRight?: unknown;
    borderBottom?: unknown;
    borderLeft?: unknown;
    shadow?: unknown;
    style?: unknown;
    inheritStyle?: unknown;
    opacity?: unknown;
    transition?: unknown;
    exitTransition?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.title === bo.title &&
    ao.titleAlign === bo.titleAlign &&
    ao.pad === bo.pad &&
    ao.border === bo.border &&
    ao.borderTop === bo.borderTop &&
    ao.borderRight === bo.borderRight &&
    ao.borderBottom === bo.borderBottom &&
    ao.borderLeft === bo.borderLeft &&
    boxShadowEqual(ao.shadow, bo.shadow) &&
    textStyleEqual(
      ao.style as Parameters<typeof textStyleEqual>[0],
      bo.style as Parameters<typeof textStyleEqual>[0],
    ) &&
    textStyleEqual(
      ao.inheritStyle as Parameters<typeof textStyleEqual>[0],
      bo.inheritStyle as Parameters<typeof textStyleEqual>[0],
    ) &&
    ao.opacity === bo.opacity &&
    transitionSpecEqual(ao.transition, bo.transition) &&
    transitionSpecEqual(ao.exitTransition, bo.exitTransition) &&
    spacingPropsEqual(ao, bo) &&
    layoutConstraintsEqual(ao, bo)
  );
}

function stackPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    pad?: unknown;
    gap?: unknown;
    align?: unknown;
    justify?: unknown;
    items?: unknown;
    style?: unknown;
    inheritStyle?: unknown;
    transition?: unknown;
    exitTransition?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.pad === bo.pad &&
    ao.gap === bo.gap &&
    ao.align === bo.align &&
    ao.justify === bo.justify &&
    ao.items === bo.items &&
    textStyleEqual(
      ao.style as Parameters<typeof textStyleEqual>[0],
      bo.style as Parameters<typeof textStyleEqual>[0],
    ) &&
    textStyleEqual(
      ao.inheritStyle as Parameters<typeof textStyleEqual>[0],
      bo.inheritStyle as Parameters<typeof textStyleEqual>[0],
    ) &&
    transitionSpecEqual(ao.transition, bo.transition) &&
    transitionSpecEqual(ao.exitTransition, bo.exitTransition) &&
    spacingPropsEqual(ao, bo) &&
    layoutConstraintsEqual(ao, bo)
  );
}

function focusZonePropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    id?: unknown;
    tabIndex?: unknown;
    navigation?: unknown;
    columns?: unknown;
    wrapAround?: unknown;
    onEnter?: unknown;
    onExit?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.id === bo.id &&
    ao.tabIndex === bo.tabIndex &&
    ao.navigation === bo.navigation &&
    ao.columns === bo.columns &&
    ao.wrapAround === bo.wrapAround &&
    ao.onEnter === bo.onEnter &&
    ao.onExit === bo.onExit
  );
}

function focusTrapPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    id?: unknown;
    active?: unknown;
    returnFocusTo?: unknown;
    initialFocus?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.id === bo.id &&
    ao.active === bo.active &&
    ao.returnFocusTo === bo.returnFocusTo &&
    ao.initialFocus === bo.initialFocus
  );
}

function deepEqualUnknown(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualUnknown(a[i], b[i])) return false;
    }
    return true;
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false;
    if (!deepEqualUnknown(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

function themedPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    theme?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return deepEqualUnknown(ao.theme, bo.theme);
}

function fragmentPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as { key?: unknown };
  const bo = (b ?? {}) as typeof ao;
  return ao.key === bo.key;
}

export function canFastReuseContainerSelf(prev: VNode, next: VNode): boolean {
  if (prev.kind !== next.kind) return false;
  switch (prev.kind) {
    case "fragment":
      return fragmentPropsEqual(prev.props, (next as typeof prev).props);
    case "box":
      return boxPropsEqual(prev.props, (next as typeof prev).props);
    case "row":
    case "column":
      return stackPropsEqual(prev.props, (next as typeof prev).props);
    case "focusZone":
      return focusZonePropsEqual(prev.props, (next as typeof prev).props);
    case "focusTrap":
      return focusTrapPropsEqual(prev.props, (next as typeof prev).props);
    case "themed":
      return themedPropsEqual(prev.props, (next as typeof prev).props);
    default:
      return false;
  }
}

export function diagWhichPropFails(prev: VNode, next: VNode): string | undefined {
  if (prev.kind !== next.kind) return "kind";
  type ReuseDiagProps = {
    style?: unknown;
    inheritStyle?: unknown;
    key?: unknown;
    [key: string]: unknown;
  };
  const ap = (prev.props ?? {}) as ReuseDiagProps;
  const bp = (next.props ?? {}) as ReuseDiagProps;
  if (prev.kind === "fragment" && ap.key !== bp.key) {
    return "key";
  }
  if (prev.kind === "row" || prev.kind === "column") {
    for (const k of ["pad", "gap", "align", "justify", "items"] as const) {
      if (ap[k] !== bp[k]) return k;
    }
    if (
      !textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      )
    )
      return "style";
    if (
      !textStyleEqual(
        ap.inheritStyle as Parameters<typeof textStyleEqual>[0],
        bp.inheritStyle as Parameters<typeof textStyleEqual>[0],
      )
    )
      return "inheritStyle";
    for (const k of [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "flex",
      "aspectRatio",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
    for (const k of [
      "p",
      "px",
      "py",
      "pt",
      "pb",
      "pl",
      "pr",
      "m",
      "mx",
      "my",
      "mt",
      "mr",
      "mb",
      "ml",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
  }
  if (prev.kind === "box") {
    for (const k of [
      "title",
      "titleAlign",
      "pad",
      "border",
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
      "opacity",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
    if (
      !textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      )
    )
      return "style";
    for (const k of [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "flex",
      "aspectRatio",
    ] as const) {
      if (ap[k] !== bp[k]) return k;
    }
  }
  return "unknown";
}

export function runtimeChildrenChanged(
  prevChildren: readonly RuntimeInstance[],
  nextChildren: readonly RuntimeInstance[],
): boolean {
  if (prevChildren.length !== nextChildren.length) return true;
  for (let i = 0; i < prevChildren.length; i++) {
    if (prevChildren[i] !== nextChildren[i]) return true;
  }
  return false;
}

export function hasDirtyChild(children: readonly RuntimeInstance[]): boolean {
  for (const child of children) {
    if (child.dirty) return true;
  }
  return false;
}

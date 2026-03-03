/**
 * packages/core/src/widgets/inspectorOverlay.ts — Runtime inspector overlay widget.
 *
 * Why: Provides a focused, always-on-top diagnostics overlay that can be
 * toggled during development without coupling to app state shape.
 */

import type { RuntimeBreadcrumbSnapshot } from "../app/runtimeBreadcrumbs.js";
import { type TextStyle, rgb } from "./style.js";
import type { VNode } from "./types.js";
import { ui } from "./ui.js";

export type InspectorOverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type InspectorOverlayFrameTiming = Readonly<{
  damageRects?: number;
  damageCells?: number;
  drawlistBytes?: number;
  diffBytesEmitted?: number;
  usDrawlist?: number;
  usDiff?: number;
  usWrite?: number;
}>;

export type InspectorOverlayProps = Readonly<{
  snapshot: RuntimeBreadcrumbSnapshot | null;
  frameTiming?: InspectorOverlayFrameTiming | null;
  id?: string;
  zIndex?: number;
  width?: number;
  position?: InspectorOverlayPosition;
  title?: string;
  hotkeyHint?: string | null;
}>;

const PANEL_STYLE: TextStyle = Object.freeze({
  bg: rgb(14, 18, 24),
  fg: rgb(104, 156, 196),
});

const ROW_STYLE: TextStyle = Object.freeze({
  bg: rgb(14, 18, 24),
  fg: rgb(214, 224, 236),
});

function summarize(value: string | null): string {
  if (!value || value.length === 0) return "<none>";
  if (value.length <= 40) return value;
  return `${value.slice(0, 37)}...`;
}

function fmtMaybeInt(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return String(Math.max(0, Math.trunc(value)));
}

function fmtMaybeNumber(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  const n = Object.is(value, -0) ? 0 : value;
  const i = Math.trunc(n);
  if (i === n) return String(i);
  return n.toFixed(2);
}

function fmtBool(value: boolean): string {
  return value ? "yes" : "no";
}

function buildCursorSummary(snapshot: RuntimeBreadcrumbSnapshot | null): string {
  if (!snapshot || !snapshot.cursor) return "cursor: n/a";
  if (!snapshot.cursor.visible) {
    return `cursor: hidden shape=${String(snapshot.cursor.shape)} blink=${fmtBool(snapshot.cursor.blink)}`;
  }
  return `cursor: (${String(snapshot.cursor.x)},${String(snapshot.cursor.y)}) shape=${String(snapshot.cursor.shape)} blink=${fmtBool(snapshot.cursor.blink)}`;
}

function buildRows(props: InspectorOverlayProps): readonly string[] {
  const snapshot = props.snapshot;
  const frameTiming = props.frameTiming ?? null;

  const focusId = summarize(snapshot?.focus.focusedId ?? null);
  const zoneId = summarize(snapshot?.focus.activeZoneId ?? null);
  const trapId = summarize(snapshot?.focus.activeTrapId ?? null);
  const focusAnnouncement = summarize(snapshot?.focus.announcement ?? null);

  const damageMode = snapshot?.damage.mode ?? "none";
  const damageRects = frameTiming?.damageRects ?? snapshot?.damage.rectCount;
  const damageCells = frameTiming?.damageCells ?? snapshot?.damage.area;

  const frameTick = snapshot?.frame.tick ?? 0;
  const frameCommit = snapshot?.frame.commit ?? false;
  const frameLayout = snapshot?.frame.layout ?? false;
  const frameIncremental = snapshot?.frame.incremental ?? false;
  const renderMs = snapshot?.frame.renderTimeMs ?? 0;

  const eventKind = snapshot?.event.kind ?? "<none>";
  const eventPath = snapshot?.event.path ?? "<none>";
  const lastAction = snapshot?.lastAction
    ? `${summarize(snapshot.lastAction.id)}.${String(snapshot.lastAction.action)}`
    : "<none>";

  const rows: string[] = [];
  rows.push("inspector overlay");
  rows.push(`focus: id=${focusId} zone=${zoneId} trap=${trapId}`);
  rows.push(`focus_announcement: ${focusAnnouncement}`);
  rows.push(buildCursorSummary(snapshot));
  rows.push(
    `damage: mode=${damageMode} rects=${fmtMaybeInt(damageRects)} cells=${fmtMaybeInt(damageCells)}`,
  );
  rows.push(
    `frame: tick=${String(frameTick)} commit=${fmtBool(frameCommit)} layout=${fmtBool(frameLayout)} incremental=${fmtBool(frameIncremental)} render_ms=${renderMs.toFixed(2)}`,
  );
  rows.push(
    `bytes: drawlist=${fmtMaybeInt(frameTiming?.drawlistBytes)} diff=${fmtMaybeInt(frameTiming?.diffBytesEmitted)}`,
  );
  rows.push(
    `timing_us: drawlist=${fmtMaybeInt(frameTiming?.usDrawlist)} diff=${fmtMaybeInt(frameTiming?.usDiff)} write=${fmtMaybeInt(frameTiming?.usWrite)}`,
  );
  rows.push(`event: kind=${eventKind} path=${eventPath}`);
  rows.push(`action: ${lastAction}`);

  const constraints = snapshot?.constraints ?? null;
  if (!constraints || !constraints.enabled) {
    rows.push("constraints: disabled");
  } else {
    const cacheKey = summarize(constraints.cacheKey ?? null);
    rows.push(
      `constraints: nodes=${String(constraints.nodeCount)} hidden=${String(constraints.hiddenInstanceCount)} resolve=${constraints.resolution.kind} cacheKey=${cacheKey}`,
    );
    const focused = constraints.focused;
    if (focused && focused.id.length > 0) {
      const resolved = focused.resolved;
      rows.push(
        `constraints_focus: id=${summarize(focused.id)} instances=${String(focused.instanceCount)} display=${fmtMaybeNumber(resolved?.display)} w=${fmtMaybeNumber(resolved?.width)} h=${fmtMaybeNumber(resolved?.height)} minW=${fmtMaybeNumber(resolved?.minWidth)} minH=${fmtMaybeNumber(resolved?.minHeight)}`,
      );
      const exprs = focused.expressions ?? null;
      if (exprs && exprs.length > 0) {
        const shown = exprs.slice(0, 2);
        rows.push(
          `constraints_exprs: ${shown.map((e) => `${String(e.prop)}=${summarize(e.source)}`).join(" | ")}`,
        );
        if (exprs.length > shown.length) {
          rows.push(`constraints_exprs_more: +${String(exprs.length - shown.length)}`);
        }
      }
    }
  }

  if (props.hotkeyHint && props.hotkeyHint.length > 0) {
    rows.push(`toggle: ${props.hotkeyHint}`);
  }

  return Object.freeze(rows);
}

function placePanel(position: InspectorOverlayPosition, panel: VNode): VNode {
  const h: "start" | "center" | "end" = position.endsWith("right")
    ? "end"
    : position.endsWith("left")
      ? "start"
      : "center";
  const v: "start" | "end" = position.startsWith("bottom") ? "end" : "start";
  return ui.column(
    {
      width: "full",
      height: "full",
      justify: v,
      p: 1,
    },
    [ui.row({ width: "full", justify: h }, [panel])],
  );
}

/**
 * Create an inspector overlay widget VNode.
 */
export function inspectorOverlay(props: InspectorOverlayProps): VNode {
  const title = props.title ?? "Inspector";
  const rows = buildRows(props);
  const width = typeof props.width === "number" && props.width > 0 ? Math.trunc(props.width) : 76;
  const position = props.position ?? "top-right";
  const panelId = props.id ?? "rezi.inspector.overlay";

  const panel = ui.box(
    {
      border: "single",
      title,
      style: PANEL_STYLE,
      width,
      p: 1,
    },
    [
      ui.column(
        { gap: 0 },
        rows.map((line) => ui.text(line, { style: ROW_STYLE })),
      ),
    ],
  );

  return ui.layer({
    id: panelId,
    zIndex: props.zIndex ?? 2000000000,
    backdrop: "none",
    modal: false,
    closeOnEscape: false,
    content: placePanel(position, panel),
  });
}

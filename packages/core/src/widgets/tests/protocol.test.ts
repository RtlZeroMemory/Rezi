import { assert, describe, test } from "@rezi-ui/testkit";
import { WIDGET_PROTOCOL, getWidgetProtocol } from "../protocol.js";
import type { VNode } from "../types.js";

const VNODE_KIND_COVERAGE: Record<VNode["kind"], true> = {
  text: true,
  richText: true,
  kbd: true,
  badge: true,
  status: true,
  tag: true,
  gauge: true,
  empty: true,
  errorDisplay: true,
  errorBoundary: true,
  callout: true,
  sparkline: true,
  barChart: true,
  miniChart: true,
  link: true,
  canvas: true,
  image: true,
  lineChart: true,
  scatter: true,
  heatmap: true,
  button: true,
  input: true,
  focusAnnouncer: true,
  slider: true,
  focusZone: true,
  focusTrap: true,
  virtualList: true,
  layers: true,
  modal: true,
  dropdown: true,
  layer: true,
  table: true,
  tree: true,
  field: true,
  select: true,
  checkbox: true,
  radioGroup: true,
  tabs: true,
  accordion: true,
  breadcrumb: true,
  pagination: true,
  commandPalette: true,
  filePicker: true,
  fileTreeExplorer: true,
  splitPane: true,
  panelGroup: true,
  resizablePanel: true,
  codeEditor: true,
  diffViewer: true,
  toolApprovalDialog: true,
  logsConsole: true,
  toastContainer: true,
  box: true,
  row: true,
  column: true,
  spacer: true,
  divider: true,
  icon: true,
  spinner: true,
  progress: true,
  skeleton: true,
  grid: true,
};

const ALL_VNODE_KINDS = Object.keys(VNODE_KIND_COVERAGE) as readonly VNode["kind"][];

describe("WIDGET_PROTOCOL", () => {
  test("has an entry for every VNode kind", () => {
    for (const kind of ALL_VNODE_KINDS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(WIDGET_PROTOCOL, kind),
        true,
        `missing protocol entry for kind=${kind}`,
      );
    }
  });

  test("button is requiresId + focusable + pressable + disableable", () => {
    const proto = getWidgetProtocol("button");
    assert.equal(proto.requiresId, true);
    assert.equal(proto.focusable, true);
    assert.equal(proto.pressable, true);
    assert.equal(proto.disableable, true);
  });

  test("link is focusable + pressable + disableable with optional id", () => {
    const proto = getWidgetProtocol("link");
    assert.equal(proto.requiresId, false);
    assert.equal(proto.focusable, true);
    assert.equal(proto.pressable, true);
    assert.equal(proto.disableable, true);
  });

  test("text is not requiresId and not focusable", () => {
    const proto = getWidgetProtocol("text");
    assert.equal(proto.requiresId, false);
    assert.equal(proto.focusable, false);
  });

  test("modal requires id but is not focusable", () => {
    const proto = getWidgetProtocol("modal");
    assert.equal(proto.requiresId, true);
    assert.equal(proto.focusable, false);
  });

  test("commandPalette is open-gated", () => {
    const proto = getWidgetProtocol("commandPalette");
    assert.equal(proto.openGated, true);
  });

  test("input does not require routing rebuild", () => {
    const proto = getWidgetProtocol("input");
    assert.equal(proto.requiresRoutingRebuild, false);
  });

  test("unknown kinds return display-only defaults", () => {
    const proto = getWidgetProtocol("__unknown_kind__");
    assert.deepEqual(proto, {
      requiresId: false,
      focusable: false,
      pressable: false,
      disableable: false,
      openGated: false,
      requiresRoutingRebuild: false,
    });
  });
});

import { assert, describe, test } from "@rezi-ui/testkit";
import { EventEmitter } from "node:events";
import type {
  AppProps,
  BoxProps,
  CursorPosition,
  DOMElement,
  Instance,
  Key,
  KittyFlagName,
  KittyKeyboardOptions,
  RenderOptions,
  StaticProps,
  StderrProps,
  StdinProps,
  StdoutProps,
  TextProps,
  TransformProps,
} from "../index.js";

describe("type parity", () => {
  test("compiles Ink-like public types", () => {
    // Runtime assertion is intentionally trivial; the value of this file is the
    // compile-time coverage for TS surface parity.
    assert.ok(true);
  });
});

// ── RenderOptions ────────────────────────────────────────────────────

const _renderOptionsOk: RenderOptions = {
  stdout: process.stdout,
  stdin: process.stdin,
  stderr: process.stderr,
  debug: false,
  exitOnCtrlC: true,
  patchConsole: true,
  onRender: (metrics) => {
    void metrics.renderTime;
  },
  isScreenReaderEnabled: false,
  maxFps: 30,
  incrementalRendering: false,
  concurrent: false,
  kittyKeyboard: { mode: "auto" },
};

// @ts-expect-error Ink RenderOptions doesn't accept random fields.
const _renderOptionsNoExtras: RenderOptions = { foo: 1 };

// ── Instance ─────────────────────────────────────────────────────────

const _instance: Instance = {
  rerender() {},
  unmount() {},
  async waitUntilExit() {},
  cleanup() {},
  clear() {},
};
_instance.rerender(null);
_instance.unmount();
_instance.unmount(new Error("x"));
_instance.unmount(1);
_instance.unmount(null);
void _instance.waitUntilExit();
_instance.cleanup();
_instance.clear();

// ── Key ──────────────────────────────────────────────────────────────

const _keyOk: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
  eventType: "press",
};
void _keyOk;

// ── TransformProps ───────────────────────────────────────────────────

const _transformPropsOk: TransformProps = {
  accessibilityLabel: "x",
  transform: (children) => children,
  children: null,
};
void _transformPropsOk;

// ── Context prop types ───────────────────────────────────────────────

const _appPropsOk: AppProps = { exit() {} };
void _appPropsOk;

const _stdinProps: StdinProps = {
  stdin: process.stdin,
  setRawMode() {},
  isRawModeSupported: true,
  internal_exitOnCtrlC: true,
  internal_eventEmitter: new EventEmitter(),
};
void _stdinProps.internal_exitOnCtrlC;
void _stdinProps.internal_eventEmitter;

const _stdoutProps: StdoutProps = { stdout: process.stdout, write() {} };
_stdoutProps.write("x");

const _stderrProps: StderrProps = { stderr: process.stderr, write() {} };
_stderrProps.write("x");

// ── Component prop types ─────────────────────────────────────────────

const _boxPropsOk: BoxProps = { borderStyle: "round", overflow: "hidden" };
void _boxPropsOk;

// @ts-expect-error Ink's borderStyle doesn't accept arbitrary strings.
const _boxPropsBorderStyleInvalid: BoxProps = { borderStyle: "dashed" };
void _boxPropsBorderStyleInvalid;

const _textPropsOk: TextProps = { wrap: "truncate-middle", children: "x" };
void _textPropsOk;

const _staticPropsOk: StaticProps<string> = {
  items: ["a"],
  children: (item) => item,
};
void _staticPropsOk;

// ── DOMElement ───────────────────────────────────────────────────────

const _dom: DOMElement = {
  nodeName: "ink-box",
  attributes: {},
  childNodes: [],
  parentNode: undefined,
  style: {},
};
void _dom.nodeName;
void _dom.attributes;
void _dom.childNodes;
void _dom.yogaNode;
void _dom.internal_transform;
void _dom.internal_accessibility;

// ── CursorPosition ───────────────────────────────────────────────────

const _cursor: CursorPosition = { x: 0, y: 0 };
void _cursor;

// ── Kitty types ──────────────────────────────────────────────────────

const _kittyOptsOk: KittyKeyboardOptions = {
  mode: "enabled",
  flags: ["reportEventTypes"],
};
void _kittyOptsOk;

const _kittyFlagOk: KittyFlagName = "disambiguateEscapeCodes";
void _kittyFlagOk;

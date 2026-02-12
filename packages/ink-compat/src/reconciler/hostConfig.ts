import React from "react";
import createReconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants.js";
import { InkCompatError } from "../errors.js";
import { convertRoot } from "./convert.js";
import {
  type HostContext,
  type HostElement,
  type HostNode,
  type HostRoot,
  type HostText,
  type HostType,
  allocateNodeId,
  appendChildNode,
  insertBeforeNode,
  removeChildNode,
} from "./types.js";
import type { DOMNodeAttribute, Styles } from "../types.js";

type Props = Record<string, unknown>;
type Instance = HostElement;
type TextInstance = HostText;
type SuspenseInstance = never;
type HydratableInstance = never;
type FormInstance = never;
type PublicInstance = HostNode;
type ChildSet = never;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type NoTimeout = -1;
type TransitionStatus = unknown;

let currentUpdatePriority = DefaultEventPriority;
const NotPendingTransition = null;
const HostTransitionContext = React.createContext<unknown>(NotPendingTransition);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickAttributes(props: Record<string, unknown>): Record<string, DOMNodeAttribute> {
  const out: Record<string, DOMNodeAttribute> = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" ||
      key === "style" ||
      key === "internal_transform" ||
      key === "internal_static" ||
      key === "internal_accessibility"
    ) {
      continue;
    }

    if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }
  return out;
}

const hostConfig = {
  rendererVersion: "0.1.0",
  rendererPackageName: "@rezi-ui/ink-compat",
  extraDevToolsConfig: null,

  // -------------------
  //        Modes
  // -------------------
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  // -------------------
  //    Host Context
  // -------------------
  getRootHostContext: () => ({ isInsideText: false }),
  getChildHostContext(parentHostContext: HostContext, type: HostType) {
    const prev = parentHostContext.isInsideText;
    const next = type === "ink-text" || type === "ink-virtual-text";
    if (prev === next) return parentHostContext;
    return { isInsideText: next };
  },

  // -------------------
  //   Instance Create
  // -------------------
  createInstance(
    originalType: HostType,
    newProps: Props,
    root: HostRoot,
    hostContext: HostContext,
  ) {
    if (hostContext.isInsideText && (originalType === "ink-box" || originalType === "ink-spacer")) {
      throw new InkCompatError(
        "INK_COMPAT_INVALID_PROPS",
        "<Box> can’t be nested inside <Text> component",
      );
    }

    const type: HostType =
      originalType === "ink-text" && hostContext.isInsideText ? "ink-virtual-text" : originalType;

    const { children: _children, ...rest } = newProps;
    const props = { ...rest };
    const children: HostNode[] = [];

    const styleValue = props["style"];
    const internalTransformValue = props["internal_transform"];
    const internalAccessibilityValue = props["internal_accessibility"];
    const internalStaticValue = props["internal_static"];

    const internal_transform =
      typeof internalTransformValue === "function" ? (internalTransformValue as never) : undefined;
    const internal_static = internalStaticValue === true ? true : undefined;
    const internal_accessibility = isPlainObject(internalAccessibilityValue)
      ? (internalAccessibilityValue as never)
      : {};

    const element: HostElement = {
      kind: "element",
      type,
      nodeName: type,
      props,
      attributes: pickAttributes(props),
      children,
      childNodes: children,
      internal_id: allocateNodeId(root),
      style: (isPlainObject(styleValue) ? (styleValue as Styles) : {}) as Styles,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      internal_accessibility,
    };

    if (internal_transform) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      element.internal_transform = internal_transform;
    }
    if (internal_static) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      element.internal_static = true;
    }

    return element;
  },

  createTextInstance(text: string, _root: HostRoot, hostContext: HostContext) {
    if (!hostContext.isInsideText) {
      throw new InkCompatError(
        "INK_COMPAT_INVALID_PROPS",
        `Text string "${text}" must be rendered inside <Text> component`,
      );
    }
    return { kind: "text", text, nodeName: "#text", nodeValue: text, style: {} };
  },

  // -------------------
  //   Child Mutation
  // -------------------
  appendInitialChild: appendChildNode,
  appendChild: appendChildNode,
  insertBefore: insertBeforeNode,
  removeChild: removeChildNode,

  appendChildToContainer: appendChildNode,
  insertInContainerBefore: insertBeforeNode,
  removeChildFromContainer: removeChildNode,

  // -------------------
  //   Updates
  // -------------------
  prepareUpdate(_instance: Instance, _type: HostType, _oldProps: Props, _newProps: Props) {
    return null;
  },
  commitUpdate(instance: Instance, _type: HostType, _oldProps: Props, newProps: Props) {
    const { children: _children, ...rest } = newProps;
    const props = { ...rest };
    instance.props = props;
    instance.attributes = pickAttributes(props);

    const styleValue = props["style"];
    const internalTransformValue = props["internal_transform"];
    const internalAccessibilityValue = props["internal_accessibility"];
    const internalStaticValue = props["internal_static"];

    instance.style = (isPlainObject(styleValue) ? (styleValue as Styles) : {}) as Styles;

    if (typeof internalTransformValue === "function") {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      instance.internal_transform = internalTransformValue as never;
    } else {
      Reflect.deleteProperty(instance, "internal_transform");
    }

    if (internalStaticValue === true) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      instance.internal_static = true;
    } else {
      Reflect.deleteProperty(instance, "internal_static");
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    instance.internal_accessibility = isPlainObject(internalAccessibilityValue)
      ? (internalAccessibilityValue as never)
      : instance.internal_accessibility ?? {};
  },
  commitTextUpdate(textInstance: TextInstance, _oldText: string, newText: string) {
    textInstance.text = newText;
    textInstance.nodeValue = newText;
  },

  // -------------------
  //   Visibility (unused)
  // -------------------
  hideInstance() {},
  unhideInstance() {},
  hideTextInstance(textInstance: TextInstance) {
    textInstance.text = "";
    textInstance.nodeValue = "";
  },
  unhideTextInstance(textInstance: TextInstance, text: string) {
    textInstance.text = text;
    textInstance.nodeValue = text;
  },

  // -------------------
  //   Commit Hooks
  // -------------------
  prepareForCommit: () => null,
  resetAfterCommit(root: HostRoot) {
    root.onCommit(convertRoot(root));
  },
  preparePortalMount: () => {},

  // -------------------
  //   Misc
  // -------------------
  shouldSetTextContent: () => false,
  resetTextContent() {},
  clearContainer: () => false,
  finalizeInitialChildren: () => false,

  getPublicInstance: (instance: PublicInstance) => instance,
  isPrimaryRenderer: true,

  // -------------------
  //   Scheduling
  // -------------------
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  getCurrentEventPriority: () => DefaultEventPriority,
  setCurrentUpdatePriority(priority: number) {
    currentUpdatePriority = priority;
  },
  getCurrentUpdatePriority() {
    return currentUpdatePriority;
  },
  resolveUpdatePriority() {
    return currentUpdatePriority;
  },
  shouldAttemptEagerTransition: () => false,

  // Transition/suspense hooks added in newer react-reconciler versions.
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  suspendOnActiveViewTransition: () => {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition,
  HostTransitionContext,
  resetFormInstance: () => {},
  bindToConsole<T extends (...args: unknown[]) => unknown>(fn: T) {
    return fn;
  },

  requestPostPaintCallback: (callback: (time: number) => void) => {
    queueMicrotask(() => callback(Date.now()));
  },
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => Date.now(),

  // The following methods are required by the host config typings but are not used
  // for this renderer. Keep them as no-ops.
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  detachDeletedInstance() {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate() {},
  getInstanceFromScope: () => null,
};

const reconciler = createReconciler<
  HostType,
  Props,
  HostRoot,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  FormInstance,
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  TransitionStatus
>(hostConfig as never);

export default reconciler;

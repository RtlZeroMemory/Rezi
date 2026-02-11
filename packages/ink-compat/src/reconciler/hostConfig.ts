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
    if (hostContext.isInsideText && originalType === "ink-box") {
      throw new InkCompatError("INK_COMPAT_INVALID_PROPS", "<Box> can't be nested inside <Text>");
    }

    const type: HostType =
      originalType === "ink-text" && hostContext.isInsideText ? "ink-virtual-text" : originalType;

    const props = { ...newProps };
    const children: HostNode[] = [];
    return {
      kind: "element",
      type,
      nodeName: type,
      props,
      attributes: props,
      children,
      childNodes: children,
      internal_id: allocateNodeId(root),
    };
  },

  createTextInstance(text: string, _root: HostRoot, hostContext: HostContext) {
    if (!hostContext.isInsideText) {
      throw new InkCompatError(
        "INK_COMPAT_INVALID_PROPS",
        `Text string "${text}" must be rendered inside <Text> component`,
      );
    }
    return { kind: "text", text, nodeName: "#text", nodeValue: text };
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
    const props = { ...newProps };
    instance.props = props;
    instance.attributes = props;
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

import createReconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants.js";
import { InkCompatError } from "../errors.js";
import { convertRoot } from "./convert.js";
import {
  allocateNodeId,
  type HostContext,
  type HostElement,
  type HostNode,
  type HostRoot,
  type HostText,
  type HostType,
  appendChildNode,
  insertBeforeNode,
  removeChildNode,
} from "./types.js";

type Props = Record<string, unknown>;
type Instance = HostElement;
type TextInstance = HostText;
type SuspenseInstance = never;
type HydratableInstance = never;
type PublicInstance = HostNode;
type UpdatePayload = Props;
type ChildSet = never;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type NoTimeout = -1;

const reconciler = createReconciler<
  HostType,
  Props,
  HostRoot,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  PublicInstance,
  HostContext,
  UpdatePayload,
  ChildSet,
  TimeoutHandle,
  NoTimeout
>({
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
  getChildHostContext(parentHostContext, type) {
    const prev = parentHostContext.isInsideText;
    const next = type === "ink-text" || type === "ink-virtual-text";
    if (prev === next) return parentHostContext;
    return { isInsideText: next };
  },

  // -------------------
  //   Instance Create
  // -------------------
  createInstance(originalType, newProps, root, hostContext) {
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

  createTextInstance(text, _root, hostContext) {
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
  prepareUpdate(_instance, _type, _oldProps, newProps) {
    return newProps;
  },
  commitUpdate(instance, updatePayload) {
    const props = { ...updatePayload };
    instance.props = props;
    instance.attributes = props;
  },
  commitTextUpdate(textInstance, _oldText, newText) {
    textInstance.text = newText;
    textInstance.nodeValue = newText;
  },

  // -------------------
  //   Visibility (unused)
  // -------------------
  hideInstance() {},
  unhideInstance() {},
  hideTextInstance(textInstance) {
    textInstance.text = "";
    textInstance.nodeValue = "";
  },
  unhideTextInstance(textInstance, text) {
    textInstance.text = text;
    textInstance.nodeValue = text;
  },

  // -------------------
  //   Commit Hooks
  // -------------------
  prepareForCommit: () => null,
  resetAfterCommit(root) {
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

  getPublicInstance: (instance) => instance,
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

  // The following methods are required by the host config typings but are not used
  // for this renderer. Keep them as no-ops.
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  detachDeletedInstance() {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate() {},
  getInstanceFromScope: () => null,
});

export default reconciler;

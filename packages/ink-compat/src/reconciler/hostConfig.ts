import { DefaultEventPriority } from "react-reconciler/constants.js";

import {
  type InkHostContainer,
  type InkHostNode,
  type InkNodeType,
  appendChild,
  createHostNode,
  insertBefore,
  removeChild,
} from "./types.js";

function mapNodeType(type: string): InkNodeType {
  if (type === "ink-box" || type === "ink-text" || type === "ink-root" || type === "ink-virtual") {
    return type;
  }
  return "ink-box";
}

function sanitizeProps(props: unknown): Record<string, unknown> {
  if (typeof props !== "object" || props === null) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    out[key] = value;
  }
  return out;
}

const HOST_CONTEXT = Object.freeze({ kind: "ink-host-context" });

export const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  createInstance(type: string, props: unknown): InkHostNode {
    return createHostNode(mapNodeType(type), sanitizeProps(props));
  },

  createTextInstance(text: string): InkHostNode {
    const node = createHostNode("ink-text", {});
    node.textContent = text;
    return node;
  },

  appendInitialChild(parent: InkHostNode, child: InkHostNode): void {
    appendChild(parent, child);
  },

  appendChild(parent: InkHostNode, child: InkHostNode): void {
    appendChild(parent, child);
  },

  appendChildToContainer(container: InkHostContainer, child: InkHostNode): void {
    appendChild(container, child);
  },

  removeChild(parent: InkHostNode, child: InkHostNode): void {
    removeChild(parent, child);
  },

  removeChildFromContainer(container: InkHostContainer, child: InkHostNode): void {
    removeChild(container, child);
  },

  insertBefore(parent: InkHostNode, child: InkHostNode, before: InkHostNode): void {
    insertBefore(parent, child, before);
  },

  insertInContainerBefore(
    container: InkHostContainer,
    child: InkHostNode,
    before: InkHostNode,
  ): void {
    insertBefore(container, child, before);
  },

  commitUpdate(
    instance: InkHostNode,
    updatePayloadOrType: unknown,
    typeOrOldProps: unknown,
    oldPropsOrNewProps: unknown,
    maybeNewProps?: unknown,
    _internalHandle?: unknown,
  ): void {
    // Support both legacy (instance, type, oldProps, newProps[, handle]) and
    // React 19 mutation signatures (instance, updatePayload, type, oldProps, newProps, handle).
    if (typeof updatePayloadOrType === "string") {
      instance.props = sanitizeProps(oldPropsOrNewProps);
      return;
    }

    if (!updatePayloadOrType) return;
    if (typeof typeOrOldProps !== "string") return;
    instance.props = sanitizeProps(maybeNewProps);
  },

  commitTextUpdate(instance: InkHostNode, _oldText: string, newText: string): void {
    instance.textContent = newText;
  },

  getPublicInstance(instance: InkHostNode): InkHostNode {
    return instance;
  },

  prepareUpdate(
    _instance: InkHostNode,
    _type: string,
    oldProps: unknown,
    newProps: unknown,
    _rootContainer?: InkHostContainer,
    _hostContext?: unknown,
  ): boolean {
    if (oldProps === newProps) return false;
    if (typeof oldProps !== "object" || oldProps === null) return true;
    if (typeof newProps !== "object" || newProps === null) return true;

    const oldObj = oldProps as Record<string, unknown>;
    const newObj = newProps as Record<string, unknown>;
    const oldKeys = Object.keys(oldObj).filter(
      (key) => key !== "children" && key !== "key" && key !== "ref",
    );
    const newKeys = Object.keys(newObj).filter(
      (key) => key !== "children" && key !== "key" && key !== "ref",
    );

    if (oldKeys.length !== newKeys.length) return true;
    for (const key of newKeys) {
      if (oldObj[key] !== newObj[key]) {
        return true;
      }
    }

    return false;
  },

  shouldSetTextContent(): boolean {
    return false;
  },

  getRootHostContext() {
    return HOST_CONTEXT;
  },

  getChildHostContext() {
    return HOST_CONTEXT;
  },

  prepareForCommit(): null {
    return null;
  },

  resetAfterCommit(container: InkHostContainer): void {
    container.onCommit?.();
  },

  clearContainer(container: InkHostContainer): boolean {
    for (const child of container.children) {
      child.parent = null;
    }
    container.children = [];
    return false;
  },

  finalizeInitialChildren(): boolean {
    return false;
  },

  resetTextContent(): void {},
  hideInstance(): void {},
  hideTextInstance(): void {},
  unhideInstance(): void {},
  unhideTextInstance(): void {},

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  getCurrentEventPriority(): number {
    return DefaultEventPriority;
  },

  getInstanceFromNode(): null {
    return null;
  },

  prepareScopeUpdate(): void {},

  getInstanceFromScope(): null {
    return null;
  },

  beforeActiveInstanceBlur(): void {},
  afterActiveInstanceBlur(): void {},
  detachDeletedInstance(): void {},

  maybePrepareUpdate: null,
  NotPendingTransition: null,
  HostTransitionContext: null,

  setCurrentUpdatePriority(): void {},

  getCurrentUpdatePriority(): number {
    return DefaultEventPriority;
  },

  resolveUpdatePriority(): number {
    return DefaultEventPriority;
  },

  resetFormInstance(): void {},
  requestPostPaintCallback(): void {},

  shouldAttemptEagerTransition(): boolean {
    return false;
  },

  trackSchedulerEvent(): void {},

  resolveEventType(): null {
    return null;
  },

  resolveEventTimeStamp(): number {
    return 0;
  },

  maySuspendCommit(): boolean {
    return false;
  },

  preloadInstance(): boolean {
    return true;
  },

  startSuspendingCommit(): void {},
  suspendInstance(): void {},
  waitForCommitToBeReady: null,
} as const;

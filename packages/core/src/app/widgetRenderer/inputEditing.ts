import type { ZrevEvent } from "../../events.js";
import { ZR_MOD_CTRL, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import {
  type InputEditorSnapshot,
  type InputSelection,
  type InputUndoStack,
  InputUndoStack as InputUndoStackClass,
  applyInputEditEvent,
  getInputSelectionText,
  normalizeInputCursor,
  normalizeInputSelection,
} from "../../runtime/inputEditor.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { RoutedAction } from "../../runtime/router.js";
import type { InputMeta } from "../../runtime/widgetMeta.js";

export type InputEditingRoutingOutcome = Readonly<{
  needsRender: boolean;
  action?: RoutedAction;
}>;

type RouteInputEditingEventContext = Readonly<{
  focusedId: string | null;
  enabledById: ReadonlyMap<string, boolean>;
  inputById: ReadonlyMap<string, InputMeta>;
  inputCursorByInstanceId: Map<InstanceId, number>;
  inputSelectionByInstanceId: Map<InstanceId, InputSelection>;
  inputWorkingValueByInstanceId: Map<InstanceId, string>;
  inputUndoByInstanceId: Map<InstanceId, InputUndoStack>;
  writeSelectedTextToClipboard: (text: string) => void;
  onInputCallbackError: (error: unknown) => void;
}>;

const ROUTE_RENDER: InputEditingRoutingOutcome = Object.freeze({ needsRender: true });
const ROUTE_NO_RENDER: InputEditingRoutingOutcome = Object.freeze({ needsRender: false });

function invokeOnInputSafely(
  meta: InputMeta,
  value: string,
  cursor: number,
  onError: (error: unknown) => void,
): void {
  const callback = meta.onInput;
  if (typeof callback !== "function") return;
  try {
    callback(value, cursor);
  } catch (error: unknown) {
    onError(error);
  }
}

export function readInputSnapshot(
  meta: InputMeta,
  inputWorkingValueByInstanceId: ReadonlyMap<InstanceId, string>,
  inputCursorByInstanceId: ReadonlyMap<InstanceId, number>,
  inputSelectionByInstanceId: ReadonlyMap<InstanceId, InputSelection>,
): InputEditorSnapshot {
  const value = inputWorkingValueByInstanceId.get(meta.instanceId) ?? meta.value;
  const cursor = normalizeInputCursor(
    value,
    inputCursorByInstanceId.get(meta.instanceId) ?? value.length,
  );
  const selection = inputSelectionByInstanceId.get(meta.instanceId);
  const normalizedSelection = normalizeInputSelection(
    value,
    selection?.start ?? null,
    selection?.end ?? null,
  );

  return Object.freeze({
    value,
    cursor,
    selectionStart: normalizedSelection?.start ?? null,
    selectionEnd: normalizedSelection?.end ?? null,
  });
}

export function applyInputSnapshot(
  instanceId: InstanceId,
  snap: InputEditorSnapshot,
  inputWorkingValueByInstanceId: Map<InstanceId, string>,
  inputCursorByInstanceId: Map<InstanceId, number>,
  inputSelectionByInstanceId: Map<InstanceId, InputSelection>,
): void {
  inputWorkingValueByInstanceId.set(instanceId, snap.value);
  inputCursorByInstanceId.set(instanceId, snap.cursor);
  if (snap.selectionStart === null || snap.selectionEnd === null) {
    inputSelectionByInstanceId.delete(instanceId);
    return;
  }

  inputSelectionByInstanceId.set(
    instanceId,
    Object.freeze({ start: snap.selectionStart, end: snap.selectionEnd }),
  );
}

export function getInputUndoStack(
  instanceId: InstanceId,
  inputUndoByInstanceId: Map<InstanceId, InputUndoStack>,
): InputUndoStack {
  const existing = inputUndoByInstanceId.get(instanceId);
  if (existing) return existing;
  const stack = new InputUndoStackClass();
  inputUndoByInstanceId.set(instanceId, stack);
  return stack;
}

export function routeInputEditingEvent(
  event: ZrevEvent,
  ctx: RouteInputEditingEventContext,
): InputEditingRoutingOutcome | null {
  if (event.kind !== "key" && event.kind !== "text" && event.kind !== "paste") {
    return null;
  }

  const focusedId = ctx.focusedId;
  if (focusedId === null || ctx.enabledById.get(focusedId) !== true) return null;

  const meta = ctx.inputById.get(focusedId);
  if (!meta) return null;

  const instanceId = meta.instanceId;
  const current = readInputSnapshot(
    meta,
    ctx.inputWorkingValueByInstanceId,
    ctx.inputCursorByInstanceId,
    ctx.inputSelectionByInstanceId,
  );
  const history = getInputUndoStack(instanceId, ctx.inputUndoByInstanceId);

  if (
    event.kind === "key" &&
    (event.action === "down" || event.action === "repeat") &&
    (event.mods & ZR_MOD_CTRL) !== 0
  ) {
    const isShift = (event.mods & ZR_MOD_SHIFT) !== 0;

    if (event.key === 67 /* C */ || event.key === 88 /* X */) {
      const selected = getInputSelectionText(
        current.value,
        current.selectionStart,
        current.selectionEnd,
      );
      if (selected && selected.length > 0) {
        ctx.writeSelectedTextToClipboard(selected);
        if (event.key === 88 /* X */) {
          const selection = normalizeInputSelection(
            current.value,
            current.selectionStart,
            current.selectionEnd,
          );
          if (selection) {
            const start = Math.min(selection.start, selection.end);
            const end = Math.max(selection.start, selection.end);
            const nextValue = current.value.slice(0, start) + current.value.slice(end);
            const nextCursor = normalizeInputCursor(nextValue, start);
            const next: InputEditorSnapshot = Object.freeze({
              value: nextValue,
              cursor: nextCursor,
              selectionStart: null,
              selectionEnd: null,
            });
            applyInputSnapshot(
              instanceId,
              next,
              ctx.inputWorkingValueByInstanceId,
              ctx.inputCursorByInstanceId,
              ctx.inputSelectionByInstanceId,
            );
            history.push(current, next, event.timeMs, false);

            invokeOnInputSafely(meta, next.value, next.cursor, ctx.onInputCallbackError);
            const action: RoutedAction = Object.freeze({
              id: focusedId,
              action: "input",
              value: next.value,
              cursor: next.cursor,
            });
            return Object.freeze({ needsRender: true, action });
          }
        }
        return ROUTE_NO_RENDER;
      }
    }

    if (event.key === 90 /* Z */ || event.key === 89 /* Y */) {
      const snap = event.key === 89 || isShift ? history.redoSnapshot() : history.undoSnapshot();
      if (snap) {
        applyInputSnapshot(
          instanceId,
          snap,
          ctx.inputWorkingValueByInstanceId,
          ctx.inputCursorByInstanceId,
          ctx.inputSelectionByInstanceId,
        );
        invokeOnInputSafely(meta, snap.value, snap.cursor, ctx.onInputCallbackError);
        const action: RoutedAction = Object.freeze({
          id: focusedId,
          action: "input",
          value: snap.value,
          cursor: snap.cursor,
        });
        return Object.freeze({ needsRender: true, action });
      }
      return ROUTE_NO_RENDER;
    }
  }

  const edit = applyInputEditEvent(event, {
    id: focusedId,
    value: current.value,
    cursor: current.cursor,
    selectionStart: current.selectionStart,
    selectionEnd: current.selectionEnd,
    multiline: meta.multiline,
  });
  if (!edit) return null;

  const next: InputEditorSnapshot = Object.freeze({
    value: edit.nextValue,
    cursor: edit.nextCursor,
    selectionStart: edit.nextSelectionStart,
    selectionEnd: edit.nextSelectionEnd,
  });
  applyInputSnapshot(
    instanceId,
    next,
    ctx.inputWorkingValueByInstanceId,
    ctx.inputCursorByInstanceId,
    ctx.inputSelectionByInstanceId,
  );
  if (edit.action) {
    history.push(current, next, event.timeMs, event.kind === "text");
    invokeOnInputSafely(meta, edit.action.value, edit.action.cursor, ctx.onInputCallbackError);
    return Object.freeze({ needsRender: true, action: edit.action });
  }
  return ROUTE_RENDER;
}

---
name: rezi-modal-dialogs
description: Add modal dialogs and overlay UI with focus trapping. Use when implementing confirmations, alerts, or layered interfaces.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[modal-type]"
metadata:
  short-description: Add modal dialogs
---

## When to use

Use this skill when:

- Adding confirmation dialogs, alerts, or prompts
- Building layered/overlay UI
- Need focus trapping within a dialog

## Source of truth

- `packages/core/src/widgets/useModalStack.ts` — `useModalStack()` hook
- `packages/core/src/widgets/types.ts` — `ModalProps`, `LayersProps`
- `packages/core/src/widgets/ui.ts` — `ui.modal()`, `ui.layers()`
- `packages/core/src/ui/recipes.ts` — `recipe.modal()` and `recipe.surface()` for design-system-consistent modal styling

## Steps

### Option A: useModalStack (recommended for multiple modals)

1. **Use `useModalStack()`** inside a `defineWidget`:
   ```typescript
   const modals = useModalStack(ctx);

   // Push a modal
   modals.push("confirm", {
     title: "Confirm",
     content: body,
     onClose: () => modals.pop(),
   });

   // Include in view
   return ui.layers([mainContent, ...modals.render()]);
   ```

### Option B: ui.modal (simple single modal)

1. **Use `ui.modal()` directly** with a state-controlled flag:
   ```typescript
   return ui.layers([
     mainContent,
     ...(state.showModal
       ? [
           ui.modal({
             id: "confirm-modal",
             title: "Confirm",
             initialFocus: "confirm-ok",
             returnFocusTo: "open-confirm",
             onClose: () => app.update((s) => ({ ...s, showModal: false })),
             content: ui.text("Are you sure?"),
             actions: [
               ui.button({
                 id: "confirm-cancel",
                 label: "Cancel",
                 intent: "secondary",
                 onPress: () => app.update((s) => ({ ...s, showModal: false })),
               }),
               ui.button({
                 id: "confirm-ok",
                 label: "OK",
                 intent: "primary",
                 onPress: () => app.update((s) => ({ ...s, showModal: false })),
               }),
             ],
           }),
         ]
       : []),
   ]);
   ```

2. **Overlay ordering note**:
   - Modal, dropdown, and toast overlays share unified z-ordering through the LayerRegistry.
   - Prefer `ui.layers([...])` as the common overlay composition root.

3. **Dialog action intent note**:
   - Use `intent` to communicate action semantics in modal/dialog button rows.
   - Recommended mapping: confirm/continue -> `primary`, cancel/back -> `secondary`, destructive -> `danger`, positive approval -> `success`, cautionary acknowledgment -> `warning`.

## Verification

- Modal opens and closes correctly
- Focus traps within the modal (Tab doesn't escape)
- Focus returns to previous element on close

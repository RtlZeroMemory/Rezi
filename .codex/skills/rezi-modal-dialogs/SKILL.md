---
name: rezi-modal-dialogs
description: Add modal dialogs and overlay UI with focus trapping. Use when implementing confirmations, alerts, or layered interfaces.
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
     state.showModal
       ? ui.modal({
           title: "Confirm",
           open: true,
           onClose: () => app.update({ showModal: false }),
           content: ui.text("Are you sure?"),
         })
       : null,
   ]);
   ```

## Verification

- Modal opens and closes correctly
- Focus traps within the modal (Tab doesn't escape)
- Focus returns to previous element on close

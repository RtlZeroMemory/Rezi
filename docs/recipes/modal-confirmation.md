# Modal Confirmation

Implementing confirmation dialogs for destructive actions.

## Problem

You need to ask the user for confirmation before performing a destructive action like deleting data.

## Solution

Use state to control modal visibility and render a centered dialog box.

## Complete Example

This is a complete, runnable example:

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = {
  items: Array<{ id: string; name: string }>;
  confirmForId: string | null;
};

const app = createNodeApp<State>({
    initialState: {
    items: [
      { id: "1", name: "Alpha" },
      { id: "2", name: "Beta" },
      { id: "3", name: "Gamma" },
    ],
    confirmForId: null,
  },
});

function requestDelete(itemId: string) {
  app.update((s) => ({ ...s, confirmForId: itemId }));
}

function cancelDelete() {
  app.update((s) => ({ ...s, confirmForId: null }));
}

app.view((state) => {
  const confirmId = state.confirmForId;
  const confirmItem = confirmId ? state.items.find((i) => i.id === confirmId) : null;

  return ui.layers([
    ui.column({ gap: 1, p: 1 }, [
      ui.text("Items", { style: { bold: true } }),
      ui.divider(),
      ...state.items.map((item) =>
        ui.row({ key: item.id, gap: 2, justify: "between" }, [
          ui.text(item.name),
          ui.button({
            id: `delete-${item.id}`,
            label: "Delete",
            onPress: () => requestDelete(item.id),
            style: { fg: rgb(255, 110, 110) },
          }),
        ])
      ),
    ]),

    confirmItem &&
      ui.modal({
        id: "confirm-delete",
        title: "Confirm delete",
        content: ui.column({ gap: 1 }, [
          ui.text(`Delete "${confirmItem.name}"?`),
          ui.text("This action cannot be undone.", { style: { dim: true } }),
        ]),
        actions: [
          ui.button({ id: "cancel", label: "Cancel", onPress: cancelDelete }),
          ui.button({
            id: "confirm",
            label: "Delete",
            onPress: () =>
              app.update((s) => ({
                ...s,
                items: s.items.filter((it) => it.id !== s.confirmForId),
                confirmForId: null,
              })),
            style: { fg: rgb(255, 110, 110), bold: true },
          }),
        ],
        onClose: cancelDelete,
        returnFocusTo: confirmId ? `delete-${confirmId}` : undefined,
      }),
  ]);
});

app.keys({ q: () => app.stop(), "ctrl+c": () => app.stop(), escape: () => cancelDelete() });

await app.start();
```

## Explanation

- The modal is rendered conditionally based on `confirmForId`.
- `ui.layers([...])` keeps the modal on top while preserving the main content underneath.
- `returnFocusTo` restores focus back to the button that opened the modal.

## Related

- [Box](../widgets/box.md) - Modal container
- [Button](../widgets/button.md) - Action buttons

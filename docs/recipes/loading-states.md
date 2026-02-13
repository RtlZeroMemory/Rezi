# Loading States

Handling asynchronous data fetching with appropriate loading indicators.

## Problem

You need to fetch data asynchronously and show appropriate feedback while loading.

## Solution

Track loading state explicitly and render skeletons, spinners, or error messages.

## Complete Example

This example simulates async work with `setTimeout` so it’s runnable without network access:

```typescript
import { ui, rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type LoadingState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

type User = { id: string; name: string };

type State = {
  users: LoadingState<User[]>;
};

const app = createNodeApp<State>({
    initialState: { users: { status: "idle" } },
});

function fetchUsers(): void {
  app.update((s) => ({ ...s, users: { status: "loading" } }));

  setTimeout(() => {
    const ok = Math.random() > 0.2;
    if (!ok) {
      app.update((s) => ({ ...s, users: { status: "error", error: "Failed to load users" } }));
      return;
    }
    app.update((s) => ({
      ...s,
      users: {
        status: "success",
        data: [
          { id: "1", name: "Ada" },
          { id: "2", name: "Linus" },
          { id: "3", name: "Grace" },
        ],
      },
    }));
  }, 600);
}

function renderUsers(state: State) {
  switch (state.users.status) {
    case "idle":
      return ui.button({ id: "load", label: "Load Users", onPress: fetchUsers });
    case "loading":
      return ui.column({ gap: 1 }, [
        ui.spinner({ label: "Loading…" }),
        ui.skeleton(15),
        ui.skeleton(15),
        ui.skeleton(15),
      ]);
    case "error":
      return ui.empty("Error", {
        description: state.users.error,
        action: ui.button({ id: "retry", label: "Retry", onPress: fetchUsers }),
      });
    case "success":
      return ui.column({ gap: 1 },
        state.users.data.map((user) => ui.text(user.name, { key: user.id }))
      );
  }
}

app.view((state) =>
  ui.column({ flex: 1, gap: 1, p: 1 }, [
    ui.text("Users", { style: { bold: true } }),
    ui.divider(),
    renderUsers(state),
  ])
);

app.keys({ q: () => app.stop(), "ctrl+c": () => app.stop() });

await app.start();
```

## Explanation

- Model async work explicitly with a tagged union (`idle/loading/success/error`).
- Render a skeleton/spinner while loading.
- Use an empty/error state with a retry action on failure.

## Related

- [Skeleton](../widgets/skeleton.md) - Loading placeholders
- [Spinner](../widgets/spinner.md) - Animated loading indicator
- [Empty](../widgets/empty.md) - Empty and error states

# Using JSX

Rezi provides a JSX runtime (`@rezi-ui/jsx`) that lets you write widget trees using JSX syntax instead of the `ui.*` function API.

## Setup

1. Install the JSX package:
   ```bash
   npm install @rezi-ui/jsx
   ```

2. Configure TypeScript (`tsconfig.json`):
   ```json
   {
     "compilerOptions": {
       "jsx": "react-jsx",
       "jsxImportSource": "@rezi-ui/jsx"
     }
   }
   ```

3. Use `.tsx` file extensions.

## Example

```tsx
import { rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";
import { Button, Column, Divider, Row, Text } from "@rezi-ui/jsx";

type State = { count: number };

const app = createNodeApp<State>({
  initialState: { count: 0 },
});

app.view((state) => (
  <Column p={1} gap={1}>
    <Text style={{ fg: rgb(120, 200, 255), bold: true }}>Counter</Text>
    <Row gap={2}>
      <Text>Count: {state.count}</Text>
      <Button id="inc" label="+1" />
    </Row>
    <Divider />
    <Text style={{ dim: true }}>Press q to quit</Text>
  </Column>
));

app.keys({
  q: () => app.stop(),
});

await app.start();
```

## Available JSX elements

`@rezi-ui/jsx` exports one component per widget (`Text`, `Box`, `Column`, etc). Props match the corresponding `ui.*` function.

| `ui.*` API | JSX component |
|---|---|
| `ui.text(...)` | `<Text>` |
| `ui.box(...)` | `<Box>` |
| `ui.row(...)` | `<Row>` |
| `ui.column(...)` | `<Column>` |
| `ui.button(...)` | `<Button>` |
| `ui.input(...)` | `<Input>` |
| `ui.table(...)` | `<Table>` |
| `ui.modal(...)` | `<Modal>` |
| ... | (all 49 widgets) |

Lowercase intrinsic elements are also supported (for example `<column>` and `<text>`). These map directly to the `ui.*` names and do not require importing components.

## JSX vs `ui.*` API

Both APIs produce the same VNode trees. Choose based on preference:

```tsx
// JSX style
<Column p={1}>
  <Text style={{ bold: true }}>Hello</Text>
  <Row gap={2}>
    <Button id="ok" label="OK" />
    <Button id="cancel" label="Cancel" />
  </Row>
</Column>

// ui.* style
ui.column({ p: 1 }, [
  ui.text("Hello", { style: { bold: true } }),
  ui.row({ gap: 2 }, [
    ui.button({ id: "ok", label: "OK" }),
    ui.button({ id: "cancel", label: "Cancel" }),
  ]),
])
```

The `ui.*` API has zero runtime overhead — it's direct function calls. The JSX runtime adds a thin `createElement` layer. Both are extremely fast.

## Fragments

Use fragments to group elements without a container:

```tsx
<>
  <Text>Line 1</Text>
  <Text>Line 2</Text>
</>
```

## Note: JSX vs `ui.*`

`@rezi-ui/jsx` is the native Rezi JSX runtime. It creates Rezi VNodes directly and does not use React.

If you prefer explicit function calls, use `ui.*`. If you prefer JSX syntax, use `@rezi-ui/jsx`.

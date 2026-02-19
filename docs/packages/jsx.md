# @rezi-ui/jsx

Native JSX runtime for Rezi widgets. Write widget trees using JSX syntax instead of the `ui.*` function API.

## Installation

```bash
npm install @rezi-ui/jsx
```

## TypeScript configuration

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rezi-ui/jsx"
  }
}
```

Use `.tsx` file extensions for files containing JSX.

## Overview

`@rezi-ui/jsx` provides a custom JSX runtime that maps JSX elements directly to Rezi VNodes. It does **not** use React and stays a thin layer over the native `ui.*` API.

## Available elements

`@rezi-ui/jsx` exports components for all core widgets. Props match the corresponding `ui.*` function.

| `ui.*` API | JSX component |
|---|---|
| `ui.text(...)` | `<Text>` |
| `ui.box(...)` | `<Box>` |
| `ui.row(...)` | `<Row>` |
| `ui.column(...)` | `<Column>` |
| `ui.grid(...)` | `<Grid>` |
| `ui.hstack(...)` | `<HStack>` |
| `ui.vstack(...)` | `<VStack>` |
| `ui.button(...)` | `<Button>` |
| `ui.input(...)` | `<Input>` |
| `ui.slider(...)` | `<Slider>` |
| `ui.tabs(...)` | `<Tabs>` |
| `ui.accordion(...)` | `<Accordion>` |
| `ui.breadcrumb(...)` | `<Breadcrumb>` |
| `ui.pagination(...)` | `<Pagination>` |
| `ui.table(...)` | `<Table>` |
| `ui.modal(...)` | `<Modal>` |
| `ui.divider(...)` | `<Divider>` |
| ... | (all core widgets through `<ToastContainer>`) |

Lowercase intrinsic elements are also supported (for example `<column>`, `<grid>`, `<hstack>`, and `<tabs>`). These map directly to the JSX runtime factories and do not require importing components.

`<HStack>`/`<VStack>` (and `<hstack>`/`<vstack>`) preserve the `ui.hstack`/`ui.vstack` default `gap: 1` behavior.

## Example

```tsx
import { rgb } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";
import { Button, Column, Row, Text } from "@rezi-ui/jsx";

const app = createNodeApp({
  initialState: { count: 0 },
});

app.view((state) => (
  <Column p={1} gap={1}>
    <Text style={{ fg: rgb(120, 200, 255), bold: true }}>Counter</Text>
    <Row gap={2}>
      <Text>Count: {state.count}</Text>
      <Button id="inc" label="+1" />
    </Row>
  </Column>
));

await app.start();
```

## Fragments

Use fragments to group elements without a wrapper:

```tsx
<>
  <Text>Line 1</Text>
  <Text>Line 2</Text>
</>
```

## Further reading

- [JSX getting started guide](../getting-started/jsx.md) — Full setup and usage guide
- [Widget catalog](../widgets/index.md) — All available widgets and their props

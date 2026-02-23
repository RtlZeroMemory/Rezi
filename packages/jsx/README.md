# @rezi-ui/jsx

`@rezi-ui/jsx` is the native JSX runtime for Rezi. It maps JSX directly to Rezi VNodes and keeps full API parity with `ui.*()` from `@rezi-ui/core`.

## Quick Setup

Install:

```bash
npm install @rezi-ui/core @rezi-ui/jsx @rezi-ui/node
```

Configure TypeScript:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rezi-ui/jsx"
  }
}
```

## Minimal Example

```tsx
import { createNodeApp } from "@rezi-ui/node";
import { Button, Page, Panel, Text } from "@rezi-ui/jsx";

const app = createNodeApp({ initialState: { count: 0 } });

app.view((state) => (
  <Page
    p={1}
    body={
      <Panel title="Counter">
        <Text>Count: {state.count}</Text>
        <Button id="inc" label="+1" intent="primary" />
      </Panel>
    }
  />
));
```

## Component Surface

- 84 exported JSX components/functions
- 83 `ui.*()` parity components + `Fragment`

## Performance Note

The JSX layer is intentionally thin. Components delegate to core `ui.*()` factories so behavior stays consistent and overhead remains minimal.

## Documentation

- Full guide: `docs/getting-started/jsx.md`
- Package docs: `docs/packages/jsx.md`

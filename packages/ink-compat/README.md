# @rezi-ui/ink-compat

`@rezi-ui/ink-compat` is a drop-in compatibility layer for Ink powered by Rezi.
It keeps Ink's component/hook surface while delegating rendering to Rezi's engine.

## Installation

```bash
npm install @rezi-ui/ink-compat
```

## Migration

Change your imports only:

```ts
// Before
import { render, Box, Text } from "ink";

// After
import { render, Box, Text } from "@rezi-ui/ink-compat";
```

## Supported API

### Components

- `Box`
- `Text`
- `Spacer`
- `Newline`
- `Static`
- `Transform`

### Hooks

- `useInput`
- `useApp`
- `useFocus`
- `useFocusManager`
- `useStdin`
- `useStdout`
- `useStderr`

### Entry points

- `render()`
- `renderToString()`
- `measureElement()`
- `@rezi-ui/ink-compat/testing`

## Example

```ts
import React from "react";
import { render, Box, Text } from "@rezi-ui/ink-compat";

function App() {
  return (
    <Box flexDirection="row" borderStyle="round" padding={1}>
      <Text color="green" bold>
        Hello
      </Text>
      <Text>World</Text>
    </Box>
  );
}

render(<App />);
```

## Known limitations

- Compatibility currently focuses on the core Ink surface listed above.
- Terminal behavior can differ slightly for advanced edge cases (especially around transform/static behavior).
- Ink internals and unsupported third-party custom render primitives are intentionally not mirrored.

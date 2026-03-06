# Installation

Install Rezi packages from npm to start building terminal applications.

## Requirements

- **Runtime**: Node.js 18.18.0+ or Bun 1.3.0+
- **Operating System**: Linux, macOS, or Windows
- **Terminal**: Any terminal emulator with 256-color or true-color support

## Install via npm

If you want a ready-to-run starter, use the scaffolding tool:

```bash
npm create rezi my-app
```

Install the core and Node.js/Bun backend packages:

```bash
npm install @rezi-ui/core @rezi-ui/node
```

Or with other package managers:

=== "npm"
    ```bash
    npm install @rezi-ui/core @rezi-ui/node
    ```

=== "pnpm"
    ```bash
    pnpm add @rezi-ui/core @rezi-ui/node
    ```

=== "yarn"
    ```bash
    yarn add @rezi-ui/core @rezi-ui/node
    ```

=== "bun"
    ```bash
    bun add @rezi-ui/core @rezi-ui/node
    ```

## Prebuilt Binaries

Installing `@rezi-ui/node` also installs `@rezi-ui/native`, which contains the
prebuilt `.node` binaries for supported platforms:

| Platform | Architecture | Status |
|----------|--------------|--------|
| Linux | x64 | Included |
| Linux | arm64 | Included |
| macOS | x64 (Intel) | Included |
| macOS | arm64 (Apple Silicon) | Included |
| Windows | x64 | Included |
| Windows | arm64 | Included |

No install-time source build runs for unsupported targets. If a matching
prebuilt binary is not available, build from a repository checkout with
`npm run build:native`.

## Package Overview

| Package | Description | Required |
|---------|-------------|----------|
| `@rezi-ui/core` | Widgets, layout, themes, forms, keybindings | Yes |
| `@rezi-ui/node` | Node.js/Bun backend (worker/inline modes + depends on `@rezi-ui/native`) | Yes |
| `@rezi-ui/testkit` | Testing utilities and fixtures | Optional |

## Optional packages

| Package | When to use |
|---|---|
| `@rezi-ui/jsx` | Prefer JSX syntax over `ui.*` function calls |
| `@rezi-ui/testkit` | Testing Rezi applications |

### @rezi-ui/core

The core package is runtime-agnostic and contains:

- All widget constructors (`ui.text`, `ui.button`, `ui.table`, etc.)
- Layout engine with flexbox-like semantics
- Theme system with built-in presets
- Form management and validation
- Keybinding parser and matcher
- Focus management utilities
- Binary protocol builders and parsers

### @rezi-ui/node

The Node.js/Bun backend provides:

- Runtime execution modes (`worker`, `inline`, `auto`)
- Native addon binding to the Zireael C engine
- Terminal capability detection
- Event loop integration
- Debug tracing and performance instrumentation

### @rezi-ui/testkit

Testing utilities for Rezi applications:

- Test fixtures for protocol testing
- Golden file comparison utilities
- Mock backends for unit testing

Install for development:

```bash
npm install --save-dev @rezi-ui/testkit
```

## TypeScript Setup

Rezi is written in TypeScript and ships with full type definitions. No additional `@types/*` packages are needed.

Recommended `tsconfig.json` settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

For maximum type safety, enable these additional options:

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Verify Installation

Create a test file to verify your installation:

```typescript
// test.ts
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
    initialState: {},
});

app.view(() => ui.text("Rezi is working!"));

await app.start();
```

Run with:

```bash
npx tsx test.ts
```

Or with Bun:

```bash
bun run test.ts
```

You should see "Rezi is working!" displayed in your terminal.

## Building from Source

For contributors or custom platform builds, see the [Build Guide](../dev/build.md).

## Next Steps

- [Quickstart](quickstart.md) - Build your first Rezi application
- [Examples](examples.md) - Learn from example applications
- [Widget Catalog](../widgets/index.md) - Browse available widgets

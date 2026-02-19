# Style Guide

This page documents the coding conventions and tooling standards used across the
Rezi codebase.

## Formatting and Linting

Rezi uses [Biome](https://biomejs.dev/) (v1.9.4) for both formatting and
linting. Biome replaces the need for separate ESLint and Prettier configurations.

### Commands

```bash
# Format all files in-place
npm run fmt

# Check for lint issues (does not auto-fix)
npm run lint
```

### Biome Configuration

The `biome.json` at the repository root defines:

| Setting          | Value |
|------------------|-------|
| Indent style     | Spaces |
| Indent width     | 2 |
| Line width       | 100 characters |
| Quote style      | Double quotes |
| Semicolons       | Always |
| Linter rules     | Biome recommended set |

Ignored paths: `.venv-docs/`, `out/`, `**/dist/`, `**/node_modules/`,
`**/target/`, `**/*.node`, `**/vendor/`, `**/debug-traces/`, `**/Screens/`.

### Pre-commit

The `scripts/guardrails.sh` script runs repository hygiene pattern checks
(legacy scope/name strings, unresolved task markers, and synthetic-content markers). Run it
before committing to catch prohibited text patterns early:

```bash
bash scripts/guardrails.sh
```

## TypeScript

### Strict Mode

All packages use the shared `tsconfig.base.json` with strict settings enabled:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitAny": true,
    "useUnknownInCatchVariables": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Key implications:

- **No implicit `any`.** Every variable, parameter, and return type must be
  explicitly typed or inferable. The `noImplicitAny` flag rejects untyped code.
- **Exact optional properties.** With `exactOptionalPropertyTypes`, a property
  typed as `foo?: string` only accepts `string` or being absent -- not
  `undefined`. Use `foo?: string | undefined` when `undefined` assignment is
  intentional.
- **Unchecked index access.** With `noUncheckedIndexedAccess`, array element
  access and index-signature lookups return `T | undefined`, forcing explicit
  null checks.
- **Unknown in catch.** Caught errors are typed as `unknown`, not `any`.
  Narrow before accessing properties.

### Discriminated Unions Over Class Hierarchies

Prefer discriminated unions (tagged unions) over class inheritance for modeling
variant types. Discriminated unions work better with TypeScript's type narrowing,
produce cleaner exhaustiveness checks, and avoid the overhead of prototype
chains.

```typescript
// Preferred: discriminated union
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number };

function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius * s.radius;
    case "rect":
      return s.width * s.height;
  }
}

// Avoid: class hierarchy
class Shape { ... }
class Circle extends Shape { ... }
class Rect extends Shape { ... }
```

This pattern is used extensively throughout the codebase: VNode types, widget
props, event types, parse results, and error codes are all modeled as
discriminated unions.

## Naming Conventions

| Construct                | Convention       | Example |
|--------------------------|------------------|---------|
| Functions, variables     | camelCase        | `renderTree`, `maxDepth` |
| Types, interfaces        | PascalCase       | `AppConfig`, `VNode` |
| Type parameters          | Single uppercase | `S`, `T` |
| Constants (module-level) | UPPER_SNAKE_CASE | `ZR_ENGINE_ABI_MAJOR`, `DEFAULT_CONFIG` |
| File names               | camelCase        | `createApp.ts`, `widgetRenderer.ts` |
| Test files               | camelCase with `.test` suffix | `reconcile.keyed.test.ts` |
| Private/internal fields  | Leading underscore or `internal_` prefix | `internal_onRender` |

## Import Ordering

Imports should follow this order, with a blank line between each group:

1. Node.js built-ins (`node:*`)
2. External packages (`@napi-rs/*`, third-party)
3. Internal workspace packages (`@rezi-ui/core`, etc.)
4. Relative imports from parent directories (`../`)
5. Relative imports from the same directory (`./`)

Type-only imports (`import type { ... }`) should be separate from value imports,
grouped in the same order.

Biome enforces import sorting automatically during formatting.

## Allocation Constraints in Hot Paths

The rendering pipeline runs every frame (up to 60 fps by default). Allocations
in hot paths create GC pressure that causes frame drops. Follow these rules in
performance-critical code:

### Avoid

- Creating new objects, arrays, or closures per frame in the render loop.
- String concatenation in tight loops (creates intermediate strings).
- `Array.prototype.map`, `.filter`, `.reduce` in hot paths (each allocates a
  new array).
- Spreading (`{ ...obj }`, `[...arr]`) in hot paths.

### Prefer

- Pre-allocated buffers and object pools.
- Mutating existing objects where ownership is clear.
- `for` loops over array methods in hot paths.
- Caching computed values across frames (e.g., `drawlistEncodedStringCacheCap`).

### Example

```typescript
// Avoid: allocates a new array every frame
const visible = items.filter((item) => item.visible);

// Prefer: reuse a pre-allocated array
let visibleCount = 0;
for (let i = 0; i < items.length; i++) {
  if (items[i].visible) {
    visibleBuf[visibleCount++] = items[i];
  }
}
```

The `@rezi-ui/core` package uses content-addressed stability signatures
(FNV-1a hashes) to skip relayout when the widget tree structure has not changed,
further reducing per-frame allocation.

## Error Handling

### Structured Errors

Use structured error types with discriminated codes rather than string messages
or thrown exceptions in library code:

```typescript
type ParseErrorCode = "MAGIC_MISMATCH" | "TRUNCATED" | "INVALID_OPCODE";

type ParseError = Readonly<{
  code: ParseErrorCode;
  offset: number;
  message: string;
}>;

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };
```

### Never Throw in Parsers

Binary parsers (ZRDL drawlist parser, ZREV event parser) must never throw.
They return `ParseResult` values so callers can handle errors without
`try/catch` overhead. This also makes parsers safe to use in fuzz-lite
property-based tests.

### Validation Errors

Use `invalidProps()` for configuration validation errors (invalid user input to
public APIs). These may throw because they indicate programmer mistakes, not
runtime conditions.

## See Also

- [Build](build.md)
- [Testing](testing.md)
- [Repo layout](repo-layout.md)

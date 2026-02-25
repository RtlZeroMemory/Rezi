# Style Guide

This page documents the coding conventions and tooling standards used across the
Rezi codebase.

For mandatory merge-gate rules, start with
[Code Standards](code-standards.md). This page provides supporting details and
examples.

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

## Streaming Hook Conventions

When adding or using streaming hooks (`useStream`, `useEventSource`, `useWebSocket`, `useInterval`, `useTail`), keep behavior deterministic and cleanup-safe:

- Always return cleanup logic for timers/subscriptions in effects.
- Keep `@rezi-ui/core` runtime-agnostic by using adapter/factory injection instead of importing runtime-specific APIs.
- Expose bounded buffers for unbounded streams (for example, `maxBuffer` in tail/log flows) so memory usage stays predictable.
- Ensure parser callbacks are total and defensive (`unknown` input, explicit narrowing, deterministic fallback behavior).
- Test stale-update races (dependency changes/unmount before async completion) for every new streaming hook.

## Animation Hook Conventions

When adding or changing animation hooks (`useTransition`, `useSpring`, `useSequence`, `useStagger`) or `ui.box` transition behavior:

- Keep interpolation deterministic for identical state + frame-time inputs.
- Normalize durations/configs defensively (finite, non-negative, integer-ms where applicable).
- Retarget from current animated state (avoid reset jumps on mid-flight updates).
- Clamp bounded values (for example, `opacity` in `[0..1]`).
- Ensure timers/subscriptions are cleaned up on dependency change and unmount.
- Cover mount/update/retarget/unmount behavior in dedicated unit tests.

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
- For `virtualList` estimate mode, update measured-height caches incrementally
  (clone once only when visible-item measurements actually change).

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

## HSR Identity Stability

For code that should work with hot state-preserving reload (`app.replaceView` / `app.replaceRoutes`):

- Treat widget `id` and reconciliation `key` values as stable API contracts.
- Do not generate ids with `Math.random()`, timestamps, or render counters.
- Keep `defineWidget` keys stable for list items so local hooks persist.
- In HSR demos/tools, keep editor ids stable (`self-edit-code`, `save-view-file`) so startup focus and save shortcuts remain deterministic across swaps.
- Prefer modal/callout state in the view tree for reload feedback instead of `console.log` while an alt-screen app is running; stdout logging can corrupt visual diff captures.

HSR swaps widget views or route tables; state preservation depends on
reconciliation matching old/new instances by stable identity.

## Code Editor Tokenizer Guidelines

When touching code-editor syntax highlighting (`syntaxLanguage`, `tokenizeLine`,
or `codeEditorSyntax.ts`):

- Keep tokenization deterministic and lexical (line-based). No hidden global state.
- Keep token spans bounded and non-overlapping; normalize ranges before painting.
- Favor shared tokenizer exports (`tokenizeCodeEditorLine`, `tokenizeCodeEditorLineWithCustom`)
  rather than ad-hoc tokenizers embedded in render code.
- Preserve compatibility across the built-in preset family:
  `plain`, `typescript`, `javascript`, `json`, `go`, `rust`, `c`, `cpp`/`c++`,
  `csharp`/`c#`, `java`, `python`, `bash`.
- Keep unknown language inputs safe by falling back to `plain`.
- Wire colors through theme tokens so syntax rendering remains theme-portable.

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

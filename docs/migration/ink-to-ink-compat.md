# Porting Ink Apps to Ink-Compat

This guide is for teams that already have an Ink app and want to move to Rezi's Ink compatibility runtime with minimal app-code churn.

If you want to migrate to Rezi-native APIs (`createNodeApp`, `ui.*`, widget graph), use [Ink to Rezi](ink-to-rezi.md) instead.

## Choose your migration path

| Goal | Recommended path | App code changes |
|---|---|---|
| Keep existing Ink component/hook model and switch runtime backend | Ink -> Ink-Compat (this guide) | Low |
| Adopt Rezi-native architecture and APIs | [Ink to Rezi](ink-to-rezi.md) | High |

## What changes when you move to Ink-Compat

- Your app still uses Ink-style components and hooks.
- Rendering runs through Rezi's compat runtime and renderer pipeline.
- You can keep `import "ink"` via dependency aliasing, or swap imports explicitly.
- You get deterministic, env-gated parity diagnostics.

For internals and compatibility surface details, see [Ink Compat Layer](../architecture/ink-compat.md).

## Preflight checklist

1. Identify your current Ink usage and version.
2. Identify ecosystem dependencies (`ink-gradient`, `ink-spinner`, custom Ink wrappers).
3. Confirm your app has at least one smoke flow you can run end-to-end before and after migration.
4. Decide migration mode:
   - explicit imports (`@rezi-ui/ink-compat`)
   - package aliasing (`ink -> @rezi-ui/ink-compat`)

## Option A: explicit import swap

Use this when you can touch source imports.

```ts
// Before
import { render, Box, Text } from "ink";

// After
import { render, Box, Text } from "@rezi-ui/ink-compat";
```

Pros:
- Explicit and easy to audit
- No package-manager alias complexity

Cons:
- Requires source edits

## Option B: alias `ink` to Ink-Compat

Use this when you want to keep existing `import "ink"` calls.

### npm

```bash
npm install \
  ink@npm:@rezi-ui/ink-compat@latest \
  ink-gradient@npm:ink-gradient-shim@latest \
  ink-spinner@npm:ink-spinner-shim@latest
```

### pnpm

```bash
pnpm add \
  ink@npm:@rezi-ui/ink-compat@latest \
  ink-gradient@npm:ink-gradient-shim@latest \
  ink-spinner@npm:ink-spinner-shim@latest
```

### yarn

```bash
yarn add \
  ink@npm:@rezi-ui/ink-compat@latest \
  ink-gradient@npm:ink-gradient-shim@latest \
  ink-spinner@npm:ink-spinner-shim@latest
```

Pros:
- Usually no app-source changes
- Fastest initial rollout

Cons:
- Easy to misconfigure if lockfile/resolution rules drift

## Verify wiring (do this in CI)

Do not assume aliasing/import swaps worked. Verify package identity directly.

```bash
node -e "const p=require('ink/package.json'); if(p.name!=='@rezi-ui/ink-compat') throw new Error('ink resolves to '+p.name); console.log('ink-compat active:', p.version);"
```

Optional path check:

```bash
node -e "const fs=require('node:fs'); const path=require('node:path'); const pkg=require.resolve('ink/package.json'); console.log(fs.realpathSync(path.dirname(pkg)));"
```

## API coverage that matters when porting

Ink-Compat supports the core app surface most Ink CLIs depend on:

- Components: `Box`, `Text`, `Static`, `Transform`, `Spacer`, `Newline`
- Hooks: `useApp`, `useInput`, `useFocus`, `useFocusManager`, stream hooks, `useCursor`
- Runtime: `render`, `renderToString`, `measureElement`, `ResizeObserver`
- Helpers: `kittyFlags`, `kittyModifiers`

See the full up-to-date surface in [Ink Compat Layer](../architecture/ink-compat.md#public-compatibility-surface).

## Porting workflow (recommended)

1. Baseline your current app behavior on real Ink.
2. Switch wiring (import swap or aliasing).
3. Add CI wiring guard (commands above).
4. Run smoke flows and compare critical screens/interaction loops.
5. Enable compat tracing only when debugging parity issues.
6. Roll out in stages (internal users -> beta channel -> full rollout).

## Debug parity issues

Start with lightweight trace mode:

```bash
INK_COMPAT_TRACE=1 INK_COMPAT_TRACE_FILE=/tmp/ink-compat.trace.log node dist/cli.js
```

Useful debug env vars:

| Env var | Purpose |
|---|---|
| `INK_COMPAT_TRACE=1` | Enable compat tracing |
| `INK_COMPAT_TRACE_FILE=/path/log` | Write traces to file |
| `INK_COMPAT_TRACE_DETAIL=1` | Include additional node/op details |
| `INK_COMPAT_TRACE_DETAIL_FULL=1` | Include full VNode/grid snapshots |
| `INK_COMPAT_TRACE_IO=1` | Include write/backpressure diagnostics |
| `INK_COMPAT_TRACE_RESIZE_VERBOSE=1` | Include resize timeline diagnostics |

Full troubleshooting workflow: [Ink Compat Debugging Runbook](../dev/ink-compat-debugging.md).

## Rollout checklist

1. Install compat and required shims.
2. Switch imports or add alias rules.
3. Verify `ink` resolves to `@rezi-ui/ink-compat` in CI.
4. Validate key flows (startup, navigation, input, resize, exit).
5. Capture and triage parity diffs with traces when needed.
6. Lock dependency versions before wider release.

## Related docs

- [Ink Compat Layer](../architecture/ink-compat.md)
- [Ink Compat Debugging Runbook](../dev/ink-compat-debugging.md)
- [Ink to Rezi](ink-to-rezi.md)

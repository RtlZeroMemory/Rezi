# Create Rezi

`create-rezi` scaffolds Rezi apps from a small public starter set.

## Public templates

| Template | Purpose |
|---|---|
| `minimal` | Small utility starter with the smallest surface area. |
| `cli-tool` | Routed multi-screen workflow starter for product-style terminal apps. |
| `starship` | Advanced console starter with tabs, charts, overlays, and broad widget coverage. |

Use `--template minimal`, `--template cli-tool`, or `--template starship` to select one directly.

```bash
npm create rezi my-app
cd my-app
npm run start
```

If you prefer Bun:

```bash
bun create rezi my-app
cd my-app
bun run start
```

## Template conventions

The public templates share the same baseline structure:

- `src/types.ts`
- `src/theme.ts`
- `src/helpers/`
- `src/screens/`
- `src/main.ts`
- `src/__tests__/`

Each template includes example tests for reducer logic, widget rendering, and keybinding mapping. `src/theme.ts` is the canonical place for template identity plus theme catalog/style helpers.

## Dev loop

The public templates ship with hot state-preserving reload in `npm run dev` / `bun run dev`:

- the dev script runs `tsx watch src/main.ts --hsr`
- source changes hot-swap through `createNodeApp({ hotReload: ... })`
- app state, focus, and stable widget local state are preserved across edits

## Next steps

- [Quickstart](quickstart.md) for manual setup.
- [Examples](examples.md) for repository example apps that go beyond the starter templates.
- [Animation Guide](../guide/animation.md) for transition/spring/sequence/stagger usage patterns.

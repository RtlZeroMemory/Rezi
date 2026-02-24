# API Reference

The complete API reference is generated from TypeScript sources using TypeDoc.

## Viewing the API Reference

### Online

The hosted API reference is available at the documentation site under `/api/reference/`.

- [Open API reference](api/reference/index.html)

### Local Build

Generate the API documentation locally:

```bash
npm run docs:api
```

The output is written to `out/typedoc/index.html`.

Alternatively, build the complete documentation site:

```bash
npm run docs:build
```

The API reference is included at `out/site/api/reference/index.html`.

## Quick Reference

For the most common APIs, see:

- [Widget Catalog](widgets/index.md) - All widget types and props
- [Animation Guide](guide/animation.md) - Declarative animation hooks and box transitions
- [Design System](design-system.md) - `recipe.*` APIs (including tabs/accordion/breadcrumb/pagination/kbd/dropdown/tree/sidebar/toolbar), `ui.themed(...)`, spacing-token sizing, and theme transitions
- [Hooks Reference](guide/hooks-reference.md) - `ctx.useTheme()` and composition hooks
- [@rezi-ui/core](packages/core.md) - Core package exports
- [@rezi-ui/node](packages/node.md) - Node.js/Bun backend

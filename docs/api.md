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
- [@rezi-ui/core](packages/core.md) - Core package exports
- [@rezi-ui/node](packages/node.md) - Node.js/Bun backend

## State Management APIs

### Widget Composition

- `ctx.useReducer<S, A>(reducer, initialState)` -> `[state, dispatch]`

### App Runtime

- `app.use(middleware)` -> unsubscribe function
- `app.dispatch(actionOrThunk)` -> dispatch state updaters or async thunks
- `app.getState()` -> read current committed state

### State Utilities

- `createSelector(...)` -> memoized selector factory (1-4 input selectors + combiner)
- `createSlice(config)` -> typed slice with `actions`, `reducer`, `initialState`
- `combineSlices({ ...slices })` -> root reducer from multiple slices
- `getInitialState({ ...slices })` -> root initial state from slice definitions

### Related Types

- `Middleware<S>`
- `MiddlewareContext<S>`
- `Thunk<S>`
- `Slice<Name, SliceState, CR>`
- `SliceConfig<Name, SliceState, CR>`

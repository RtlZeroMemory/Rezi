# @rezi-ui/jsx

## Overview

`@rezi-ui/jsx` is Rezi's native JSX runtime. It gives JSX syntax while preserving full parity with `ui.*()` VNode factories from `@rezi-ui/core`.

Use it when you want JSX ergonomics without adding React.

## Installation and Configuration

```bash
npm install @rezi-ui/core @rezi-ui/jsx
```

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rezi-ui/jsx"
  }
}
```

Use `.tsx` files for JSX views.

## Exports Summary

`@rezi-ui/jsx` exports:

- Components: full PascalCase component surface matching `ui.*()` (layout, inputs, navigation, overlays, advanced widgets, and composition helpers)
- Includes `<Themed theme={...}>...</Themed>` for scoped subtree theme overrides (parity with `ui.themed(...)`)
- Runtime helpers: `createElement`, `h`, `normalizeContainerChildren`, `normalizeTextChildren`
- Core helper re-exports: `defineWidget`, `show`, `when`, `match`, `maybe`, `each`, `eachInline`, `recipe`
- Core value re-export: `rgb`
- Type re-exports: JSX prop types and common core types (`WidgetVariant`, `ButtonIntent`, `DialogProps`, `PageOptions`, `TableProps`, `CommandItem`, `Toast`, `ColorTokens`, etc.)

## Entry Points

- `@rezi-ui/jsx`: components + helpers + type surface
- `@rezi-ui/jsx/jsx-runtime`: automatic JSX runtime (`jsx`, `jsxs`, `Fragment`)
- `@rezi-ui/jsx/jsx-dev-runtime`: dev JSX runtime (`jsxDEV`, `Fragment`)

## Guide

For full usage patterns and complete component mapping, see:

- [Using JSX](../getting-started/jsx.md)

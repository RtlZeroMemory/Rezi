# Grid

Arranges children in a two-dimensional grid with configurable columns, rows, and gap spacing.

## Usage

```ts
ui.grid({ columns: 3, gap: 1 }, [
  ui.text("Cell 1"),
  ui.text("Cell 2"),
  ui.text("Cell 3"),
  ui.text("Cell 4"),
  ui.text("Cell 5"),
  ui.text("Cell 6"),
])
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `columns` | `number \| string` | **required** | Number of equal-width columns, or a track string (e.g. `"1fr 2fr auto"`) |
| `rows` | `number \| string` | - | Number of rows or a track string. When explicit, grid capacity is fixed and extra children are not rendered |
| `gap` | `number` | `0` | Default gap for both row and column axes |
| `rowGap` | `number` | - | Row gap override (takes precedence over `gap`) |
| `columnGap` | `number` | - | Column gap override (takes precedence over `gap`) |

## Track Syntax

The `columns` and `rows` props accept either a positive number or a track definition string. Track strings are space-separated lists of track sizes:

| Token | Meaning | Example |
|---|---|---|
| Fixed number | Column/row width in cells | `12`, `24` |
| `auto` | Size to content | `auto` |
| `fr` fraction | Share of remaining space | `1fr`, `2fr` |

**Note:** `fr` tracks have a natural size of 0 and grow from remaining space after fixed and `auto` tracks are resolved.

## Behavior

- **Numeric columns** (e.g. `columns: 3`) create equal-width columns that divide the available space evenly.
- **Placement is auto-flow, row-major:** children fill cells left-to-right, then wrap to the next row.
- **Explicit rows** cap grid capacity. If `rows` is set and the grid is full, extra children are not rendered.

## Examples

### Dashboard Cards

A three-column dashboard layout with info cards:

```ts
ui.grid({ columns: 3, gap: 1 },
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("CPU", { style: { bold: true } }),
    ui.text("42%"),
  ]),
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("Memory", { style: { bold: true } }),
    ui.text("3.2 GB / 16 GB"),
  ]),
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("Disk", { style: { bold: true } }),
    ui.text("120 GB free"),
  ]),
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("Network", { style: { bold: true } }),
    ui.text("12 Mbps"),
  ]),
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("Uptime", { style: { bold: true } }),
    ui.text("14d 6h"),
  ]),
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("Processes", { style: { bold: true } }),
    ui.text("284 running"),
  ]),
])
```

### Mixed Tracks

A sidebar-content layout using `fr` tracks:

```ts
ui.grid({ columns: "1fr 3fr", gap: 1 }, [
  ui.box({ border: "single", p: 1 }, [
    ui.column({ gap: 0 }, [
      ui.text("Nav Item 1"),
      ui.text("Nav Item 2"),
      ui.text("Nav Item 3"),
    ]),
  ]),
  ui.box({ border: "rounded", p: 1 }, [
    ui.text("Main content area"),
  ]),
])
```

### Status Grid

A fixed 2x3 status grid with explicit rows:

```ts
ui.grid({ columns: 2, rows: 3, gap: 1 }, [
  ui.text("Service A"),  ui.text("OK"),
  ui.text("Service B"),  ui.text("WARN"),
  ui.text("Service C"),  ui.text("OK"),
])
```

If additional children were added beyond the 6-cell capacity (`2 * 3`), they would not be rendered.

### Auto-sized Columns

Using `auto` to size columns to their content:

```ts
ui.grid({ columns: "auto 1fr auto", gap: 1 }, [
  ui.text("Label:"),
  ui.input({
    id: "name-input",
    value: state.name,
    onInput: (value) => app.update((s) => ({ ...s, name: value })),
  }),
  ui.button("save", "Save"),
])
```

## Stability

`stable`

# Constraints Quickstart (10 minutes)

Constraints let you declare derived layout intent (viewport/parent/sibling/intrinsic relationships) without manual math in view code.

Default path:
- Use helper constraints (`visibilityConstraints`, `widthConstraints`, `heightConstraints`, `spaceConstraints`, `groupConstraints`, `conditionalConstraints`)

Advanced path:
- Use `expr("...")` for custom rules

See also:
- `docs/guide/layout-decision-tree.md`
- `docs/guide/constraints.md`
- `docs/reference/constraints-api.md`

---

## 1) Import helpers

```ts
import {
  ui,
  visibilityConstraints,
  widthConstraints,
  heightConstraints,
  spaceConstraints,
  groupConstraints,
} from "@rezi-ui/core";
```

---

## 2) Responsive 3-panel shell (sidebar + main + detail rail)

```ts
ui.row({ gap: 1, width: "full", height: "full" }, [
  ui.box(
    {
      id: "nav",
      border: "single",
      p: 1,
      width: widthConstraints.clampedPercentOfParent({ ratio: 0.22, min: 18, max: 32 }),
      display: visibilityConstraints.viewportWidthAtLeast(70),
    },
    [ui.text("Navigation")],
  ),
  ui.box(
    {
      id: "main",
      border: "single",
      p: 1,
      width: spaceConstraints.remainingWidth({ subtract: [{ id: "nav" }, { id: "rail" }], minus: 2 }),
    },
    [ui.text("Main content")],
  ),
  ui.box(
    {
      id: "rail",
      border: "single",
      p: 1,
      width: widthConstraints.clampedPercentOfParent({ ratio: 0.28, min: 26, max: 44 }),
      display: visibilityConstraints.viewportAtLeast({ width: 110, height: 28 }),
    },
    [ui.text("Details")],
  ),
])
```

---

## 3) Equal-width labels (forms / inspectors)

```ts
ui.column({ gap: 1 }, [
  ui.row({ gap: 2 }, [
    ui.box({ id: "kv-key", width: groupConstraints.maxSiblingMinWidth("kv-key"), border: "none", p: 0 }, [
      ui.text("Latency", { dim: true }),
    ]),
    ui.text("12ms"),
  ]),
  ui.row({ gap: 2 }, [
    ui.box({ id: "kv-key", width: groupConstraints.maxSiblingMinWidth("kv-key"), border: "none", p: 0 }, [
      ui.text("Error Rate", { dim: true }),
    ]),
    ui.text("0.2%"),
  ]),
])
```

---

## 4) Intrinsic-aware modal sizing

```ts
ui.modal({
  id: "help",
  title: "Commands",
  width: widthConstraints.clampedIntrinsicPlus({ pad: 8, min: 44, max: "parent" }),
  height: heightConstraints.clampedIntrinsicPlus({ pad: 4, min: 10, max: "parent" }),
  content: ui.column({ gap: 1 }, [ui.text("q : quit"), ui.text("h : close")]),
})
```

---

## 5) Debug and validate

- For syntax/allowlist details, use `docs/reference/constraint-expressions.md`.
- For runtime diagnosis, use `docs/guide/debugging-constraints.md`.
- For PTY + frame-audit evidence, use `docs/dev/live-pty-debugging.md`.


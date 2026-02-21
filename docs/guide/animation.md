# Animation

Rezi supports declarative motion in two layers:

- **Hook-driven numeric animation** for custom widget behavior (`useTransition`, `useSpring`, `useSequence`, `useStagger`).
- **Container transitions** for layout/surface animation on `ui.box(...)` via the `transition` prop.

All animation APIs are deterministic for the same state/input sequence.

## Choose the right API

- Use `useTransition(...)` for direct time-based interpolation between numeric targets.
- Use `useSpring(...)` for natural motion that eases based on spring physics.
- Use `useSequence(...)` for keyframe timelines.
- Use `useStagger(...)` for list/rail entry timing offsets.
- Use `ui.box({ transition: ... })` when you want runtime-managed position/size/opacity transitions without writing hook logic.

## Hook example

```typescript
import { defineWidget, ui, useSequence, useSpring, useStagger, useTransition } from "@rezi-ui/core";

type ReactorProps = {
  driftTarget: number;
  fluxTarget: number;
  modules: readonly string[];
  key?: string;
};

export const ReactorRow = defineWidget<ReactorProps>((props, ctx) => {
  const drift = useTransition(ctx, props.driftTarget, { duration: 180, easing: "easeOutCubic" });
  const flux = useSpring(ctx, props.fluxTarget, { stiffness: 190, damping: 22 });
  const pulse = useSequence(ctx, [0.25, 1, 0.4, 0.9], { duration: 120, loop: true });
  const stagger = useStagger(ctx, props.modules, { delay: 40, duration: 180, easing: "easeOutCubic" });

  return ui.column({ gap: 1 }, [
    ui.text(`drift=${drift.toFixed(2)} flux=${flux.toFixed(2)} pulse=${pulse.toFixed(2)}`),
    ui.row(
      { gap: 1 },
      props.modules.map((label, i) =>
        ui.box(
          {
            key: label,
            border: "rounded",
            p: 1,
            opacity: 0.3 + 0.7 * (stagger[i] ?? 0),
          },
          [ui.text(label)],
        ),
      ),
    ),
  ]);
});
```

## Box transition props

`ui.box(...)` supports declarative render-time transitions:

```typescript
ui.box(
  {
    id: "panel",
    width: state.expanded ? 48 : 28,
    opacity: state.focused ? 1 : 0.7,
    transition: {
      duration: 220,
      easing: "easeInOutCubic",
      properties: ["size", "opacity"],
    },
  },
  [ui.text("Animated panel")],
);
```

Behavior:

- `properties` defaults to `"all"` when omitted (`position`, `size`, and `opacity`).
- `properties: []` disables all animated tracks.
- `opacity` is clamped to `[0..1]`.
- Container transitions are currently supported on `box`.

## Defaults and safety

- Hook durations are normalized to safe non-negative integer milliseconds.
- `useTransition` default duration: `160ms`.
- `useSequence` default per-segment duration: `160ms`.
- `useStagger` defaults: `delay=40ms`, `duration=180ms`.
- `ui.box` transition default duration: `180ms`.
- Non-finite numeric targets snap safely instead of producing unstable interpolation.

## Performance guidance

- Drive animation from state targets; avoid ad-hoc timer loops in app/view code.
- Keep animated values numeric and local; derive display strings lazily in render.
- For large animated collections, combine `useStagger(...)` with windowing (`ui.virtualList(...)`) to cap visible work.

## Related

- [Hooks Reference](hooks-reference.md)
- [Composition](composition.md)
- [Box](../widgets/box.md)
- [Performance](performance.md)
- [Create Rezi templates](../getting-started/create-rezi.md)

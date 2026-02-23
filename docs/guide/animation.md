# Animation

Rezi supports declarative motion in two layers:

- **Hook-driven numeric animation** for custom widget behavior (`useTransition`, `useSpring`, `useSequence`, `useStagger`).
- **Container transitions** for layout/surface animation on `ui.box(...)` via the `transition` prop.
- **Completion callbacks** (`onComplete`) for animation chaining and side effects.

All animation APIs are deterministic for the same state/input sequence.

## Choose the right API

- Use `useTransition(...)` for direct time-based interpolation between numeric targets.
- Use `useSpring(...)` for natural motion that eases based on spring physics.
- Use `useSequence(...)` for keyframe timelines.
- Use `useStagger(...)` for list/rail entry timing offsets.
- Use `ui.box({ transition: ... })` when you want runtime-managed position/size/opacity transitions without writing hook logic.

## Easing Families and Usage

- **Quad**: subtle, low-energy transitions for small UI nudges.
- **Cubic**: standard default-feeling motion for most interactions.
- **Expo**: fast/snappy starts or finishes for high-energy transitions.
- **Back**: playful motion with overshoot before settling.
- **Bounce**: physical, elastic landing effects for celebratory or feedback moments.

## Easing Presets Reference (17)

| Preset | Family | Typical use |
|---|---|---|
| `linear` | linear | Utility animation, deterministic rate |
| `easeInQuad` | quad | Gentle acceleration in |
| `easeOutQuad` | quad | Gentle deceleration out |
| `easeInOutQuad` | quad | Soft in/out transitions |
| `easeInCubic` | cubic | Stronger acceleration |
| `easeOutCubic` | cubic | Standard UI deceleration |
| `easeInOutCubic` | cubic | Balanced default for panels/opacity |
| `easeInExpo` | expo | Snappy ramp-up |
| `easeOutExpo` | expo | Fast settle/finish |
| `easeInOutExpo` | expo | High-energy in/out |
| `easeInBack` | back | Anticipation before movement |
| `easeOutBack` | back | Overshoot then settle |
| `easeInOutBack` | back | Playful in/out overshoot |
| `easeInBounce` | bounce | Bounce into motion |
| `easeOutBounce` | bounce | Bounce on landing |
| `easeInOutBounce` | bounce | Bounce at both ends |
| `easeOutInBounce` | bounce | Out bounce + in bounce blend |

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
  const drift = useTransition(ctx, props.driftTarget, { duration: 180, easing: "easeOutExpo" });
  const flux = useSpring(ctx, props.fluxTarget, { stiffness: 190, damping: 22 });
  const pulse = useSequence(ctx, [0.25, 1, 0.4, 0.9], { duration: 120, loop: true });
  const stagger = useStagger(ctx, props.modules, { delay: 40, duration: 180, easing: "easeOutBounce" });

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

## Completion callbacks and chaining

All animation hooks support `onComplete` for finite runs.

```typescript
const opacity = useTransition(ctx, state.visible ? 1 : 0, {
  duration: 200,
  easing: "easeOutExpo",
  onComplete: () => {
    if (!state.visible) {
      app.update((s) => ({ ...s, hidden: true }));
    }
  },
});
```

Use this for deterministic animation chaining (for example: fade out -> remove node).

Notes:
- Retargeting mid-flight starts a new run and does not fire the previous run's `onComplete`.
- Looping animations do not fire `onComplete` because they do not terminate.

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

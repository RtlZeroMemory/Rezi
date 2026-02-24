# Animation

Rezi supports declarative motion in two layers:

- **Hook-driven numeric animation** for custom widget behavior (`useTransition`, `useSpring`, `useSequence`, `useStagger`, `useAnimatedValue`, `useParallel`, `useChain`).
- **Container transitions** for layout/surface animation on `ui.box(...)`, `ui.row(...)`, `ui.column(...)`, and `ui.grid(...)` via `transition`/`exitTransition` props.

All animation APIs are deterministic for the same state/input sequence.

## Choose the right API

- Use `useTransition(...)` for direct time-based interpolation between numeric targets.
- Use `useSpring(...)` for natural motion driven by spring physics.
- Use `useSequence(...)` for keyframe timelines.
- Use `useStagger(...)` for list/rail entry timing offsets.
- Use `useAnimatedValue(...)` when you need `value + velocity + isAnimating` metadata.
- Use `useParallel(...)` for multiple transitions that run together.
- Use `useChain(...)` for step-by-step transitions.
- Use container `transition` props when you want runtime-managed position/size/opacity transitions without writing hook logic.

## Easing Families and Usage

- **Linear**: constant-rate movement for utility transitions.
- **Quad**: subtle, low-energy transitions for small UI nudges.
- **Cubic**: standard default-feeling motion for most interactions.

## Easing Presets Reference

| Preset | Family | Typical use |
|---|---|---|
| `linear` | linear | Utility animation, deterministic rate |
| `easeInQuad` | quad | Gentle acceleration in |
| `easeOutQuad` | quad | Gentle deceleration out |
| `easeInOutQuad` | quad | Soft in/out transitions |
| `easeInCubic` | cubic | Stronger acceleration |
| `easeOutCubic` | cubic | Standard UI deceleration |
| `easeInOutCubic` | cubic | Balanced default for panels/opacity |

## Hook Example

```typescript
import {
  defineWidget,
  ui,
  useAnimatedValue,
  useSequence,
  useStagger,
} from "@rezi-ui/core";

type ReactorProps = {
  target: number;
  modules: readonly string[];
  key?: string;
};

export const ReactorRow = defineWidget<ReactorProps>((props, ctx) => {
  const energy = useAnimatedValue(ctx, props.target, {
    mode: "spring",
    spring: { stiffness: 190, damping: 22, onComplete: () => {} },
  });
  const pulse = useSequence(ctx, [0.25, 1, 0.4, 0.9], {
    duration: 120,
    loop: true,
    playback: { rate: 1 },
    onComplete: () => {},
  });
  const stagger = useStagger(ctx, props.modules, {
    delay: 40,
    duration: 180,
    easing: "easeOutCubic",
    onComplete: () => {},
  });

  return ui.column({ gap: 1 }, [
    ui.text(
      `value=${energy.value.toFixed(2)} vel=${energy.velocity.toFixed(2)} anim=${energy.isAnimating}`,
    ),
    ui.row(
      { gap: 1 },
      props.modules.map((label, i) =>
        ui.box(
          {
            key: label,
            border: "rounded",
            p: 1,
            opacity: (0.3 + 0.7 * (stagger[i] ?? 0)) * pulse,
          },
          [ui.text(label)],
        ),
      ),
    ),
  ]);
});
```

## Retargeting and Completion Semantics

- Retargeting mid-flight starts from the current interpolated value (no jump).
- Looping timelines (`useSequence(..., { loop: true })`) continue indefinitely.
- `onComplete` is supported on `useTransition`, `useSpring`, `useSequence`, `useStagger`, and `useAnimatedValue` configs.

## Container Transitions

Container widgets support declarative render-time transitions:

- `ui.box({ transition })`
- `ui.row({ transition })`
- `ui.column({ transition })`
- `ui.grid({ transition })`

```typescript
ui.row(
  {
    key: "status-row",
    gap: 1,
    transition: {
      duration: 220,
      easing: "easeInOutCubic",
      properties: ["position", "size"],
    },
  },
  [ui.text("Animated row")],
);
```

Behavior:

- `properties` defaults to `"all"` when omitted (`position`, `size`, and `opacity`).
- `properties: []` disables all transition tracks.
- `opacity` is clamped to `[0..1]`.
- Opacity animation currently affects `box` surfaces; `row`/`column`/`grid` opacity transitions are no-op and resolve to opacity `1`.

## Exit Animations

Use `exitTransition` to animate a container out before unmount cleanup:

```typescript
ui.box(
  {
    key: "toast",
    border: "rounded",
    p: 1,
    transition: { duration: 160, easing: "easeOutCubic" },
    exitTransition: { duration: 200, easing: "easeInCubic", properties: ["opacity"] },
  },
  [ui.text("Saved")],
);
```

Lifecycle:

- On removal, the runtime keeps the keyed subtree in an exit track.
- The exit node is rendered during the transition window.
- Exit nodes do **not** participate in focus traversal or hit-testing metadata.
- When exit duration completes, deferred local-state cleanup runs and the subtree is removed.
- If the same keyed node reappears before completion, the exit animation is canceled.

## Playback Control

`useTransition` and `useSequence` support:

```typescript
playback: {
  paused?: boolean;
  reversed?: boolean;
  rate?: number; // default 1
}
```

- `paused: true` freezes at the current sampled value.
- `reversed: true` runs timeline time backward.
- `rate` scales elapsed time (`0.5` half-speed, `2` double-speed).

## Color Interpolation

Use animation utilities for RGB interpolation:

```typescript
import { interpolateRgb, interpolateRgbArray } from "@rezi-ui/core";

const mid = interpolateRgb({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5);
const ramp = interpolateRgbArray({ r: 0, g: 40, b: 80 }, { r: 220, g: 200, b: 40 }, 8);
```

- Channels are linearly interpolated in RGB space.
- Output channels are clamped to integer `[0..255]`.

## Orchestration

Use orchestration helpers for grouped transitions:

- `useParallel(ctx, animations)` runs multiple transitions concurrently and returns per-entry `{ value, isAnimating }`.
- `useChain(ctx, steps)` runs sequential transitions and returns `{ value, currentStep, isComplete }`.

## `useAnimatedValue`

`useAnimatedValue` composes transition/spring strategies behind one API:

```typescript
const animated = useAnimatedValue(ctx, target, {
  mode: "transition",
  transition: { duration: 180, easing: "easeOutCubic" },
});

animated.value;
animated.velocity;
animated.isAnimating;
```

## Defaults and Safety

- Hook durations are normalized to safe non-negative integer milliseconds.
- Hook delay defaults:
  - `useTransition`: `0ms`
  - `useSpring`: `0ms`
- `useTransition` default duration: `160ms`.
- `useSequence` default per-segment duration: `160ms`.
- `useStagger` defaults: `delay=40ms`, `duration=180ms`.
- Container transition default duration: `180ms`.
- Non-finite numeric targets snap safely instead of producing unstable interpolation.

## Performance Guidance

- Drive animation from state targets; avoid ad-hoc timer loops in app/view code.
- Keep animated values numeric and local; derive display strings lazily in render.
- For large animated collections, combine `useStagger(...)` with windowing (`ui.virtualList(...)`) to cap visible work.

## Related

- [Hooks Reference](hooks-reference.md)
- [Composition](composition.md)
- [Box](../widgets/box.md)
- [Performance](performance.md)
- [Create Rezi templates](../getting-started/create-rezi.md)

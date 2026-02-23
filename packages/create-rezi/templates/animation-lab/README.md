# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Demonstrates

- Declarative animation hooks with first-class primitives: `useTransition`, `useSpring`, `useSequence`, `useStagger`.
- Animation completion callbacks (`onComplete`) for chained effects.
- New easing presets in action (`easeOutExpo`, `easeOutBounce`).
- Canvas-driven reactor visualization combined with charts, gauges, and staggered module rails.
- Reducer-managed animation targets with deterministic tick updates.
- Responsive layout that adapts to terminal resize events.
- Keyboard controls for autoplay, single-step, vector tuning, burst impulses, and palette cycling.

## File Layout

- `src/types.ts`: animation state and action contracts.
- `src/theme.ts`: template identity constants.
- `src/helpers/state.ts`: layout resolver + reducer transitions.
- `src/helpers/keybindings.ts`: key to command resolver.
- `src/screens/reactor-lab.ts`: reactor field screen renderer.
- `src/main.ts`: app bootstrap, resize handling, animation loop.
- `src/__tests__/`: reducer, render, and keybinding examples.

## Quickstart

```bash
# npm
npm install
npm run start

# bun
bun install
bun run start
```

## Controls

- `q` or `ctrl+c`: Quit
- `space` or `p`: Toggle autoplay
- `enter`: Step one tick
- Arrow keys: Nudge drift/flux/orbit vectors
- `b`: Burst impulse
- `r`: Randomized retarget
- `m`: Cycle color palette

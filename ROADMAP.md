# Roadmap

This roadmap is directional only. It is not a commitment to scope, ordering, or dates. Release decisions are based on shipped, tested behavior.

## Alpha direction (near term)

- Close remaining `createApp` lifecycle edge cases
- Continue frame coalescing and allocation reduction work
- Add targeted example applications

### Completed in Sprints 1-5

- Widget capability drift -> fixed via protocol registry.
- Narrow action model -> extended routed action model shipped.
- Overlay fragmentation -> unified overlay system shipped.
- DS recipe gap -> recipes wired across major interactive widgets.
- Animation lifecycle gap -> `onComplete` callback support added to animation hooks.

## Beta direction (medium term)

- Harden widget composition APIs (`defineWidget`)
- Expand recipes and patterns documentation
- Add CI benchmark regression tracking
- Evaluate plugin/extension architecture

## Stable direction (longer term)

- Explore additional runtime backends (for example Bun, Deno) via `@rezi-ui/core` portability
- Add platform capabilities as Zireael evolves
- Improve accessibility coverage
- Support a community widget ecosystem

# Roadmap

This roadmap is directional only. It is not a commitment to scope, ordering, or dates. Release decisions are based on shipped, tested behavior.

## Beta (current)

- Hold the documented API surface stable; batch any remaining breaking changes with migration notes
- Continue frame coalescing and allocation reduction work
- Harden widget composition APIs (`defineWidget`)
- Expand recipes and real-world examples; refresh the oldest documentation pages
- Deprecate raw string `expr(...)` constraints in favor of the typed constraint helpers

## Toward 1.0

- Graduate or prune `experimental`-tier widgets so the 1.0 surface is intentional
- Freeze drawlist and event protocol guarantees together with Zireael
- Streaming markdown widget and an agent-console template
- Developer tooling: layout, focus, and frame-timing inspection overlay
- Code coverage reporting and blocking benchmark regression gates in CI

## After 1.0

- WebAssembly build of the Zireael engine as a portable fallback and a browser embedding target
- Plugin and community widget ecosystem
- Additional runtime backends (for example Deno) via `@rezi-ui/core` portability
- Accessibility coverage improvements

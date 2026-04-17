# Contributing

The canonical contributor workflow lives in [docs/dev/contributing.md](docs/dev/contributing.md).

Before opening a pull request:

- Read [docs/dev/code-standards.md](docs/dev/code-standards.md).
- Read [docs/dev/testing.md](docs/dev/testing.md).
- Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test`.
- Run `npm run build:native` and `npm run test:native:smoke` when native code or native packaging is touched.

Use this root file as a pointer only; keep the detailed process in `docs/dev/contributing.md`.

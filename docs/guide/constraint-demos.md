# Constraint Demos

This page lists a runnable demo that uses the helper-first constraint layer in a realistic layout.

See also:
- `docs/getting-started/constraints-quickstart.md`
- `docs/reference/constraints-api.md`
- `docs/dev/live-pty-debugging.md` (frame-audit workflow)

---

## Demo: Starship (responsive multi-panel app shell)

- Source: `packages/create-rezi/templates/starship/src/`
- Highlights:
  - viewport-driven `display` constraints for rails/strips
  - helper-first visibility constraints inside a larger app-shell layout

Run:

```bash
npx tsx packages/create-rezi/templates/starship/src/main.ts
```

Keys:
- `1..6` switch routes
- `t` cycle theme
- `q` quit

Frame-audit (worker mode):

```bash
: > /tmp/rezi-frame-audit.ndjson
: > /tmp/starship.log
env -u NO_COLOR \
  REZI_STARSHIP_EXECUTION_MODE=worker \
  REZI_STARSHIP_DEBUG=1 \
  REZI_STARSHIP_DEBUG_LOG=/tmp/starship.log \
  REZI_FRAME_AUDIT=1 \
  REZI_FRAME_AUDIT_LOG=/tmp/rezi-frame-audit.ndjson \
  npx tsx packages/create-rezi/templates/starship/src/main.ts
node scripts/frame-audit-report.mjs /tmp/rezi-frame-audit.ndjson --latest-pid
```

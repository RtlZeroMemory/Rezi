# Text Style Internals

This page documents renderer-side text style behavior that is stable and test-covered.

## Merge Semantics (Tri-State)

Each boolean text attribute is merged independently with tri-state semantics:

- `undefined`: inherit from base style
- `false`: explicitly off
- `true`: explicitly on

This applies to all 8 boolean attrs:

- `bold`, `dim`, `italic`, `underline`, `inverse`, `strikethrough`, `overline`, `blink`

## Drawlist Attr Encoding (8-bit Layout)

Drawlist style encoding packs boolean attrs into the low 8 bits of `style.attrs` (`u32`):

- bit `0`: `bold`
- bit `1`: `italic`
- bit `2`: `underline`
- bit `3`: `inverse`
- bit `4`: `dim`
- bit `5`: `strikethrough`
- bit `6`: `overline`
- bit `7`: `blink`

Equivalent mask expression:

```text
attrs =
  (bold ? 1<<0 : 0) |
  (italic ? 1<<1 : 0) |
  (underline ? 1<<2 : 0) |
  (inverse ? 1<<3 : 0) |
  (dim ? 1<<4 : 0) |
  (strikethrough ? 1<<5 : 0) |
  (overline ? 1<<6 : 0) |
  (blink ? 1<<7 : 0)
```

The mapping is identical for `drawText(...)` and `drawTextRun(...)` segment styles.

## Terminal SGR Mapping

Terminal target SGR codes for the new attrs are:

- `strikethrough` -> `9`
- `overline` -> `53`
- `blink` -> `5`

Drawlist encoding carries these bits in `style.attrs`, and backend emission supports all three attrs (`strikethrough`, `overline`, `blink`) end-to-end. Terminal-visible behavior still depends on terminal support.

## Renderer Merge Cache (Fast Path)

`mergeTextStyle(base, override)` has a fast path when:

- `base === DEFAULT_BASE_STYLE`
- `override.fg` and `override.bg` are both `undefined`

In that case, the renderer computes a compact key from per-attr tri-state values and uses direct array indexing into `BASE_BOOL_STYLE_CACHE`.

Tri-state encoding per attr:

- `0` = `undefined` (inherit)
- `1` = `false`
- `2` = `true`

Key layout (2 bits per attr, 8 attrs total):

```text
key =
  b
  | (d  << 2)
  | (i  << 4)
  | (u  << 6)
  | (inv<< 8)
  | (s  << 10)
  | (o  << 12)
  | (bl << 14)
```

Cache sizing rationale:

- 8 attrs * 2 bits = 16-bit key space
- cache length is `65536` (`2^16`), so every possible key index is valid
- tri-state value set uses only `0..2` per 2-bit slot, so current reachable combinations are a subset (`3^8 = 6561`), with room for full direct addressing

Why this is used:

- avoids per-merge object churn for common default-base boolean-only style merges
- avoids hash-map overhead by using a fixed-size array lookup
- keeps object identity stable for repeated equivalent style inputs on the hot path

## Style Merge Cache Audit Notes

- Keyspace: direct-indexed 16-bit key (`0..65535`) derived from 8 attrs with 2-bit tri-state slots; currently reachable combinations are `3^8 = 6561`.
- Eviction policy: none. `BASE_BOOL_STYLE_CACHE` is fixed-size and entries remain resident for process lifetime once populated.
- Deterministic testing approach: verify repeatable key-to-result behavior with identity checks on cache fast-path merges and value-equality assertions for semantically equivalent merges.

### Baseline Lock

- Timestamp (UTC): `2026-02-18T11:24:56Z`
- Baseline branch: `style-merge-hardening` from `origin/main`
- Baseline HEAD: `a441bba78ddc99ece4eb76965ce36c0aec9225fe`
- Node/npm: `v20.19.5` / `10.8.2`
- Baseline full test count: `2488` passing tests

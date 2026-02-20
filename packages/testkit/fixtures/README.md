# @rezi-ui/testkit fixtures

This directory is the canonical home for **golden** test data used by protocol and runtime tests.

Fixtures live in `@rezi-ui/testkit` so that:
- `@rezi-ui/core` stays runtime-agnostic and free of filesystem assumptions.
- Tests can share stable, cross-platform byte fixtures.

## Directory layout

- `zrev-v1/` — ZREV v1 event batch fixtures (`*.bin`, `*.json`)
- `zrdl-v1/` — ZRDL v1 drawlist fixtures (`*.bin`, `*.json`)
- `zrdl-v3/` — ZRDL v3 drawlist fixtures (`*.bin`, `*.json`)
- `text-measure/` — pinned Unicode width fixtures (`*.json`)
- `layout/` — layout determinism fixtures (`*.json`)
- `focus/` — focus traversal golden fixtures (`*.json`)
- `routing/` — routing order fixtures (`*.json`)
- `repro/` — record/replay bundle fixtures (`*.json`)
- `terminal/` — terminal profile/capability fixtures (`*.json`)

## Naming conventions

- Binary fixtures: `*.bin` (raw bytes; little-endian, 4-byte aligned where required)
- JSON fixtures: `*.json` (UTF-8 text; stable key ordering in committed files)

Keep filenames descriptive and stable (prefer `kebab-case`).

## Golden update rules

See the testing guide for workflow details:
- [Testing](../../../docs/dev/testing.md)
- Tests **must not** auto-regenerate golden files.
- Updating a golden fixture is a **manual, intentional** change that must be reviewed.

When a golden fixture needs to change:
1) Update the fixture file in this directory by hand (or by running a one-off local script you do not commit).
2) Re-run `npm run test` and verify byte-for-byte output matches the new golden.
3) Include the fixture diff in the PR review context.

## JSON schemas (selected)

### Text measurement: `text-measure/*.json`

Files:
- `text-measure/graphemes.json`
- `text-measure/strings.json`
- `text-measure/invalid-surrogates.json`

Schema:
```ts
type TextMeasureFixture = {
  schemaVersion: 1;
  cases: Array<{ name: string; text: string; width: number }>;
};
```

### Layout: `layout/layout_cases.json`

Schema:
```ts
type Rect = { x: number; y: number; w: number; h: number };
type Axis = "row" | "column";

type FixtureVNode =
  | { ref: string; kind: "text"; text: string; props?: unknown }
  | { ref: string; kind: "spacer"; props?: unknown }
  | { ref: string; kind: "button"; props: unknown }
  | { ref: string; kind: "row" | "column" | "box"; props?: unknown; children?: FixtureVNode[] };

type LayoutCase =
  | { name: string; axis: Axis; viewport: Rect; tree: FixtureVNode; expect: { rects: Record<string, Rect> } }
  | {
      name: string;
      axis: Axis;
      viewport: Rect;
      tree: FixtureVNode;
      expectFatal: { code: "ZRUI_INVALID_PROPS"; detail: string };
    };

type LayoutFixture = { schemaVersion: 1; cases: LayoutCase[] };
```

Notes:
- `tree.ref` is a fixture-only identifier used as the key in `expect.rects`.
- `tree.kind`/`props`/`children` are “VNode-like”; tests convert to real `@rezi-ui/core` `VNode`s.

### Hit testing: `layout/hit_test_cases.json`

Schema:
```ts
type Rect = { x: number; y: number; w: number; h: number };
type HitPoint = { x: number; y: number; expectedId: string | null };

type HitTestCase = {
  name: string;
  tree: FixtureVNode;
  layoutRects: Record<string, Rect>;
  points: HitPoint[];
};

type HitTestFixture = { schemaVersion: 1; cases: HitTestCase[] };
```

### Repro replay: `repro/*.json`

Files:
- `repro/replay_resize_tab_text.json`

Schema:
```ts
type ReproFixture = ReproBundleV1;
```

Notes:
- Fixtures are full `rezi-repro-v1` bundles, not partial fragments.
- `eventCapture.batches[*].bytesHex` stores the original ZREV bytes for deterministic replay.

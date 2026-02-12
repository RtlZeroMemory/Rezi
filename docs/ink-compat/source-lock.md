# Ink Source Lock

## Rezi Pass Baseline
- Rezi base branch: `origin/main`
- Rezi baseline SHA: `b2f357aa981270a2ae3528c3224bdfc0d0569fca`
- Pass branch: `feat/ink-compat-super-pass`
- Lock timestamp (UTC): `2026-02-12T16:03:32Z`

## Locked Ink Baseline (Parity Authority)
- npm package: [`ink@6.7.0`](https://www.npmjs.com/package/ink/v/6.7.0)
- npm publish timestamp: `2026-02-10T10:36:27.066Z`
- Ink tag: [`v6.7.0`](https://github.com/vadimdemedes/ink/releases/tag/v6.7.0)
- Ink source commit (tag peeled): [`135cb23ae3b7ca94918b1cd913682f6356f12c5c`](https://github.com/vadimdemedes/ink/tree/135cb23ae3b7ca94918b1cd913682f6356f12c5c)
- Ink remote HEAD at lock time (informational only): [`54c4e6518c392ab2bf81f006492756fe3291e1de`](https://github.com/vadimdemedes/ink/tree/54c4e6518c392ab2bf81f006492756fe3291e1de)

## Mandatory Upstream References
- Repository: <https://github.com/vadimdemedes/ink>
- Readme (master): <https://github.com/vadimdemedes/ink/blob/master/readme.md>
- Docs tree (master): <https://github.com/vadimdemedes/ink/tree/master/docs>
- npm package: <https://www.npmjs.com/package/ink>
- ink-testing-library: <https://github.com/vadimdemedes/ink-testing-library>

## Locked Permalink Set Used For This Pass
- API render/instance: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#api>
- Components: Text/Box/Newline/Spacer/Static/Transform:
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#text>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#box>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#newline>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#spacer>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#static>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#transform>
- Hooks:
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#useinputinputhandler-options>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#useapp>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestdin>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestdout>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestderr>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usefocusoptions>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usefocusmanager>
- Render + input source references:
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/render.ts>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/hooks/use-input.ts>
  - <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/components/App.tsx>

## Notes
- `master/docs` exists upstream, but `v6.7.0` source tree does not include a top-level `docs/` directory. For lock consistency, parity judgments in this pass use the locked `readme.md` + `src/**` permalinks above.
- All parity decisions and regression tests in this pass reference this lock.

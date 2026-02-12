# Ink-Compat Parity Matrix

Baseline: Ink `6.7.0` @ `135cb23ae3b7ca94918b1cd913682f6356f12c5c`

| Capability | Ink evidence | Adapter approach | Status | Invariants |
|---|---|---|---|---|
| `render(tree, options)` | [`readme#api`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#api), [`src/render.ts`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/render.ts) | Wrapped forwarder with stable instance contract | In scope | IKINV-001, IKINV-002, IKINV-007, IKINV-009 |
| Instance: `rerender/unmount/waitUntilExit/clear/cleanup` | [`src/render.ts`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/render.ts) | Wrapped forwarder + deterministic guards | In scope | IKINV-001, IKINV-002, IKINV-007, IKINV-008 |
| `<Box>` | [`readme#box`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#box) | Direct export | In scope | IKINV-003, IKINV-004, IKINV-009 |
| `<Text>` | [`readme#text`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#text) | Direct export | In scope | IKINV-003, IKINV-004, IKINV-009 |
| `<Newline>` | [`readme#newline`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#newline) | Direct export | In scope | IKINV-004, IKINV-009 |
| `<Spacer>` | [`readme#spacer`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#spacer) | Direct export | In scope | IKINV-004, IKINV-009 |
| `useApp` | [`readme#useapp`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#useapp) | Direct export | In scope | IKINV-001, IKINV-009 |
| `useInput` | [`readme#useinputinputhandler-options`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#useinputinputhandler-options), [`src/hooks/use-input.ts`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/hooks/use-input.ts) | Wrapped export with deterministic key normalization | In scope | IKINV-005, IKINV-009 |
| `useStdout/useStderr/useStdin` | [`readme#usestdout`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestdout), [`readme#usestderr`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestderr), [`readme#usestdin`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestdin) | Direct export | In scope | IKINV-007, IKINV-008, IKINV-009 |
| Core style props (`color/backgroundColor/bold/dim/underline`) | [`readme#text`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#text) | Delegated to Ink component behavior | In scope | IKINV-003, IKINV-004 |
| Non-TTY deterministic behavior | [`src/ink.tsx`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/ink.tsx) | Adapter tests + stable no-throw wrapper behavior | In scope | IKINV-008 |
| `<Static>` | [`readme#static`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#static) | Direct export | Tier-2 in scope | IKINV-004, IKINV-009 |
| `<Transform>` | [`readme#transform`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#transform) | Direct export | Tier-2 in scope | IKINV-004, IKINV-009 |
| `useFocus/useFocusManager` | [`readme#usefocusoptions`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usefocusoptions), [`readme#usefocusmanager`](https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usefocusmanager) | Direct export | Tier-2 in scope | IKINV-006, IKINV-009 |

import { assert, describe, test } from "@rezi-ui/testkit";
import type { TextStyle } from "../../index.js";
import {
  DEFAULT_BASE_STYLE,
  type ResolvedTextStyle,
  mergeTextStyle,
} from "../../renderer/renderToDrawlist/textStyle.js";

type ChainLevelStyle = TextStyle | undefined;

const ROOT_FG = { r: 11, g: 22, b: 33 };
const ROOT_BG = { r: 44, g: 55, b: 66 };
const BOX_FG = { r: 77, g: 88, b: 99 };
const BOX_BG = { r: 101, g: 111, b: 121 };
const ROW_BG = { r: 131, g: 141, b: 151 };
const ROW_FG = { r: 152, g: 162, b: 172 };
const TEXT_FG = { r: 181, g: 191, b: 201 };
const DEEP_BG = { r: 211, g: 212, b: 213 };

function resolveChain(levels: readonly ChainLevelStyle[]): ResolvedTextStyle {
  let resolved = DEFAULT_BASE_STYLE;
  for (const levelStyle of levels) resolved = mergeTextStyle(resolved, levelStyle);
  return resolved;
}

function resolveRootBoxRowText(
  root: ChainLevelStyle,
  box: ChainLevelStyle,
  row: ChainLevelStyle,
  text: ChainLevelStyle,
): ResolvedTextStyle {
  return resolveChain([root, box, row, text]);
}

describe("mergeTextStyle Root->Box->Row->Text inheritance", () => {
  test("inherits root fg/bg when Box, Row, and Text are unset", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, bold: true },
      undefined,
      undefined,
      undefined,
    );

    assert.deepEqual(resolved, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      bold: true,
    });
  });

  test("Box fg override wins while bg still inherits from Root", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG },
      { fg: BOX_FG },
      undefined,
      undefined,
    );

    assert.deepEqual(resolved, {
      fg: BOX_FG,
      bg: ROOT_BG,
    });
  });

  test("Row bg override wins while fg inherits from Box", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG },
      { fg: BOX_FG },
      { bg: ROW_BG },
      undefined,
    );

    assert.deepEqual(resolved, {
      fg: BOX_FG,
      bg: ROW_BG,
    });
  });

  test("Text override wins over Row/Box/Root and unset fields continue inheriting", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, underline: true, bold: true },
      { fg: BOX_FG, bold: false },
      { italic: true },
      { fg: TEXT_FG, bold: true },
    );

    assert.deepEqual(resolved, {
      fg: TEXT_FG,
      bg: ROOT_BG,
      bold: true,
      italic: true,
      underline: true,
    });
  });

  test("Text with no local overrides inherits nearest defined values", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, bold: true, dim: false },
      undefined,
      { italic: true },
      {},
    );

    assert.deepEqual(resolved, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      bold: true,
      dim: false,
      italic: true,
    });
  });

  test("Explicit false in Box overrides Root true through deeper unset descendants", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, underline: true },
      { underline: false },
      undefined,
      undefined,
    );

    assert.deepEqual(resolved, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      underline: false,
    });
  });

  test("Explicit true in Text overrides Root false", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, blink: false },
      undefined,
      { italic: true },
      { blink: true },
    );

    assert.deepEqual(resolved, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      italic: true,
      blink: true,
    });
  });

  test("fg/bg inheritance stays independent across levels with mixed overrides", () => {
    const resolved = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG },
      { fg: BOX_FG },
      { bg: ROW_BG, dim: true },
      { italic: true },
    );

    assert.deepEqual(resolved, {
      fg: BOX_FG,
      bg: ROW_BG,
      dim: true,
      italic: true,
    });
  });
});

describe("mergeTextStyle deep inheritance chains", () => {
  test("no-op undefined chain levels keep object identity stable", () => {
    const rootResolved = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      inverse: true,
    });

    const boxResolved = mergeTextStyle(rootResolved, undefined);
    const rowResolved = mergeTextStyle(boxResolved, undefined);
    const textResolved = mergeTextStyle(rowResolved, undefined);

    assert.equal(boxResolved === rootResolved, true);
    assert.equal(rowResolved === rootResolved, true);
    assert.equal(textResolved === rootResolved, true);
    assert.deepEqual(textResolved, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      inverse: true,
    });
  });

  test("8+ level chain resolves nearest ancestor values deterministically", () => {
    const resolved = resolveChain([
      { fg: ROOT_FG, bg: ROOT_BG, bold: true },
      { fg: BOX_FG },
      undefined,
      { bg: ROW_BG, italic: true },
      { fg: ROW_FG, underline: true },
      undefined,
      { bg: DEEP_BG, bold: false },
      { dim: true },
      { fg: TEXT_FG },
    ]);

    assert.deepEqual(resolved, {
      fg: TEXT_FG,
      bg: DEEP_BG,
      bold: false,
      dim: true,
      italic: true,
      underline: true,
    });
  });

  test("long undefined tail after deep chain preserves resolved object", () => {
    let resolved = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      overline: true,
    });
    const anchor = resolved;

    for (let i = 0; i < 64; i++) {
      resolved = mergeTextStyle(resolved, undefined);
    }

    assert.equal(resolved === anchor, true);
    assert.deepEqual(resolved, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      overline: true,
    });
  });

  test("very deep chain (512 levels) remains deterministic without stack/logic regressions", () => {
    let resolved = mergeTextStyle(DEFAULT_BASE_STYLE, { fg: ROOT_FG, bg: ROOT_BG });
    let expectedFg = ROOT_FG;
    let expectedBg = ROOT_BG;
    let expectedBlink: boolean | undefined;

    for (let level = 1; level <= 512; level++) {
      let override: TextStyle | undefined;
      if (level % 64 === 0) {
        const base = (level / 2) % 256;
        const nextFg = { r: base, g: (base + 1) % 256, b: (base + 2) % 256 };
        override = { fg: nextFg };
        expectedFg = nextFg;
      } else if (level % 45 === 0) {
        const base = (level * 3) % 256;
        const nextBg = { r: base, g: (base + 7) % 256, b: (base + 14) % 256 };
        override = { bg: nextBg };
        expectedBg = nextBg;
      } else if (level % 11 === 0) {
        const blink = level % 22 === 0;
        override = { blink };
        expectedBlink = blink;
      } else {
        override = undefined;
      }

      resolved = mergeTextStyle(resolved, override);
    }

    const expected: {
      fg: NonNullable<TextStyle["fg"]>;
      bg: NonNullable<TextStyle["bg"]>;
      blink?: boolean;
    } = {
      fg: expectedFg,
      bg: expectedBg,
    };
    if (expectedBlink !== undefined) expected.blink = expectedBlink;

    assert.deepEqual(resolved, expected);
  });
});

describe("mergeTextStyle recompute after middle style unset", () => {
  test("when Box fg is unset, descendants inherit Root fg after recompute", () => {
    const rootResolved = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ROOT_FG,
      bg: ROOT_BG,
    });

    const before = resolveChain([
      { fg: ROOT_FG, bg: ROOT_BG },
      { fg: BOX_FG },
      { italic: true },
      undefined,
    ]);
    assert.deepEqual(before.fg, BOX_FG);

    const boxUnset = mergeTextStyle(rootResolved, undefined);
    const rowResolved = mergeTextStyle(boxUnset, { italic: true });
    const after = mergeTextStyle(rowResolved, undefined);

    assert.deepEqual(after, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      italic: true,
    });
  });

  test("when Box bg is unset, descendants inherit Root bg after recompute", () => {
    const before = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG },
      { bg: BOX_BG },
      { fg: BOX_FG },
      undefined,
    );
    assert.deepEqual(before, {
      fg: BOX_FG,
      bg: BOX_BG,
    });

    const after = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG },
      undefined,
      { fg: BOX_FG },
      undefined,
    );

    assert.deepEqual(after, {
      fg: BOX_FG,
      bg: ROOT_BG,
    });
  });

  test("middle unset recompute keeps Text override but re-inherits Root for unset fields", () => {
    const before = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, bold: true },
      { fg: BOX_FG, bg: BOX_BG, bold: false },
      { underline: true },
      { fg: TEXT_FG },
    );
    assert.deepEqual(before, {
      fg: TEXT_FG,
      bg: BOX_BG,
      bold: false,
      underline: true,
    });

    const after = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, bold: true },
      undefined,
      { underline: true },
      { fg: TEXT_FG },
    );

    assert.deepEqual(after, {
      fg: TEXT_FG,
      bg: ROOT_BG,
      bold: true,
      underline: true,
    });
  });

  test("middle unset recompute restores higher-ancestor boolean when Text has no local override", () => {
    const before = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, bold: true },
      { bold: false },
      { italic: true },
      {},
    );
    assert.deepEqual(before, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      bold: false,
      italic: true,
    });

    const after = resolveRootBoxRowText(
      { fg: ROOT_FG, bg: ROOT_BG, bold: true },
      undefined,
      { italic: true },
      {},
    );

    assert.deepEqual(after, {
      fg: ROOT_FG,
      bg: ROOT_BG,
      bold: true,
      italic: true,
    });
  });
});

import { assert, describe, test } from "@rezi-ui/testkit";
import { styled } from "../styled.js";

describe("styled", () => {
  test("styled button merges base + variants into props.style", () => {
    const Button = styled("button", {
      base: { bold: true },
      variants: {
        intent: {
          primary: { fg: ((1 << 16) | (2 << 8) | 3) },
          danger: { fg: ((9 << 16) | (9 << 8) | 9) },
        },
      },
      defaults: { intent: "primary" },
    });

    const v = Button({ id: "b", label: "B" });
    assert.equal(v.kind, "button");
    assert.deepEqual((v.props as { style?: unknown }).style, {
      bold: true,
      fg: ((1 << 16) | (2 << 8) | 3),
    });
  });
});

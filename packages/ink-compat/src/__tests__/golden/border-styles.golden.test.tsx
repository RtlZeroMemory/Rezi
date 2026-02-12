import { assertBytesEqual, describe, readFixture, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Text } from "../../index.js";
import { renderToLastFrameBytes } from "./harness.js";

async function load(rel: string): Promise<Uint8Array> {
  return readFixture(`zrdl-v1/ink-compat/${rel}`);
}

describe("golden: ink-compat border styles", () => {
  test("border_styles.bin", async () => {
    const expected = await load("border_styles.bin");
    const actual = await renderToLastFrameBytes(
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round">
          <Text>round</Text>
        </Box>
        <Box borderStyle="double" borderTop={false}>
          <Text>double (no top)</Text>
        </Box>
        <Box borderStyle="bold">
          <Text>heavy</Text>
        </Box>
      </Box>,
    );
    assertBytesEqual(actual, expected, "border_styles.bin");
  });
});

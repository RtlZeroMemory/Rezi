/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Badge, Box, Button, Column, Divider, Row, Spacer, Text } from "../index.js";

describe("integration", () => {
  test("complex layout matches ui.* output", () => {
    const vnode = (
      <Column p={1} gap={1}>
        <Row gap={2}>
          <Text style={{ bold: true }}>Title</Text>
          <Spacer flex={1} />
          <Badge text="v1.0" variant="info" />
        </Row>
        <Divider />
        <Box border="rounded" p={1}>
          <Column gap={1}>
            <Button id="a" label="Action A" />
            <Button id="b" label="Action B" />
          </Column>
        </Box>
      </Column>
    );

    const factory = ui.column({ p: 1, gap: 1 }, [
      ui.row({ gap: 2 }, [
        ui.text("Title", { style: { bold: true } }),
        ui.spacer({ flex: 1 }),
        ui.badge("v1.0", { variant: "info" }),
      ]),
      ui.divider(),
      ui.box({ border: "rounded", p: 1 }, [
        ui.column({ gap: 1 }, [
          ui.button({ id: "a", label: "Action A" }),
          ui.button({ id: "b", label: "Action B" }),
        ]),
      ]),
    ]);

    assert.deepEqual(vnode, factory);
  });
});

/** @jsxImportSource @rezi-ui/jsx */

import { fluid, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import { Box, Column, Divider, Grid, HStack, Layers, Row, Spacer, Text, VStack } from "../index.js";

describe("layout components", () => {
  test("Box maps props and children", () => {
    const vnode = (
      <Box border="rounded" p={1} m={1} width={30} style={{ bold: true }}>
        <Text>inside</Text>
      </Box>
    );

    assert.deepEqual(
      vnode,
      ui.box({ border: "rounded", p: 1, m: 1, width: 30, style: { bold: true } }, [
        ui.text("inside"),
      ]),
    );
  });

  test("Box supports empty children", () => {
    const vnode = <Box border="single" />;
    assert.deepEqual(vnode, ui.box({ border: "single" }, []));
  });

  test("Box forwards advanced layout constraints", () => {
    const fluidWidth = fluid(10, 30);
    const vnode = (
      <Box
        gap={2}
        width={fluidWidth}
        flexShrink={2}
        flexBasis="50%"
        alignSelf="stretch"
        position="absolute"
        top={1}
        right={2}
        bottom={3}
        left={4}
        gridColumn={2}
        gridRow={1}
        colSpan={2}
        rowSpan={3}
      >
        <Text>inside</Text>
      </Box>
    );

    assert.deepEqual(
      vnode,
      ui.box(
        {
          gap: 2,
          width: fluidWidth,
          flexShrink: 2,
          flexBasis: "50%",
          alignSelf: "stretch",
          position: "absolute",
          top: 1,
          right: 2,
          bottom: 3,
          left: 4,
          gridColumn: 2,
          gridRow: 1,
          colSpan: 2,
          rowSpan: 3,
        },
        [ui.text("inside")],
      ),
    );
  });

  test("Row and Column map stack props", () => {
    const vnode = (
      <Column gap={1} p={1} mx={2} minWidth={20} wrap alignSelf="center" flexBasis="auto">
        <Row
          gap={2}
          justify="between"
          items="center"
          wrap
          flexShrink={1}
          flexBasis={8}
          alignSelf="end"
          position="absolute"
          top={1}
          left={2}
        >
          <Text>A</Text>
          <Text>B</Text>
        </Row>
      </Column>
    );

    assert.deepEqual(
      vnode,
      ui.column(
        { gap: 1, p: 1, mx: 2, minWidth: 20, wrap: true, alignSelf: "center", flexBasis: "auto" },
        [
          ui.row(
            {
              gap: 2,
              justify: "between",
              items: "center",
              wrap: true,
              flexShrink: 1,
              flexBasis: 8,
              alignSelf: "end",
              position: "absolute",
              top: 1,
              left: 2,
            },
            [ui.text("A"), ui.text("B")],
          ),
        ],
      ),
    );
  });

  test("Grid maps props and children", () => {
    const vnode = (
      <Grid columns={2} rowGap={1} columnGap={2}>
        <Text>A</Text>
        <Text>B</Text>
      </Grid>
    );

    assert.deepEqual(
      vnode,
      ui.grid({ columns: 2, rowGap: 1, columnGap: 2 }, ui.text("A"), ui.text("B")),
    );
  });

  test("Grid children forward explicit placement and span props", () => {
    const vnode = (
      <Grid columns={3} gap={1}>
        <Box gridColumn={2} gridRow={1} colSpan={2} rowSpan={2}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Grid>
    );

    assert.deepEqual(
      vnode,
      ui.grid(
        { columns: 3, gap: 1 },
        ui.box({ gridColumn: 2, gridRow: 1, colSpan: 2, rowSpan: 2 }, [ui.text("A")]),
        ui.text("B"),
      ),
    );
  });

  test("HStack and VStack map to helper defaults", () => {
    assert.deepEqual(
      <HStack>
        <Text>A</Text>
        <Text>B</Text>
      </HStack>,
      ui.hstack({}, [ui.text("A"), ui.text("B")]),
    );

    assert.deepEqual(
      <VStack gap={3}>
        <Text>A</Text>
      </VStack>,
      ui.vstack({ gap: 3 }, [ui.text("A")]),
    );
  });

  test("Grid/HStack/VStack normalize nullish and primitive children", () => {
    assert.deepEqual(
      <Grid columns={1}>
        {null}
        {false}
        {"x"}
        {1}
      </Grid>,
      ui.grid({ columns: 1 }, ui.text("x"), ui.text("1")),
    );

    assert.deepEqual(
      <HStack>
        {null}
        {false}
        {"h"}
      </HStack>,
      ui.hstack({}, [ui.text("h")]),
    );

    assert.deepEqual(
      <VStack>
        {false}
        {2}
      </VStack>,
      ui.vstack({}, [ui.text("2")]),
    );
  });

  test("Spacer and Divider are leaf widgets", () => {
    assert.deepEqual(<Spacer />, ui.spacer());
    assert.deepEqual(<Spacer size={2} flex={1} />, ui.spacer({ size: 2, flex: 1 }));
    assert.deepEqual(
      <Divider direction="horizontal" char="-" label="Section" color="cyan" />,
      ui.divider({ direction: "horizontal", char: "-", label: "Section", color: "cyan" }),
    );
  });

  test("Layers normalizes children including conditionals and maps", () => {
    const showOverlay = false;
    const items = [
      { id: "1", name: "Alpha" },
      { id: "2", name: "Beta" },
    ] as const;

    const vnode = (
      <Layers>
        <Column>
          {showOverlay && <Text>hidden</Text>}
          <Text>visible</Text>
          {items.map((item) => (
            <Text key={item.id}>{item.name}</Text>
          ))}
        </Column>
      </Layers>
    );

    assert.deepEqual(
      vnode,
      ui.layers([
        ui.column({}, [
          ui.text("visible"),
          ui.text("Alpha", { key: "1" }),
          ui.text("Beta", { key: "2" }),
        ]),
      ]),
    );
  });

  test("Column filters nullish children and wraps primitives", () => {
    const vnode = (
      <Column>
        {false}
        {null}
        {0}
        {""}
      </Column>
    );

    assert.deepEqual(vnode, ui.column({}, [ui.text("0"), ui.text("")]));
  });
});

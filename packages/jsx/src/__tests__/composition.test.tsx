/** @jsxImportSource @rezi-ui/jsx */

import type { RegisteredBinding, VNode } from "@rezi-ui/core";
import { createTestRenderer, ui } from "@rezi-ui/core";
import {
  Actions,
  AppShell,
  Button,
  Card,
  Center,
  Dialog,
  ErrorBoundary,
  FocusAnnouncer,
  Form,
  Header,
  KeybindingHelp,
  MasterDetail,
  Page,
  Panel,
  Sidebar,
  StatusBar,
  Text,
  Toolbar,
} from "@rezi-ui/jsx";
import { assert, describe, test } from "@rezi-ui/testkit";

const VIEWPORT = { cols: 80, rows: 24 } as const;

function assertRenderParity(jsxNode: VNode, coreNode: VNode): void {
  const jsxResult = createTestRenderer({ viewport: VIEWPORT }).render(jsxNode);
  const coreResult = createTestRenderer({ viewport: VIEWPORT }).render(coreNode);

  assert.equal(jsxResult.toText(), coreResult.toText());
  assert.deepEqual(jsxResult.ops, coreResult.ops);
}

describe("composition helpers", () => {
  test("Panel delegates to ui.panel", () => {
    const jsxNode = (
      <Panel title="Test">
        <Text>content</Text>
      </Panel>
    );
    assertRenderParity(jsxNode, ui.panel({ title: "Test" }, [ui.text("content")]));
  });

  test("Form delegates to ui.form", () => {
    const jsxNode = (
      <Form gap={2}>
        <Text>field</Text>
      </Form>
    );
    assertRenderParity(jsxNode, ui.form({ gap: 2 }, [ui.text("field")]));
  });

  test("Actions delegates to ui.actions", () => {
    const jsxNode = (
      <Actions>
        <Button id="save" label="Save" />
      </Actions>
    );
    assertRenderParity(jsxNode, ui.actions({}, [ui.button({ id: "save", label: "Save" })]));
  });

  test("Center delegates to ui.center", () => {
    const child = <Text>child</Text>;
    const jsxNode = <Center>{child}</Center>;
    assertRenderParity(jsxNode, ui.center(ui.text("child"), {}));
  });

  test("Page delegates to ui.page", () => {
    const header = <Text>Header</Text>;
    const body = <Text>Body</Text>;
    const footer = <Text>Footer</Text>;

    const jsxNode = <Page header={header} body={body} footer={footer} gap={2} p={1} />;
    assertRenderParity(
      jsxNode,
      ui.page({
        header: ui.text("Header"),
        body: ui.text("Body"),
        footer: ui.text("Footer"),
        gap: 2,
        p: 1,
      }),
    );
  });

  test("AppShell delegates with and without sidebar", () => {
    const withSidebarJsx = (
      <AppShell
        header={<Text>Header</Text>}
        sidebar={{ content: <Text>Nav</Text>, width: 20 }}
        body={<Text>Body</Text>}
        footer={<Text>Footer</Text>}
        p={1}
        gap={2}
      />
    );

    assertRenderParity(
      withSidebarJsx,
      ui.appShell({
        header: ui.text("Header"),
        sidebar: { content: ui.text("Nav"), width: 20 },
        body: ui.text("Body"),
        footer: ui.text("Footer"),
        p: 1,
        gap: 2,
      }),
    );

    const withoutSidebarJsx = <AppShell body={<Text>Body</Text>} />;
    assertRenderParity(withoutSidebarJsx, ui.appShell({ body: ui.text("Body") }));
  });

  test("Card delegates to ui.card", () => {
    const jsxNode = (
      <Card title="Card" subtitle="Sub" actions={[<Button id="x" label="X" key="x" />]}>
        <Text>Body</Text>
      </Card>
    );

    assertRenderParity(
      jsxNode,
      ui.card(
        {
          title: "Card",
          subtitle: "Sub",
          actions: [ui.button({ id: "x", label: "X", key: "x" })],
        },
        [ui.text("Body")],
      ),
    );
  });

  test("Toolbar delegates to ui.toolbar", () => {
    const jsxNode = (
      <Toolbar gap={2}>
        <Button id="save" label="Save" />
      </Toolbar>
    );

    assertRenderParity(jsxNode, ui.toolbar({ gap: 2 }, [ui.button({ id: "save", label: "Save" })]));
  });

  test("StatusBar delegates to ui.statusBar", () => {
    const jsxNode = (
      <StatusBar left={[<Text key="l">Left</Text>]} right={[<Text key="r">Right</Text>]} />
    );
    assertRenderParity(
      jsxNode,
      ui.statusBar({
        left: [ui.text("Left", { key: "l" })],
        right: [ui.text("Right", { key: "r" })],
      }),
    );
  });

  test("Header delegates to ui.header", () => {
    const jsxNode = (
      <Header
        title="Title"
        subtitle="Subtitle"
        actions={[<Button id="a" label="Act" key="act" />]}
      />
    );

    assertRenderParity(
      jsxNode,
      ui.header({
        title: "Title",
        subtitle: "Subtitle",
        actions: [ui.button({ id: "a", label: "Act", key: "act" })],
      }),
    );
  });

  test("Sidebar delegates to ui.sidebar", () => {
    const jsxNode = (
      <Sidebar
        id="nav"
        items={[
          { id: "home", label: "Home" },
          { id: "settings", label: "Settings" },
        ]}
        selected="home"
      />
    );

    assertRenderParity(
      jsxNode,
      ui.sidebar({
        id: "nav",
        items: [
          { id: "home", label: "Home" },
          { id: "settings", label: "Settings" },
        ],
        selected: "home",
      }),
    );
  });

  test("MasterDetail delegates to ui.masterDetail", () => {
    const jsxNode = (
      <MasterDetail master={<Text>Master</Text>} detail={<Text>Detail</Text>} gap={2} />
    );
    assertRenderParity(
      jsxNode,
      ui.masterDetail({ master: ui.text("Master"), detail: ui.text("Detail"), gap: 2 }),
    );
  });

  test("Dialog delegates to ui.dialog", () => {
    const onConfirm = () => {};
    const onCancel = () => {};

    const jsxNode = (
      <Dialog
        id="confirm"
        title="Confirm"
        message="Proceed?"
        actions={[
          { label: "Confirm", intent: "primary", onPress: onConfirm },
          { label: "Cancel", onPress: onCancel },
        ]}
      />
    );

    assertRenderParity(
      jsxNode,
      ui.dialog({
        id: "confirm",
        title: "Confirm",
        message: "Proceed?",
        actions: [
          { label: "Confirm", intent: "primary", onPress: onConfirm },
          { label: "Cancel", onPress: onCancel },
        ],
      }),
    );
  });

  test("ErrorBoundary delegates to ui.errorBoundary", () => {
    const fallback = () => ui.text("fallback");
    const jsxNode = (
      <ErrorBoundary fallback={fallback}>
        <Text>Risky</Text>
      </ErrorBoundary>
    );

    assertRenderParity(jsxNode, ui.errorBoundary({ children: ui.text("Risky"), fallback }));
  });

  test("FocusAnnouncer delegates to ui.focusAnnouncer", () => {
    const jsxNode = <FocusAnnouncer emptyText="No focus" />;
    assertRenderParity(jsxNode, ui.focusAnnouncer({ emptyText: "No focus" }));
  });

  test("KeybindingHelp delegates to ui.keybindingHelp", () => {
    const bindings: readonly RegisteredBinding[] = [
      { sequence: "ctrl+s", mode: "default", description: "Save" },
      { sequence: "ctrl+p", mode: "default", description: "Open" },
    ];

    const jsxNode = (
      <KeybindingHelp
        bindings={bindings}
        title="Shortcuts"
        emptyText="None"
        showMode={false}
        sort
      />
    );

    assertRenderParity(
      jsxNode,
      ui.keybindingHelp(bindings, {
        title: "Shortcuts",
        emptyText: "None",
        showMode: false,
        sort: true,
      }),
    );
  });
});

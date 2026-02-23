/** @jsxImportSource @rezi-ui/jsx */

import type { RegisteredBinding } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
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
} from "../index.js";

function replaceFunctions(value: unknown): unknown {
  if (typeof value === "function") {
    return "[function]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceFunctions(entry));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceFunctions(v);
    }
    return out;
  }
  return value;
}

describe("composition helpers", () => {
  test("Panel delegates to ui.panel", () => {
    const vnode = (
      <Panel title="Test">
        <Text>content</Text>
      </Panel>
    );
    assert.deepEqual(vnode, ui.panel({ title: "Test" }, [ui.text("content")]));
  });

  test("Form delegates to ui.form", () => {
    const vnode = (
      <Form gap={2}>
        <Text>field</Text>
      </Form>
    );
    assert.deepEqual(vnode, ui.form({ gap: 2 }, [ui.text("field")]));
  });

  test("Actions delegates to ui.actions", () => {
    const vnode = (
      <Actions>
        <Button id="save" label="Save" />
      </Actions>
    );
    assert.deepEqual(vnode, ui.actions({}, [ui.button({ id: "save", label: "Save" })]));
  });

  test("Center delegates to ui.center", () => {
    const child = <Text>child</Text>;
    const vnode = <Center>{child}</Center>;
    assert.deepEqual(vnode, ui.center(ui.text("child"), {}));
  });

  test("Page delegates to ui.page", () => {
    const header = <Text>Header</Text>;
    const body = <Text>Body</Text>;
    const footer = <Text>Footer</Text>;

    const vnode = <Page header={header} body={body} footer={footer} gap={2} p={1} />;
    assert.deepEqual(
      vnode,
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
    const withSidebar = (
      <AppShell
        header={<Text>Header</Text>}
        sidebar={{ content: <Text>Nav</Text>, width: 20 }}
        body={<Text>Body</Text>}
        footer={<Text>Footer</Text>}
        p={1}
        gap={2}
      />
    );

    assert.deepEqual(
      withSidebar,
      ui.appShell({
        header: ui.text("Header"),
        sidebar: { content: ui.text("Nav"), width: 20 },
        body: ui.text("Body"),
        footer: ui.text("Footer"),
        p: 1,
        gap: 2,
      }),
    );

    const withoutSidebar = <AppShell body={<Text>Body</Text>} />;
    assert.deepEqual(withoutSidebar, ui.appShell({ body: ui.text("Body") }));
  });

  test("Card delegates to ui.card", () => {
    const vnode = (
      <Card title="Card" subtitle="Sub" actions={[<Button id="x" label="X" key="x" />]}>
        <Text>Body</Text>
      </Card>
    );

    assert.deepEqual(
      vnode,
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
    const vnode = (
      <Toolbar gap={2}>
        <Button id="save" label="Save" />
      </Toolbar>
    );

    assert.deepEqual(vnode, ui.toolbar({ gap: 2 }, [ui.button({ id: "save", label: "Save" })]));
  });

  test("StatusBar delegates to ui.statusBar", () => {
    const vnode = (
      <StatusBar left={[<Text key="l">Left</Text>]} right={[<Text key="r">Right</Text>]} />
    );
    assert.deepEqual(
      vnode,
      ui.statusBar({
        left: [ui.text("Left", { key: "l" })],
        right: [ui.text("Right", { key: "r" })],
      }),
    );
  });

  test("Header delegates to ui.header", () => {
    const vnode = (
      <Header
        title="Title"
        subtitle="Subtitle"
        actions={[<Button id="a" label="Act" key="act" />]}
      />
    );

    assert.deepEqual(
      vnode,
      ui.header({
        title: "Title",
        subtitle: "Subtitle",
        actions: [ui.button({ id: "a", label: "Act", key: "act" })],
      }),
    );
  });

  test("Sidebar delegates to ui.sidebar", () => {
    const vnode = (
      <Sidebar
        id="nav"
        items={[
          { id: "home", label: "Home" },
          { id: "settings", label: "Settings" },
        ]}
        selected="home"
      />
    );

    assert.deepEqual(
      replaceFunctions(vnode),
      replaceFunctions(
        ui.sidebar({
          id: "nav",
          items: [
            { id: "home", label: "Home" },
            { id: "settings", label: "Settings" },
          ],
          selected: "home",
        }),
      ),
    );
  });

  test("MasterDetail delegates to ui.masterDetail", () => {
    const vnode = (
      <MasterDetail master={<Text>Master</Text>} detail={<Text>Detail</Text>} gap={2} />
    );
    assert.deepEqual(
      vnode,
      ui.masterDetail({ master: ui.text("Master"), detail: ui.text("Detail"), gap: 2 }),
    );
  });

  test("Dialog delegates to ui.dialog", () => {
    const onConfirm = () => {};
    const onCancel = () => {};

    const vnode = (
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

    assert.deepEqual(
      vnode,
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
    const vnode = (
      <ErrorBoundary fallback={fallback}>
        <Text>Risky</Text>
      </ErrorBoundary>
    );

    assert.deepEqual(vnode, ui.errorBoundary({ children: ui.text("Risky"), fallback }));
  });

  test("FocusAnnouncer delegates to ui.focusAnnouncer", () => {
    const vnode = <FocusAnnouncer emptyText="No focus" />;
    assert.deepEqual(vnode, ui.focusAnnouncer({ emptyText: "No focus" }));
  });

  test("KeybindingHelp delegates to ui.keybindingHelp", () => {
    const bindings: readonly RegisteredBinding[] = [
      { sequence: "ctrl+s", mode: "default", description: "Save" },
      { sequence: "ctrl+p", mode: "default", description: "Open" },
    ];

    const vnode = (
      <KeybindingHelp
        bindings={bindings}
        title="Shortcuts"
        emptyText="None"
        showMode={false}
        sort
      />
    );

    assert.deepEqual(
      vnode,
      ui.keybindingHelp(bindings, {
        title: "Shortcuts",
        emptyText: "None",
        showMode: false,
        sort: true,
      }),
    );
  });
});

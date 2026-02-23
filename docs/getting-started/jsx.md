# Using JSX

`@rezi-ui/jsx` is the native JSX runtime for Rezi. It maps JSX elements to the same VNode structures you get from `ui.*()`.

## Setup

1. Install packages:

```bash
npm install @rezi-ui/core @rezi-ui/jsx
```

2. Configure TypeScript:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rezi-ui/jsx"
  }
}
```

3. Use `.tsx` for files that contain JSX.

## Quick Example

```tsx
import { createNodeApp } from "@rezi-ui/node";
import { Button, Page, Panel, Row, Spacer, Text } from "@rezi-ui/jsx";

type State = { count: number };

const app = createNodeApp<State>({
  initialState: { count: 0 },
});

app.view((state) => (
  <Page
    p={1}
    gap={1}
    body={
      <Panel title="Counter">
        <Row gap={1} items="center">
          <Text variant="heading">Count: {state.count}</Text>
          <Spacer flex={1} />
          <Button id="dec" label="-1" intent="secondary" />
          <Button id="inc" label="+1" intent="primary" />
        </Row>
      </Panel>
    }
  />
));

app.keys({
  q: () => app.stop(),
});

await app.start();
```

## Complete Component Reference

All JSX components delegate to the equivalent `ui.*()` factory.

### Layout and Containers

| JSX | Core API |
|---|---|
| `<Box>` | `ui.box()` |
| `<Row>` | `ui.row()` |
| `<Column>` | `ui.column()` |
| `<Grid>` | `ui.grid()` |
| `<HStack>` | `ui.hstack()` |
| `<VStack>` | `ui.vstack()` |
| `<SpacedVStack>` | `ui.spacedVStack()` |
| `<SpacedHStack>` | `ui.spacedHStack()` |
| `<Layers>` | `ui.layers()` |
| `<FocusZone>` | `ui.focusZone()` |
| `<FocusTrap>` | `ui.focusTrap()` |
| `<SplitPane>` | `ui.splitPane()` |
| `<PanelGroup>` | `ui.panelGroup()` |
| `<ResizablePanel>` | `ui.resizablePanel()` |

### Text and Display

| JSX | Core API |
|---|---|
| `<Text>` | `ui.text()` |
| `<RichText>` | `ui.richText()` |
| `<Kbd>` | `ui.kbd()` |
| `<Icon>` | `ui.icon()` |
| `<Link>` | `ui.link()` |
| `<Canvas>` | `ui.canvas()` |
| `<Image>` | `ui.image()` |
| `<Divider>` | `ui.divider()` |
| `<Spacer>` | `ui.spacer()` |

### Indicators and Feedback

| JSX | Core API |
|---|---|
| `<Spinner>` | `ui.spinner()` |
| `<Progress>` | `ui.progress()` |
| `<Skeleton>` | `ui.skeleton()` |
| `<Badge>` | `ui.badge()` |
| `<Status>` | `ui.status()` |
| `<Tag>` | `ui.tag()` |
| `<Gauge>` | `ui.gauge()` |
| `<Empty>` | `ui.empty()` |
| `<ErrorDisplay>` | `ui.errorDisplay()` |
| `<ErrorBoundary>` | `ui.errorBoundary()` |
| `<Callout>` | `ui.callout()` |

### Charts and Graphics

| JSX | Core API |
|---|---|
| `<LineChart>` | `ui.lineChart()` |
| `<Scatter>` | `ui.scatter()` |
| `<Heatmap>` | `ui.heatmap()` |
| `<Sparkline>` | `ui.sparkline()` |
| `<BarChart>` | `ui.barChart()` |
| `<MiniChart>` | `ui.miniChart()` |

### Input and Forms

| JSX | Core API |
|---|---|
| `<Button>` | `ui.button()` |
| `<Input>` | `ui.input()` |
| `<Textarea>` | `ui.textarea()` |
| `<Slider>` | `ui.slider()` |
| `<Field>` | `ui.field()` |
| `<Select>` | `ui.select()` |
| `<Checkbox>` | `ui.checkbox()` |
| `<RadioGroup>` | `ui.radioGroup()` |

### Data and Lists

| JSX | Core API |
|---|---|
| `<Table>` | `ui.table()` |
| `<Tree>` | `ui.tree()` |
| `<VirtualList>` | `ui.virtualList()` |

### Navigation

| JSX | Core API |
|---|---|
| `<Tabs>` | `ui.tabs()` |
| `<Accordion>` | `ui.accordion()` |
| `<Breadcrumb>` | `ui.breadcrumb()` |
| `<Pagination>` | `ui.pagination()` |
| `<RouterBreadcrumb>` | `ui.routerBreadcrumb()` |
| `<RouterTabs>` | `ui.routerTabs()` |
| `<Sidebar>` | `ui.sidebar()` |

### Overlays

| JSX | Core API |
|---|---|
| `<Dialog>` | `ui.dialog()` |
| `<Modal>` | `ui.modal()` |
| `<Dropdown>` | `ui.dropdown()` |
| `<Layer>` | `ui.layer()` |
| `<ToastContainer>` | `ui.toastContainer()` |
| `<ToolApprovalDialog>` | `ui.toolApprovalDialog()` |
| `<FocusAnnouncer>` | `ui.focusAnnouncer()` |
| `<KeybindingHelp>` | `ui.keybindingHelp()` |

### Composition Helpers

| JSX | Core API |
|---|---|
| `<Panel>` | `ui.panel()` |
| `<Form>` | `ui.form()` |
| `<Actions>` | `ui.actions()` |
| `<Center>` | `ui.center()` |
| `<Page>` | `ui.page()` |
| `<AppShell>` | `ui.appShell()` |
| `<Card>` | `ui.card()` |
| `<Toolbar>` | `ui.toolbar()` |
| `<StatusBar>` | `ui.statusBar()` |
| `<Header>` | `ui.header()` |
| `<MasterDetail>` | `ui.masterDetail()` |

### Advanced

| JSX | Core API |
|---|---|
| `<CommandPalette>` | `ui.commandPalette()` |
| `<FilePicker>` | `ui.filePicker()` |
| `<FileTreeExplorer>` | `ui.fileTreeExplorer()` |
| `<CodeEditor>` | `ui.codeEditor()` |
| `<DiffViewer>` | `ui.diffViewer()` |
| `<LogsConsole>` | `ui.logsConsole()` |

## Design System Integration

Design system props work the same in JSX and `ui.*`.

```tsx
<Button id="save" label="Save" intent="primary" />
<Button id="delete" label="Delete" dsVariant="outline" dsTone="danger" />
<Input id="name" value={name} dsVariant="soft" dsTone="default" dsSize="md" />
<Select id="country" value={country} options={options} dsSize="sm" />
<Checkbox id="tos" checked={accepted} dsTone="primary" />
```

For buttons, `intent` is resolved through the same core logic as `ui.button()`.

## Layout Patterns in JSX

Use composition helpers for app-level structure:

- `<Page>` for full-page layouts with `header`/`body`/`footer`
- `<AppShell>` for app chrome + optional sidebar
- `<Panel>` and `<Card>` for grouped content
- `<Form>` and `<Actions>` for forms and action rows
- `<Toolbar>`, `<StatusBar>`, `<Header>`, `<Sidebar>`, `<MasterDetail>` for common shell/navigation patterns

## Children Handling

Container components (`Box`, `Row`, `Column`, etc.) normalize children as follows:

- `string` and `number` children become `Text` nodes
- `null`, `undefined`, and booleans are ignored
- Nested arrays are flattened

This lets mapped/conditional JSX work naturally.

## Fragments

Use fragment syntax when you need grouping without an explicit layout wrapper:

```tsx
<>
  <Text>Line 1</Text>
  <Text>Line 2</Text>
</>
```

`<Fragment>` is also available as an explicit component import.

## Conditional Rendering

Use core helpers inside JSX for explicit conditional logic:

```tsx
import { show, when, match, maybe } from "@rezi-ui/jsx";

<Column>
  {show(loading, <Spinner />)}
  {when(error !== null, () => <ErrorDisplay message={error!} />, () => <Text>Ready</Text>)}
  {maybe(user, (u) => <Text>{u.name}</Text>)}
  {match(status, {
    idle: () => <Text>Idle</Text>,
    running: () => <Spinner />,
    done: () => <Badge text="Done" />,
  })}
</Column>
```

## List Rendering

Use list helpers for deterministic keyed rendering:

```tsx
import { each, eachInline } from "@rezi-ui/jsx";

<Column>{each(items, (item) => <Text key={item.id}>{item.label}</Text>)}</Column>
<Text>{eachInline(tags, (tag) => <Tag key={tag} text={tag} />)}</Text>
```

## Function Components

```tsx
type StatProps = { label: string; value: string };

function Stat({ label, value }: StatProps) {
  return (
    <Row gap={1}>
      <Text variant="caption">{label}</Text>
      <Text>{value}</Text>
    </Row>
  );
}
```

## `defineWidget` Integration

`defineWidget` works with JSX return values:

```tsx
import { defineWidget } from "@rezi-ui/jsx";

const Counter = defineWidget<{ initial: number }>((props, ctx) => {
  const [count, setCount] = ctx.useState(props.initial);
  return (
    <Card title="Counter">
      <Row gap={1}>
        <Text>{count}</Text>
        <Button id={ctx.id("inc")} label="+1" intent="primary" onPress={() => setCount((v) => v + 1)} />
      </Row>
    </Card>
  );
});
```

## Intrinsic Elements

Lowercase intrinsic tags are supported and type-checked:

```tsx
<column gap={1}>
  <text>Intrinsic text</text>
  <button id="ok" label="OK" />
</column>
```

Intrinsic names match `ui.*` function names (for example: `statusBar`, `routerTabs`, `keybindingHelp`).

## `key` Prop

All JSX components support `key` for reconciliation.

- Use stable keys in mapped lists.
- `key` is forwarded to underlying VNode props.
- Fragment keys are supported.

## Type Imports

From `@rezi-ui/jsx`:

- JSX components (`Button`, `Page`, `Panel`, ...)
- JSX runtime helpers (`defineWidget`, `show`, `when`, `match`, `maybe`, `each`, `eachInline`)
- Re-exported core types used by JSX apps (`ButtonIntent`, `WidgetVariant`, `PageOptions`, `DialogProps`, etc.)

From `@rezi-ui/core`:

- Core runtime APIs outside JSX concerns (for example app creation backends and lower-level internals)
- Any additional advanced types not re-exported by `@rezi-ui/jsx`

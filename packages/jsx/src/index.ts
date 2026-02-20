/**
 * @rezi-ui/jsx — JSX runtime for Rezi TUI framework.
 *
 * Setup:
 *
 * 1. Add to tsconfig.json:
 *    {
 *      "compilerOptions": {
 *        "jsx": "react-jsx",
 *        "jsxImportSource": "@rezi-ui/jsx"
 *      }
 *    }
 *
 * 2. Or use a per-file pragma:
 *    /** @jsxImportSource @rezi-ui/jsx *\/
 *
 * 3. Write JSX:
 *    import { Column, Text, Button } from "@rezi-ui/jsx";
 *
 *    app.view((state) => (
 *      <Column p={1}>
 *        <Text>Hello {state.name}</Text>
 *        <Button id="ok" label="OK" />
 *      </Column>
 *    ));
 *
 * The JSX output is equivalent to `ui.*()` VNode construction.
 */

export {
  Accordion,
  Badge,
  BarChart,
  Breadcrumb,
  Box,
  Button,
  Canvas,
  Callout,
  Checkbox,
  CodeEditor,
  Column,
  CommandPalette,
  DiffViewer,
  Divider,
  Dropdown,
  Empty,
  ErrorDisplay,
  Field,
  FilePicker,
  FileTreeExplorer,
  FocusTrap,
  FocusZone,
  Fragment,
  Gauge,
  Grid,
  Heatmap,
  HStack,
  Icon,
  Image,
  Input,
  Kbd,
  Layer,
  Layers,
  LineChart,
  Link,
  LogsConsole,
  MiniChart,
  Modal,
  Pagination,
  PanelGroup,
  Progress,
  RadioGroup,
  ResizablePanel,
  RichText,
  Row,
  Select,
  Scatter,
  Skeleton,
  Slider,
  Spacer,
  Sparkline,
  Spinner,
  SplitPane,
  Status,
  Table,
  Tabs,
  Tag,
  Text,
  ToastContainer,
  ToolApprovalDialog,
  Tree,
  VStack,
  VirtualList,
} from "./components.js";

export { createElement, h } from "./createElement.js";

export {
  normalizeContainerChildren,
  normalizeTextChildren,
  type JsxChild,
  type JsxChildren,
  type JsxTextChild,
  type JsxTextChildren,
} from "./children.js";

export type {
  AccordionJsxProps,
  BadgeJsxProps,
  BarChartJsxProps,
  BreadcrumbJsxProps,
  BoxJsxProps,
  ButtonJsxProps,
  CanvasJsxProps,
  CalloutJsxProps,
  CheckboxJsxProps,
  CodeEditorJsxProps,
  ColumnJsxProps,
  CommandPaletteJsxProps,
  DiffViewerJsxProps,
  DividerJsxProps,
  DropdownJsxProps,
  EmptyJsxProps,
  ErrorDisplayJsxProps,
  FieldJsxProps,
  FilePickerJsxProps,
  FileTreeExplorerJsxProps,
  FocusTrapJsxProps,
  FocusZoneJsxProps,
  GaugeJsxProps,
  GridJsxProps,
  HeatmapJsxProps,
  HStackJsxProps,
  IconJsxProps,
  ImageJsxProps,
  InputJsxProps,
  KbdJsxProps,
  LayerJsxProps,
  LayersJsxProps,
  LineChartJsxProps,
  LinkJsxProps,
  LogsConsoleJsxProps,
  MiniChartJsxProps,
  ModalJsxProps,
  PaginationJsxProps,
  PanelGroupJsxProps,
  ProgressJsxProps,
  RadioGroupJsxProps,
  ResizablePanelJsxProps,
  RichTextJsxProps,
  RowJsxProps,
  SelectJsxProps,
  ScatterJsxProps,
  SkeletonJsxProps,
  SliderJsxProps,
  SpacerJsxProps,
  SparklineJsxProps,
  SpinnerJsxProps,
  SplitPaneJsxProps,
  StatusJsxProps,
  TableJsxProps,
  TabsJsxProps,
  TagJsxProps,
  TextJsxProps,
  ToastContainerJsxProps,
  ToolApprovalDialogJsxProps,
  TreeJsxProps,
  VStackJsxProps,
  VirtualListJsxProps,
} from "./types.js";

export { rgb } from "@rezi-ui/core";

export type { Rgb, TextStyle, VNode } from "@rezi-ui/core";

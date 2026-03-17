import type { SpacingValue } from "../../layout/spacing-scale.js";
import type { LayoutConstraints, SizeConstraint, SizeConstraintAtom } from "../../layout/types.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { TextStyle } from "../style.js";
import type { VNode } from "../types.js";
import type { BoxProps } from "./base.js";

/* ========== Layer System (GitHub issue #117) ========== */

/** Backdrop style presets for modals and overlays. */
export type BackdropStyle = "none" | "dim" | "opaque";

/** Shared frame/surface styling for overlay widgets. */
export type OverlayFrameStyle = Readonly<{
  /** Surface background color. */
  background?: NonNullable<TextStyle["bg"]>;
  /** Default text/icon color for overlay content. */
  foreground?: NonNullable<TextStyle["fg"]>;
  /** Border color for framed overlays. */
  border?: NonNullable<TextStyle["fg"]>;
}>;

/** Extended modal backdrop config (preset-compatible). */
export type ModalBackdrop =
  | BackdropStyle
  | Readonly<{
      /** Backdrop variant (default: "dim"). */
      variant?: BackdropStyle;
      /** Optional dim-pattern character (default: "░", dim variant only). */
      pattern?: string;
      /** Optional backdrop foreground color. */
      foreground?: NonNullable<TextStyle["fg"]>;
      /** Optional backdrop background color. */
      background?: NonNullable<TextStyle["bg"]>;
    }>;

/** Position for dropdown relative to anchor. */
export type DropdownPosition =
  | "below-start"
  | "below-center"
  | "below-end"
  | "above-start"
  | "above-center"
  | "above-end";

/** Props for layers container. Stacks children with later items on top. */
export type LayersProps = Readonly<{
  key?: string;
}>;

/** Props for modal overlay. Centered with optional backdrop and focus trap. */
export type ModalProps = Readonly<{
  id: string;
  key?: string;
  /** Optional title rendered in modal header. */
  title?: string;
  /** Main content of the modal. */
  content: VNode;
  /** Action buttons rendered in modal footer. */
  actions?: readonly VNode[];
  /** Modal width sizing. Supports fixed values, "auto", "full", `fluid(...)`, or `expr(...)`. */
  width?: SizeConstraintAtom;
  /** Modal height sizing. Supports fixed values, "full", `fluid(...)`, or `expr(...)` (no "auto" height). */
  height?: Exclude<SizeConstraintAtom, "auto">;
  /** Maximum width bound (cells, "full", `fluid(...)`, or `expr(...)`). */
  maxWidth?: Exclude<SizeConstraintAtom, "auto">;
  /** Minimum width bound (cells, "full", `fluid(...)`, or `expr(...)`). */
  minWidth?: Exclude<SizeConstraintAtom, "auto">;
  /** Minimum height bound (cells, "full", `fluid(...)`, or `expr(...)`). */
  minHeight?: Exclude<SizeConstraintAtom, "auto">;
  /** Frame/surface colors for modal body and border. */
  frameStyle?: OverlayFrameStyle;
  /** Backdrop style/config (default: "dim"). */
  backdrop?: ModalBackdrop;
  /** Close when backdrop is clicked (default: true). */
  closeOnBackdrop?: boolean;
  /** Close when ESC is pressed (default: true). */
  closeOnEscape?: boolean;
  /** Callback when modal should close. */
  onClose?: () => void;
  /** ID of element to focus when modal opens. */
  initialFocus?: string;
  /** ID of element to return focus to when modal closes. */
  returnFocusTo?: string;
}>;

/** Intent hint for declarative dialog actions. */
export type DialogActionIntent = "primary" | "danger";

/** Action descriptor for declarative dialog buttons. */
export type DialogAction = Readonly<{
  id?: string;
  label: string;
  intent?: DialogActionIntent;
  onPress: () => void;
  disabled?: boolean;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
}>;

/** Declarative dialog props sugar over `ui.modal(...)`. */
export type DialogProps = Readonly<
  Omit<ModalProps, "content" | "actions"> & {
    message: string | VNode;
    actions: readonly DialogAction[];
  }
>;

export type AppShellSidebar = Readonly<{
  content: VNode;
  /** Sidebar width. Supports fixed values, "full", `fluid(...)`, or `expr(...)`. */
  width?: SizeConstraint;
}>;

export type AppShellOptions = Readonly<
  {
    id?: string;
    key?: string;
    /** Header content — typically title text, badges, action buttons */
    header?: VNode | null;
    /** Sidebar content — typically navigation */
    sidebar?: AppShellSidebar | null;
    /** Main body content */
    body: VNode;
    /** Footer/status bar content */
    footer?: VNode | null;
    /** Padding around the shell (default: 1) */
    p?: SpacingValue;
    /** Gap between sections (default: 1) */
    gap?: number;
  } & LayoutConstraints
>;

export type PageOptions = Readonly<
  {
    id?: string;
    key?: string;
    header?: VNode | null;
    body: VNode;
    footer?: VNode | null;
    gap?: SpacingValue;
    p?: SpacingValue;
  } & LayoutConstraints
>;

export type CardOptions = Readonly<{
  id?: string;
  key?: string;
  title?: string;
  subtitle?: string;
  actions?: readonly VNode[];
  border?: BoxProps["border"];
  p?: SpacingValue;
  gap?: number;
  style?: TextStyle;
}>;

export type ToolbarOptions = Readonly<{
  id?: string;
  key?: string;
  gap?: number;
}>;

export type StatusBarOptions = Readonly<{
  id?: string;
  key?: string;
  left?: readonly VNode[];
  right?: readonly VNode[];
  style?: TextStyle;
}>;

export type HeaderOptions = Readonly<{
  id?: string;
  key?: string;
  title: string;
  subtitle?: string;
  actions?: readonly VNode[];
}>;

export type SidebarItem = Readonly<{
  id: string;
  label: string;
  icon?: string;
}>;

export type SidebarOptions = Readonly<{
  id?: string;
  key?: string;
  items: readonly SidebarItem[];
  selected?: string;
  onSelect?: (id: string) => void;
  width?: number;
  title?: string;
}>;

export type MasterDetailOptions = Readonly<{
  id?: string;
  key?: string;
  master: VNode;
  detail: VNode;
  masterWidth?: number;
  gap?: number;
}>;

/** Dropdown menu item. */
export type DropdownItem = Readonly<{
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Render as a divider instead of a selectable item. */
  divider?: boolean;
}>;

/** Props for dropdown menu. Positioned relative to an anchor element. */
export type DropdownProps = Readonly<{
  id: string;
  key?: string;
  /** ID of the anchor element to position relative to. */
  anchorId: string;
  /** Position relative to anchor (default: "below-start"). */
  position?: DropdownPosition;
  /** Frame/surface colors for dropdown background, text, and border. */
  frameStyle?: OverlayFrameStyle;
  /** Menu items to render. */
  items: readonly DropdownItem[];
  /** Callback when an item is selected. */
  onSelect?: (item: DropdownItem) => void;
  /** Callback when dropdown should close. */
  onClose?: () => void;
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

/** Props for a layer in the layer stack. */
export type LayerProps = Readonly<{
  id: string;
  key?: string;
  /**
   * Z-index for layer ordering (higher = on top). Default is insertion order.
   * Values are truncated to integers and clamped to `±9,007,199,253` for deterministic ordering.
   */
  zIndex?: number;
  /** Frame/surface colors for the layer container. */
  frameStyle?: OverlayFrameStyle;
  /** Backdrop to render behind content. */
  backdrop?: BackdropStyle;
  /** Whether layer blocks input to lower layers. */
  modal?: boolean;
  /** Whether layer should close on ESC key (default: true). */
  closeOnEscape?: boolean;
  /** Callback when layer should close. */
  onClose?: () => void;
  /** Content to render in the layer. */
  content: VNode;
}>;

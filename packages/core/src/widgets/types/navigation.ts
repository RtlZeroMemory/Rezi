import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { VNode } from "../types.js";

/* ========== Navigation Widgets ========== */

/** Tabs visual style variant. */
export type TabsVariant = "line" | "enclosed" | "pills";

/** Tabs bar position relative to content. */
export type TabsPosition = "top" | "bottom";

/** Tab item descriptor. */
export type TabsItem = Readonly<{
  key: string;
  label: string;
  content: VNode;
}>;

/** Props for tabs widget. */
export type TabsProps = Readonly<{
  id: string;
  key?: string;
  tabs: readonly TabsItem[];
  activeTab: string;
  onChange: (key: string) => void;
  variant?: TabsVariant;
  position?: TabsPosition;
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

/** Accordion item descriptor. */
export type AccordionItem = Readonly<{
  key: string;
  title: string;
  content: VNode;
}>;

/** Props for accordion widget. */
export type AccordionProps = Readonly<{
  id: string;
  key?: string;
  items: readonly AccordionItem[];
  expanded: readonly string[];
  onChange: (expanded: readonly string[]) => void;
  allowMultiple?: boolean;
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

/** Breadcrumb item descriptor. */
export type BreadcrumbItem = Readonly<{
  label: string;
  onPress?: () => void;
}>;

/** Props for breadcrumb widget. */
export type BreadcrumbProps = Readonly<{
  id?: string;
  key?: string;
  items: readonly BreadcrumbItem[];
  separator?: string;
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

/** Props for pagination widget. */
export type PaginationProps = Readonly<{
  id: string;
  key?: string;
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  showFirstLast?: boolean;
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

import type { FocusConfig } from "../../focus/styles.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { TextStyle } from "../style.js";
import type { VNode } from "../types.js";

/* ========== Form Widgets (GitHub issue #119) ========== */

/** Option for select and radio group widgets. */
export type SelectOption = Readonly<{
  /** Option value used in form state. */
  value: string;
  /** Display label for the option. */
  label: string;
  /** Whether this option is disabled. */
  disabled?: boolean;
}>;

/** Props for field wrapper widget. Wraps an input with label, error, and hint. */
export type FieldProps = Readonly<{
  key?: string;
  /** Field label displayed above the input. */
  label: string;
  /** Error message to display below the input. */
  error?: string;
  /** Whether the field is required (shows asterisk). */
  required?: boolean;
  /** Help text displayed below the input. */
  hint?: string;
  /** The wrapped input widget. */
  children: VNode;
}>;

/** Props for select dropdown widget. */
export type SelectProps = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Currently selected value. */
  value: string;
  /** Available options. */
  options: readonly SelectOption[];
  /** Callback when selection changes. */
  onChange?: (value: string) => void;
  /** Whether the select is disabled. */
  disabled?: boolean;
  /** Placeholder text when no value is selected. */
  placeholder?: string;
  /** Whether to show the select in an error state. */
  error?: boolean;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Design system: visual variant (reserved for future select recipes). */
  dsVariant?: WidgetVariant;
  /** Design system: tone (reserved for future select recipes). */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

/** Props for slider widget. */
export type SliderProps = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Current slider value. */
  value: number;
  /** Minimum value (default: 0). */
  min?: number;
  /** Maximum value (default: 100). */
  max?: number;
  /** Step increment for keyboard changes (default: 1). */
  step?: number;
  /** Optional fixed track width in cells (default: fills available width). */
  width?: number;
  /** Optional label shown before the track. */
  label?: string;
  /** Show numeric value text (default: true). */
  showValue?: boolean;
  /** Callback when value changes. */
  onChange?: (value: number) => void;
  /** Whether the slider is disabled. */
  disabled?: boolean;
  /** Whether the slider is read-only (focusable but non-editable). */
  readOnly?: boolean;
  /** Optional style applied to label/value text. */
  style?: TextStyle;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
}>;

/** Props for checkbox widget. */
export type CheckboxProps = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Whether the checkbox is checked. */
  checked: boolean;
  /** Label displayed next to the checkbox. */
  label?: string;
  /** Callback when checked state changes. */
  onChange?: (checked: boolean) => void;
  /** Whether the checkbox is disabled. */
  disabled?: boolean;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Design system: tone for checked/focus rendering. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

/** Props for radio group widget. */
export type RadioGroupProps = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Currently selected value. */
  value: string;
  /** Available options. */
  options: readonly SelectOption[];
  /** Callback when selection changes. */
  onChange?: (value: string) => void;
  /** Layout direction. */
  direction?: "horizontal" | "vertical";
  /** Whether the radio group is disabled. */
  disabled?: boolean;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Design system: tone for selected/focus rendering. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}>;

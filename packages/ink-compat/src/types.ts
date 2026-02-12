import type { EventEmitter } from "node:events";
import type { ReactNode } from "react";
import type { ForegroundColorName as ChalkForegroundColorName } from "chalk";
import type { ForegroundColorName as AnsiForegroundColorName } from "ansi-styles";
import type { Boxes, BoxStyle } from "cli-boxes";
import type { Except, LiteralUnion } from "type-fest";
import type { KittyKeyboardOptions } from "./kittyKeyboard.js";
import type { Node as YogaNode } from "yoga-layout";

/**
Handy information about a key that was pressed.
*/
export type Key = {
	/**
	Up arrow key was pressed.
	*/
	upArrow: boolean;

	/**
	Down arrow key was pressed.
	*/
	downArrow: boolean;

	/**
	Left arrow key was pressed.
	*/
	leftArrow: boolean;

	/**
	Right arrow key was pressed.
	*/
	rightArrow: boolean;

	/**
	Page Down key was pressed.
	*/
	pageDown: boolean;

	/**
	Page Up key was pressed.
	*/
	pageUp: boolean;

	/**
	Home key was pressed.
	*/
	home: boolean;

	/**
	End key was pressed.
	*/
	end: boolean;

	/**
	Return (Enter) key was pressed.
	*/
	return: boolean;

	/**
	Escape key was pressed.
	*/
	escape: boolean;

	/**
	Ctrl key was pressed.
	*/
	ctrl: boolean;

	/**
	Shift key was pressed.
	*/
	shift: boolean;

	/**
	Tab key was pressed.
	*/
	tab: boolean;

	/**
	Backspace key was pressed.
	*/
	backspace: boolean;

	/**
	Delete key was pressed.
	*/
	delete: boolean;

	/**
	[Meta key](https://en.wikipedia.org/wiki/Meta_key) was pressed.
	*/
	meta: boolean;

	/**
	Super key (Cmd on Mac, Win on Windows) was pressed.

	Only available with kitty keyboard protocol.
	*/
	super: boolean;

	/**
	Hyper key was pressed.

	Only available with kitty keyboard protocol.
	*/
	hyper: boolean;

	/**
	Caps Lock is active.

	Only available with kitty keyboard protocol.
	*/
	capsLock: boolean;

	/**
	Num Lock is active.

	Only available with kitty keyboard protocol.
	*/
	numLock: boolean;

	/**
	Event type for key events.

	Only available with kitty keyboard protocol.
	*/
	eventType?: "press" | "repeat" | "release";
};

export type Styles = {
	readonly textWrap?:
		| "wrap"
		| "end"
		| "middle"
		| "truncate-end"
		| "truncate"
		| "truncate-middle"
		| "truncate-start";

	readonly position?: "absolute" | "relative";

	/**
	Size of the gap between an element's columns.
	*/
	readonly columnGap?: number;

	/**
	Size of the gap between an element's rows.
	*/
	readonly rowGap?: number;

	/**
	Size of the gap between an element's columns and rows. A shorthand for `columnGap` and `rowGap`.
	*/
	readonly gap?: number;

	/**
	Margin on all sides. Equivalent to setting `marginTop`, `marginBottom`, `marginLeft`, and `marginRight`.
	*/
	readonly margin?: number;

	/**
	Horizontal margin. Equivalent to setting `marginLeft` and `marginRight`.
	*/
	readonly marginX?: number;

	/**
	Vertical margin. Equivalent to setting `marginTop` and `marginBottom`.
	*/
	readonly marginY?: number;

	/**
	Top margin.
	*/
	readonly marginTop?: number;

	/**
	Bottom margin.
	*/
	readonly marginBottom?: number;

	/**
	Left margin.
	*/
	readonly marginLeft?: number;

	/**
	Right margin.
	*/
	readonly marginRight?: number;

	/**
	Padding on all sides. Equivalent to setting `paddingTop`, `paddingBottom`, `paddingLeft`, and `paddingRight`.
	*/
	readonly padding?: number;

	/**
	Horizontal padding. Equivalent to setting `paddingLeft` and `paddingRight`.
	*/
	readonly paddingX?: number;

	/**
	Vertical padding. Equivalent to setting `paddingTop` and `paddingBottom`.
	*/
	readonly paddingY?: number;

	/**
	Top padding.
	*/
	readonly paddingTop?: number;

	/**
	Bottom padding.
	*/
	readonly paddingBottom?: number;

	/**
	Left padding.
	*/
	readonly paddingLeft?: number;

	/**
	Right padding.
	*/
	readonly paddingRight?: number;

	/**
	This property defines the ability for a flex item to grow if necessary.
	See [flex-grow](https://css-tricks.com/almanac/properties/f/flex-grow/).
	*/
	readonly flexGrow?: number;

	/**
	It specifies the “flex shrink factor”, which determines how much the flex item will shrink relative to the rest of the flex items in the flex container when there isn’t enough space on the row.
	See [flex-shrink](https://css-tricks.com/almanac/properties/f/flex-shrink/).
	*/
	readonly flexShrink?: number;

	/**
	It establishes the main-axis, thus defining the direction flex items are placed in the flex container.
	See [flex-direction](https://css-tricks.com/almanac/properties/f/flex-direction/).
	*/
	readonly flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";

	/**
	It specifies the initial size of the flex item, before any available space is distributed according to the flex factors.
	See [flex-basis](https://css-tricks.com/almanac/properties/f/flex-basis/).
	*/
	readonly flexBasis?: number | string;

	/**
	It defines whether the flex items are forced in a single line or can be flowed into multiple lines. If set to multiple lines, it also defines the cross-axis which determines the direction new lines are stacked in.
	See [flex-wrap](https://css-tricks.com/almanac/properties/f/flex-wrap/).
	*/
	readonly flexWrap?: "nowrap" | "wrap" | "wrap-reverse";

	/**
	The align-items property defines the default behavior for how items are laid out along the cross axis (perpendicular to the main axis).
	See [align-items](https://css-tricks.com/almanac/properties/a/align-items/).
	*/
	readonly alignItems?: "flex-start" | "center" | "flex-end" | "stretch";

	/**
	It makes possible to override the align-items value for specific flex items.
	See [align-self](https://css-tricks.com/almanac/properties/a/align-self/).
	*/
	readonly alignSelf?: "flex-start" | "center" | "flex-end" | "auto";

	/**
	It defines the alignment along the main axis.
	See [justify-content](https://css-tricks.com/almanac/properties/j/justify-content/).
	*/
	readonly justifyContent?:
		| "flex-start"
		| "flex-end"
		| "space-between"
		| "space-around"
		| "space-evenly"
		| "center";

	/**
	Width of the element in spaces. You can also set it as a percentage, which will calculate the width based on the width of the parent element.
	*/
	readonly width?: number | string;

	/**
	Height of the element in lines (rows). You can also set it as a percentage, which will calculate the height based on the height of the parent element.
	*/
	readonly height?: number | string;

	/**
	Sets a minimum width of the element.
	*/
	readonly minWidth?: number | string;

	/**
	Sets a minimum height of the element.
	*/
	readonly minHeight?: number | string;

	/**
	Set this property to `none` to hide the element.
	*/
	readonly display?: "flex" | "none";

	/**
	Add a border with a specified style. If `borderStyle` is `undefined` (the default), no border will be added.
	*/
	readonly borderStyle?: keyof Boxes | BoxStyle;

	/**
	Determines whether the top border is visible.

	@default true
	*/
	readonly borderTop?: boolean;

	/**
	Determines whether the bottom border is visible.

	@default true
	*/
	readonly borderBottom?: boolean;

	/**
	Determines whether the left border is visible.

	@default true
	*/
	readonly borderLeft?: boolean;

	/**
	Determines whether the right border is visible.

	@default true
	*/
	readonly borderRight?: boolean;

	/**
	Change border color. A shorthand for setting `borderTopColor`, `borderRightColor`, `borderBottomColor`, and `borderLeftColor`.
	*/
	readonly borderColor?: LiteralUnion<AnsiForegroundColorName, string>;

	/**
	Change the top border color. Accepts the same values as `color` in `Text` component.
	*/
	readonly borderTopColor?: LiteralUnion<AnsiForegroundColorName, string>;

	/**
	Change the bottom border color. Accepts the same values as `color` in `Text` component.
	*/
	readonly borderBottomColor?: LiteralUnion<AnsiForegroundColorName, string>;

	/**
	Change the left border color. Accepts the same values as `color` in `Text` component.
	*/
	readonly borderLeftColor?: LiteralUnion<AnsiForegroundColorName, string>;

	/**
	Change the right border color. Accepts the same values as `color` in `Text` component.
	*/
	readonly borderRightColor?: LiteralUnion<AnsiForegroundColorName, string>;

	/**
	Dim the border color. A shorthand for setting `borderTopDimColor`, `borderBottomDimColor`, `borderLeftDimColor`, and `borderRightDimColor`.

	@default false
	*/
	readonly borderDimColor?: boolean;

	/**
	Dim the top border color.

	@default false
	*/
	readonly borderTopDimColor?: boolean;

	/**
	Dim the bottom border color.

	@default false
	*/
	readonly borderBottomDimColor?: boolean;

	/**
	Dim the left border color.

	@default false
	*/
	readonly borderLeftDimColor?: boolean;

	/**
	Dim the right border color.

	@default false
	*/
	readonly borderRightDimColor?: boolean;

	/**
	Behavior for an element's overflow in both directions.

	@default 'visible'
	*/
	readonly overflow?: "visible" | "hidden";

	/**
	Behavior for an element's overflow in the horizontal direction.

	@default 'visible'
	*/
	readonly overflowX?: "visible" | "hidden";

	/**
	Behavior for an element's overflow in the vertical direction.

	@default 'visible'
	*/
	readonly overflowY?: "visible" | "hidden";

	/**
	Background color for the element.

	Accepts the same values as `color` in the `<Text>` component.
	*/
	readonly backgroundColor?: LiteralUnion<AnsiForegroundColorName, string>;
};

export type BoxProps = Except<Styles, "textWrap"> & {
	/**
	A label for the element for screen readers.
	*/
	readonly "aria-label"?: string;

	/**
	Hide the element from screen readers.
	*/
	readonly "aria-hidden"?: boolean;

	/**
	The role of the element.
	*/
	readonly "aria-role"?:
		| "button"
		| "checkbox"
		| "combobox"
		| "list"
		| "listbox"
		| "listitem"
		| "menu"
		| "menuitem"
		| "option"
		| "progressbar"
		| "radio"
		| "radiogroup"
		| "tab"
		| "tablist"
		| "table"
		| "textbox"
		| "timer"
		| "toolbar";

	/**
	The state of the element.
	*/
	readonly "aria-state"?: {
		readonly busy?: boolean;
		readonly checked?: boolean;
		readonly disabled?: boolean;
		readonly expanded?: boolean;
		readonly multiline?: boolean;
		readonly multiselectable?: boolean;
		readonly readonly?: boolean;
		readonly required?: boolean;
		readonly selected?: boolean;
	};
};

export type TextProps = {
	/**
	A label for the element for screen readers.
	*/
	readonly "aria-label"?: string;

	/**
	Hide the element from screen readers.
	*/
	readonly "aria-hidden"?: boolean;

	/**
	Change text color. Ink uses Chalk under the hood, so all its functionality is supported.
	*/
	readonly color?: LiteralUnion<ChalkForegroundColorName, string>;

	/**
	Same as `color`, but for the background.
	*/
	readonly backgroundColor?: LiteralUnion<ChalkForegroundColorName, string>;

	/**
	Dim the color (make it less bright).
	*/
	readonly dimColor?: boolean;

	/**
	Make the text bold.
	*/
	readonly bold?: boolean;

	/**
	Make the text italic.
	*/
	readonly italic?: boolean;

	/**
	Make the text underlined.
	*/
	readonly underline?: boolean;

	/**
	Make the text crossed out with a line.
	*/
	readonly strikethrough?: boolean;

	/**
	Inverse background and foreground colors.
	*/
	readonly inverse?: boolean;

	/**
	This property tells Ink to wrap or truncate text if its width is larger than the container.
	*/
	readonly wrap?: Styles["textWrap"];

	readonly children?: ReactNode;
};

/**
Performance metrics for a render operation.
*/
export type RenderMetrics = {
	/**
	Time spent rendering in milliseconds.
	*/
	renderTime: number;
};

export type RenderOptions = {
	/**
	Output stream where the app will be rendered.

	@default process.stdout
	*/
	stdout?: NodeJS.WriteStream;

	/**
	Input stream where app will listen for input.

	@default process.stdin
	*/
	stdin?: NodeJS.ReadStream;

	/**
	Error stream.
	@default process.stderr
	*/
	stderr?: NodeJS.WriteStream;

	/**
	If true, each update will be rendered as separate output, without replacing the previous one.

	@default false
	*/
	debug?: boolean;

	/**
	Configure whether Ink should listen for Ctrl+C keyboard input and exit the app.

	@default true
	*/
	exitOnCtrlC?: boolean;

	/**
	Patch console methods to ensure console output doesn't mix with Ink's output.

	@default true
	*/
	patchConsole?: boolean;

	/**
	Runs the given callback after each render and re-render.
	*/
	onRender?: (metrics: RenderMetrics) => void;

	/**
	Enable screen reader support.

	@default process.env['INK_SCREEN_READER'] === 'true'
	*/
	isScreenReaderEnabled?: boolean;

	/**
	Maximum frames per second for render updates.

	@default 30
	*/
	maxFps?: number;

	/**
	Enable incremental rendering mode.

	@default false
	*/
	incrementalRendering?: boolean;

	/**
	Enable React Concurrent Rendering mode.

	@default false
	*/
	concurrent?: boolean;

	/**
	Configure kitty keyboard protocol support for enhanced keyboard input.
	*/
	kittyKeyboard?: KittyKeyboardOptions;
};

export type Instance = {
	/**
	Replace the previous root node with a new one or update props of the current root node.
	*/
	rerender: (node: ReactNode) => void;

	/**
	Manually unmount the whole Ink app.
	*/
	unmount: (error?: Error | number | null) => void;

	/**
	Returns a promise that resolves when the app is unmounted.
	*/
	waitUntilExit: () => Promise<void>;

	cleanup: () => void;

	/**
	Clear output.
	*/
	clear: () => void;
};

// ── Context prop types (match Ink's exported Props types) ────────────

/** Props exposed by Ink's `AppContext`. */
export type AppProps = {
	/**
	Exit (unmount) the whole Ink app.
	*/
	readonly exit: (error?: Error) => void;
};

/** Props exposed by Ink's `StdinContext`. */
export type StdinProps = {
	readonly stdin: NodeJS.ReadStream;
	readonly setRawMode: (value: boolean) => void;
	readonly isRawModeSupported: boolean;
	readonly internal_exitOnCtrlC: boolean;
	readonly internal_eventEmitter: EventEmitter;
};

/** Props exposed by Ink's `StdoutContext`. */
export type StdoutProps = {
	readonly stdout: NodeJS.WriteStream;
	readonly write: (data: string) => void;
};

/** Props exposed by Ink's `StderrContext`. */
export type StderrProps = {
	readonly stderr: NodeJS.WriteStream;
	readonly write: (data: string) => void;
};

/** Props for the `<Static>` component. */
export type StaticProps<T> = {
	/**
	Array of items of any type to render using the function you pass as a component child.
	*/
	readonly items: T[];

	/**
	Styles to apply to a container of child elements. See <Box> for supported properties.
	*/
	readonly style?: Styles;

	/**
	Function that is called to render every item in the `items` array.
	*/
	readonly children: (item: T, index: number) => ReactNode;
};

/** Props for the `<Transform>` component. */
export type TransformProps = {
	/**
	Screen-reader-specific text to output. If this is set, all children will be ignored.
	*/
	readonly accessibilityLabel?: string;

	/**
	Function that transforms children output.
	*/
	readonly transform: (children: string, index: number) => string;

	readonly children?: ReactNode;
};

/** Props for the `<Newline>` component. */
export type NewlineProps = {
	readonly count?: number;
};

// ── DOMElement ───────────────────────────────────────────────────────

export type TextName = "#text";
export type ElementNames = "ink-root" | "ink-box" | "ink-text" | "ink-virtual-text";
export type NodeNames = ElementNames | TextName;

// eslint-disable-next-line @typescript-eslint/naming-convention
export type DOMNodeAttribute = boolean | string | number;

type OutputTransformer = (children: string, index: number) => string;

type InkNode = {
	parentNode: DOMElement | undefined;
	yogaNode?: YogaNode;
	internal_static?: boolean;
	style: Styles;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export type DOMElement = {
	nodeName: ElementNames;
	attributes: Record<string, DOMNodeAttribute>;
	childNodes: DOMNode[];
	internal_transform?: OutputTransformer;

	internal_accessibility?: {
		role?:
			| "button"
			| "checkbox"
			| "combobox"
			| "list"
			| "listbox"
			| "listitem"
			| "menu"
			| "menuitem"
			| "option"
			| "progressbar"
			| "radio"
			| "radiogroup"
			| "tab"
			| "tablist"
			| "table"
			| "textbox"
			| "timer"
			| "toolbar";
		state?: {
			busy?: boolean;
			checked?: boolean;
			disabled?: boolean;
			expanded?: boolean;
			multiline?: boolean;
			multiselectable?: boolean;
			readonly?: boolean;
			required?: boolean;
			selected?: boolean;
		};
	};

	// Internal properties
	isStaticDirty?: boolean;
	staticNode?: DOMElement;
	onComputeLayout?: () => void;
	onRender?: () => void;
	onImmediateRender?: () => void;
} & InkNode;

export type TextNode = {
	nodeName: TextName;
	nodeValue: string;
} & InkNode;

// eslint-disable-next-line @typescript-eslint/naming-convention
export type DOMNode<T = { nodeName: NodeNames }> = T extends {
	nodeName: infer U;
}
	? U extends "#text"
		? TextNode
		: DOMElement
	: never;

# Mouse Support

Rezi enables mouse routing when terminal capabilities report mouse support.

## Mouse Input

### Click model

- On mouse down, Rezi hit-tests and immediately moves focus to the hit widget if it is focusable and enabled.
- Activation uses a press/release model:
  - Mouse down captures `pressedId` only for pressable targets (currently button IDs).
  - Mouse up emits `action: "press"` only if release lands on the same enabled pressable ID.
  - Releasing elsewhere (or disabling/removing the target) cancels the press.
- Non-pressable focusable widgets still take focus on mouse down but do not emit the generic `"press"` action.
- `SplitPane` is intentionally not focusable; divider drag is handled by dedicated mouse logic.

### Scroll routing and boundaries

Wheel routing order:

1. `VirtualList` under cursor (`hitTestTargetId`), else focused `VirtualList`.
2. If no `VirtualList` handled the event: focused `CodeEditor`, `LogsConsole`, then `DiffViewer`.
3. If none match, the wheel event is ignored.

Wheel step size (where implemented):

- `VirtualList`: `wheelY * 3` lines
- `CodeEditor`: `wheelY * 3` vertical lines, `wheelX * 3` horizontal columns
- `LogsConsole`: `wheelY * 3` lines
- `DiffViewer`: `wheelY * 3` lines

Clamping:

- `VirtualList.scrollTop`: `[0, max(0, totalHeight - viewportHeight)]`
- `CodeEditor.scrollTop`: `[0, max(0, lineCount - viewportHeight)]`
- `CodeEditor.scrollLeft`: `>= 0`
- `LogsConsole.scrollTop` / `DiffViewer.scrollTop`: `[0, max(0, contentLines - viewportHeight)]`

### SplitPane drag lifecycle

- Drag starts on primary-button mouse down in divider hit area (`dividerSize` plus 1-cell expansion on each side).
- Runtime captures pointer start position and panel start sizes.
- On move/drag, delta is applied via `handleDividerDrag(...)`:
  - Only the two panels adjacent to the dragged divider resize.
  - Delta is clamped against both panels' `minSizes` and `maxSizes`.
  - The panel-pair total size is preserved.
- `onResize` fires on each drag update (absolute cells or percentages, based on `sizeMode`).
- Mouse up ends drag and clears drag state. If pane metadata disappears mid-drag, drag state is canceled.
- When `collapsible` and `onCollapse` are set, divider double-click (`<= 500ms`) toggles collapse for the side clicked.

### FileTreeExplorer click routing

`FileTreeExplorer` supports full mouse-to-node click routing, following the same press/release pattern as `Table`:

- **Mouse down (left button):** Hit-tests the click position against the visible node rows. Computes the target node index from `scrollTop + localY`. Calls `onSelect(node)` immediately to select the clicked node. Stores the pressed node index.
- **Mouse up:** If the release lands on the same widget and same node index as the press:
  - Checks for double-click (two clicks on the same node within 500ms)
  - On double-click: calls `onActivate(node)` (open file, toggle directory, etc.)
  - On single click: selection already fired on mouse down, no additional action
- **Right button:** Skipped by the left-click handler; right-click context menu routing handles it separately.
- **Drag/release elsewhere:** Pressing state is cleared, no activation fires.

This enables natural mouse-driven file browsing: click to select, double-click to open.

### Mouse + keyboard interaction

- Clicking transfers focus through the same focus state used by Tab/Shift+Tab.
- Focus transfer triggers normal blur behavior for the previously focused input (`onBlur`).
- Keybinding chord state is managed by key routing rules (key events, timeout, mode switch). Mouse events do not run the chord matcher directly.

### Hit-testing priority

Mouse routing priority:

1. Top open dropdown (consumes mouse input and blocks lower layers while open).
2. Layer hit-test using resolved layer order (higher `zIndex` first; ties resolved by later registration/order).
3. Base widget hit-test (`hitTestFocusable`) with ancestor clip intersection and deterministic overlap tie-break:
   - depth-first preorder traversal (children left-to-right)
   - later tree-order nodes win overlap ties

Modal/layer blocking invariants:

- The topmost modal blocks input to all lower layers and base widgets, including points outside modal bounds.
- Backdrop visual style (`none`/`dim`/`opaque`) does not change blocking semantics.
- If `closeOnBackdrop` is enabled and `onClose` exists, backdrop mouse down closes the blocking layer.

## Related

- [Input & Focus](input-and-focus.md)
- [Layers](../widgets/layers.md)
- [SplitPane](../widgets/split-pane.md)
- [FileTreeExplorer](../widgets/file-tree-explorer.md) - File tree widget with mouse click support
- [Table](../widgets/table.md) - Table widget (original click routing pattern)

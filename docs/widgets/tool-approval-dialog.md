# `ToolApprovalDialog`

Dialog for reviewing and approving tool execution (developer tooling).

## Usage

```ts
ui.toolApprovalDialog({
  id: "approval",
  open: state.pendingApproval !== null,
  request: state.pendingApproval,
  onPress: (action) =>
    action === "allow"
      ? executeTool(state.pendingApproval)
      : app.update((s) => ({ ...s, pendingApproval: null })),
  onAllowForSession: () => allowForSession(state.pendingApproval),
  onClose: () => app.update((s) => ({ ...s, pendingApproval: null })),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `request` | `ToolRequest` | **required** | Tool request details |
| `open` | `boolean` | **required** | Visible state |
| `width` | `number` | `50` | Dialog width in cells (clamped to viewport width) |
| `height` | `number` | `15` | Dialog height in cells (clamped to viewport height) |
| `focusedAction` | `"allow" \| "deny" \| "allowSession"` | - | Focused action button |
| `onPress` | `(action: "allow" \| "deny") => void` | **required** | Allow/deny callback |
| `onAllowForSession` | `() => void` | - | Allow for session callback |
| `onClose` | `() => void` | **required** | Close callback |

## Notes

- `ToolRequest` includes metadata like `toolId`, `toolName`, `riskLevel`, and optional `fileChanges`.
- `fileChanges` entries include `path`, `changeType`, and optional `preview`/`oldPath` for renames.
- Default dialog size is `50x15` cells when `width`/`height` are omitted.

## Related

- [Modal](modal.md)
- [Callout](callout.md)

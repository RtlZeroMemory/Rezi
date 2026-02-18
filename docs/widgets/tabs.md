# Tabs

Switches between related views with a tab bar and one active content panel.

## Usage

```ts
ui.tabs({
  id: "settings-tabs",
  tabs: [
    { key: "general", label: "General", content: ui.text("General settings") },
    { key: "security", label: "Security", content: ui.text("Security settings") },
  ],
  activeTab: state.activeTab,
  onChange: (key) => app.update({ activeTab: key }),
  variant: "line",
  position: "top",
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Stable tabs widget id |
| `tabs` | `Array<{ key: string; label: string; content: VNode }>` | **required** | Tab descriptors |
| `activeTab` | `string` | **required** | Active tab key |
| `onChange` | `(key: string) => void` | **required** | Called when active tab changes |
| `variant` | `"line" \| "enclosed" \| "pills"` | `"line"` | Tab label style variant |
| `position` | `"top" \| "bottom"` | `"top"` | Tab bar position relative to content |
| `key` | `string` | - | Reconciliation key |

## Keyboard Behavior

- `Left/Right`: switches tabs in the tab bar.
- `Tab/Shift+Tab`: enters/leaves the content focus scope.
- `Escape`: when focused in tab content, returns focus to the tab bar.

import {
  defineWidget,
  match,
  show,
  ui,
  type LogEntry,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { resolveLayout } from "../helpers/layout.js";
import { channelLabel, priorityLabel } from "../helpers/formatters.js";
import { filteredMessages } from "../helpers/state.js";
import { SPACE, themeTokens, toHex } from "../theme.js";
import type { CommsMessage, RouteDeps, StarshipState } from "../types.js";
import { sectionHeader, surfacePanel } from "./primitives.js";
import { renderShell } from "./shell.js";

function toLogLevel(priority: CommsMessage["priority"]): LogEntry["level"] {
  if (priority === "critical") return "error";
  if (priority === "urgent") return "warn";
  return "info";
}

function messageToLogEntry(message: CommsMessage): LogEntry {
  return {
    id: message.id,
    timestamp: message.timestamp,
    level: toLogLevel(message.priority),
    source: message.channel,
    message: `${message.sender}: ${message.content}`,
    details: `Priority ${priorityLabel(message.priority)} · ${message.acknowledged ? "Ack" : "Pending"}`,
  };
}

const COMMS_CHANNELS: readonly CommsMessage["channel"][] = Object.freeze([
  "fleet",
  "local",
  "emergency",
  "internal",
]);

type CommsDeckProps = Readonly<{
  key?: string;
  state: StarshipState;
  dispatch: RouteDeps["dispatch"];
}>;

const CommsDeck = defineWidget<CommsDeckProps>((props, ctx): VNode => {
  const state = props.state;
  const tokens = themeTokens(state.themeName);
  const layout = resolveLayout({
    width: state.viewportCols,
    height: state.viewportRows,
  });
  const compactHeight = layout.height < 40;
  const showExpandedControls = layout.height >= 46;
  const showExpandedStream = !layout.hideNonCritical && layout.height >= 46;
  const messages = filteredMessages(state);
  const activeMessage = messages[messages.length - 1] ?? null;
  const atBottom = state.commsScrollTop <= 0;
  const pendingCount = messages.filter((message) => !message.acknowledged).length;
  const acknowledgedCount = Math.max(0, messages.length - pendingCount);
  const acknowledgedPct = messages.length === 0 ? 100 : Math.round((acknowledgedCount / messages.length) * 100);
  const newCount = atBottom ? 0 : pendingCount;
  const activeChannelMessages = messages.filter((message) => message.channel === state.activeChannel);
  const activeChannelCount = activeChannelMessages.length;
  const latestChannelMessage = activeChannelMessages[activeChannelCount - 1] ?? null;

  const severityColor = (priority: CommsMessage["priority"]) => {
    if (priority === "critical") return tokens.log.error;
    if (priority === "urgent") return tokens.log.warn;
    return tokens.log.info;
  };

  if (compactHeight) {
    return ui.column({ gap: SPACE.sm, width: "100%" }, [
      surfacePanel(tokens, "Channel Controls", [
        sectionHeader(tokens, "Compact Comms View", "Expand terminal height for full traffic console"),
        ui.tabs({
          id: "comms-channel-tabs-compact",
          activeTab: state.activeChannel,
          variant: "pills",
          dsVariant: "soft",
          dsTone: state.themeName === "alert" ? "danger" : "primary",
          dsSize: "sm",
          onChange: (key) =>
            props.dispatch({ type: "switch-channel", channel: key as CommsMessage["channel"] }),
          tabs: [
            { key: "fleet", label: "Fleet", content: ui.text("Fleet channel") },
            { key: "local", label: "Local", content: ui.text("Local channel") },
            { key: "emergency", label: "Emergency", content: ui.text("Emergency channel") },
            { key: "internal", label: "Internal", content: ui.text("Internal channel") },
          ],
        }),
        ui.actions([
          ui.button({
            id: "comms-open-hail-compact",
            label: "Open Hail",
            intent: "primary",
            onPress: () => props.dispatch({ type: "toggle-hail-dialog" }),
          }),
          ui.button({
            id: "comms-ack-latest-compact",
            label: "Ack Latest",
            intent: "secondary",
            onPress: () => {
              if (!activeMessage) return;
              props.dispatch({ type: "acknowledge-message", messageId: activeMessage.id });
            },
          }),
        ]),
      ]),
      surfacePanel(
        tokens,
        "Latest Traffic",
        [
          ...messages
            .slice(-4)
            .map((message) =>
              ui.row({ key: `compact-msg-${message.id}`, gap: SPACE.xs, wrap: true }, [
                ui.text(new Date(message.timestamp).toISOString().slice(11, 19), {
                  variant: "caption",
                  style: { fg: tokens.text.muted, dim: true },
                }),
                ui.text(message.sender, { variant: "label" }),
                ui.text(message.content),
                ui.badge(priorityLabel(message.priority), {
                  variant:
                    message.priority === "critical"
                      ? "error"
                      : message.priority === "urgent"
                        ? "warning"
                        : "info",
                }),
              ]),
            ),
          ...(messages.length === 0
            ? [ui.empty("No messages", { description: "Inbound traffic will appear here" })]
            : []),
        ],
        { tone: "inset" },
      ),
    ]);
  }

  const streamPanel = surfacePanel(tokens, "Message Stream", [
    sectionHeader(tokens, "Traffic Console", "Severity gutter, timestamp hierarchy, and live control"),
    ui.row({ gap: SPACE.sm, wrap: true }, [
      ui.badge(atBottom ? "LIVE" : "Paused", {
        variant: atBottom ? "success" : "warning",
      }),
      !atBottom && newCount > 0 ? ui.badge(`${newCount} new`, { variant: "warning" }) : null,
      ui.text(atBottom ? "Auto-following inbound traffic" : "Scroll up detected; auto-follow paused", {
        variant: "caption",
        style: { fg: tokens.text.dim, dim: true },
      }),
    ]),
    ...(showExpandedStream
      ? [
          ui.logsConsole({
            id: "comms-log-console",
            entries: messages.map(messageToLogEntry),
            scrollTop: state.commsScrollTop,
            autoScroll: atBottom,
            focusedStyle: { fg: tokens.text.primary, bg: tokens.bg.panel.elevated, bold: true },
            onScroll: (scrollTop) => props.dispatch({ type: "set-comms-scroll", scrollTop }),
            expandedEntries: state.expandedMessageIds,
            onEntryToggle: (entryId, expanded) =>
              props.dispatch({
                type: "toggle-message-expanded",
                messageId: entryId,
                expanded,
              }),
            searchQuery: state.commsSearchQuery,
            levelFilter:
              state.activeChannel === "emergency"
                ? ["warn", "error"]
                : ["trace", "debug", "info", "warn", "error"],
          }),
          ui.divider({ color: toHex(tokens.border.muted) }),
        ]
      : []),
    ui.virtualList<CommsMessage>({
      id: "comms-traffic-list",
      items: messages.slice(-180),
      itemHeight: showExpandedStream ? 3 : 2,
      overscan: 4,
      renderItem: (message, index) =>
        ui.column(
          {
            key: message.id,
            gap: SPACE.sm,
            style:
              index % 2 === 0
                ? { bg: tokens.bg.panel.base, fg: tokens.text.primary }
                : { bg: tokens.table.rowAltBg, fg: tokens.text.primary },
          },
          [
          ui.row({ gap: SPACE.xs, wrap: false }, [
            ui.text("██", { style: { fg: severityColor(message.priority), bold: true } }),
            ui.text(new Date(message.timestamp).toISOString().slice(11, 19), {
              variant: "caption",
              style: { fg: tokens.text.dim, dim: true },
            }),
            ui.text(message.sender, { variant: "label", style: { fg: tokens.text.primary } }),
            ui.spacer({ flex: 1 }),
            ui.badge(priorityLabel(message.priority), {
              variant: message.priority === "critical" ? "error" : message.priority === "urgent" ? "warning" : "info",
            }),
          ]),
          ui.row({ gap: SPACE.xs, wrap: true }, [
            ui.text(channelLabel(message.channel), {
              variant: "caption",
              style: { fg: tokens.text.muted },
            }),
            ui.text(message.content),
            !message.acknowledged
              ? ui.tag("Pending", { variant: "warning" })
              : ui.tag("Ack", { variant: "success" }),
            ui.text(`#${String(index + 1).padStart(3, "0")}`, {
              variant: "code",
              style: { fg: tokens.accent.info },
            }),
          ]),
        ]),
      onScroll: (scrollTop) => props.dispatch({ type: "set-comms-scroll", scrollTop }),
      onSelect: (message) =>
        props.dispatch({
          type: "toggle-message-expanded",
          messageId: message.id,
          expanded: true,
        }),
      selectionStyle: {
        bg: tokens.table.rowSelectedBg,
        fg: tokens.state.selectedText,
        bold: true,
      },
    }),
    ...(layout.height >= 40
      ? [
          ui.divider({ color: toHex(tokens.border.muted) }),
          activeMessage
            ? ui.richText([
                { text: `[${channelLabel(activeMessage.channel)}] `, style: { bold: true } },
                { text: `${activeMessage.sender}: `, style: { underline: true } },
                { text: activeMessage.content },
              ])
            : ui.empty("No messages", {
                description: "Inbound traffic will appear here",
              }),
        ]
      : []),
    match(state.activeChannel, {
      fleet: ui.text("Fleet directives prioritized."),
      local: ui.text("Local traffic prioritizes proximity updates."),
      emergency: ui.text("Emergency mode enforces high-priority triage."),
      internal: ui.text("Internal chatter remains encrypted."),
      _: ui.text("Unknown channel."),
    }) ?? ui.text(""),
  ]);

  return ui.column({ gap: SPACE.sm, width: "100%" }, [
    show(
      state.activeChannel === "emergency",
      ui.callout("Emergency channel monitored with elevated priority.", {
        title: "Emergency Net",
        variant: "warning",
      }),
    ),
    surfacePanel(
      tokens,
      "Channel Controls",
      [
        ...(showExpandedControls
          ? [sectionHeader(tokens, "Channels", "Segmented controls with clear selection")]
          : []),
        ui.row({ gap: SPACE.md, wrap: !layout.wide, items: "start" }, [
          ui.box(
            {
              border: "none",
              p: 0,
              gap: SPACE.sm,
              ...(layout.wide ? { flex: 2 } : {}),
            },
            [
              ui.row({ gap: SPACE.xs, wrap: true }, [
                ...COMMS_CHANNELS.map((channel) => {
                  const active = state.activeChannel === channel;
                  const tone =
                    channel === "emergency" || state.themeName === "alert" ? "danger" : "primary";
                  return ui.button({
                    key: `comms-channel-btn-${channel}`,
                    id: `comms-channel-btn-${channel}`,
                    label: channelLabel(channel),
                    dsVariant: active ? "solid" : "soft",
                    dsTone: active ? tone : "default",
                    dsSize: showExpandedControls ? "md" : "sm",
                    style: active ? { bold: true } : { fg: tokens.text.muted },
                    onPress: () => props.dispatch({ type: "switch-channel", channel }),
                  });
                }),
              ]),
              ...(showExpandedControls
                ? [
                    ui.form({ id: "comms-search-form" }, [
                      ui.field({
                        label: "Search Traffic",
                        children: ui.input({
                          id: "comms-search-input",
                          value: state.commsSearchQuery,
                          placeholder: "Filter by sender/content",
                          onInput: (value) => props.dispatch({ type: "set-comms-search", query: value }),
                        }),
                      }),
                    ]),
                  ]
                : []),
              ui.actions([
                ui.button({
                  id: "comms-open-hail",
                  label: "Open Hail",
                  intent: "primary",
                  onPress: () => props.dispatch({ type: "toggle-hail-dialog" }),
                }),
                ui.button({
                  id: "comms-ack-latest",
                  label: "Acknowledge Latest",
                  intent: "secondary",
                  onPress: () => {
                    if (!activeMessage) return;
                    props.dispatch({ type: "acknowledge-message", messageId: activeMessage.id });
                  },
                }),
                ...(showExpandedControls
                  ? [
                      ui.button({
                        id: "comms-help-link",
                        label: "Palette",
                        intent: "link",
                        onPress: () => props.dispatch({ type: "toggle-command-palette" }),
                      }),
                    ]
                  : []),
              ]),
            ],
          ),
          ...(showExpandedControls
            ? [
                ui.box(
                  {
                    border: "none",
                    p: 0,
                    ...(layout.wide ? { flex: 1 } : {}),
                  },
                  [
                    surfacePanel(
                      tokens,
                      "Channel Snapshot",
                      [
                        ui.row({ gap: SPACE.xs, wrap: true }, [
                          ui.badge(channelLabel(state.activeChannel), { variant: "info" }),
                          ui.badge(`${activeChannelCount} msgs`, {
                            variant: activeChannelCount === 0 ? "warning" : "default",
                          }),
                          ui.badge(`Ack ${acknowledgedPct}%`, {
                            variant: acknowledgedPct < 65 ? "warning" : "success",
                          }),
                        ]),
                        ui.text(
                          atBottom
                            ? "LIVE tail is locked to newest traffic."
                            : `${newCount} new messages while paused.`,
                          {
                            variant: "caption",
                            style: { fg: tokens.text.dim, dim: true },
                          },
                        ),
                        ui.divider({ color: toHex(tokens.border.muted) }),
                        latestChannelMessage
                          ? ui.richText([
                              { text: `${latestChannelMessage.sender}: `, style: { bold: true } },
                              { text: latestChannelMessage.content },
                            ])
                          : ui.text("No traffic on selected channel", {
                              variant: "caption",
                              style: { fg: tokens.text.muted, dim: true },
                            }),
                      ],
                      {
                        tone: "inset",
                        p: SPACE.sm,
                        gap: SPACE.sm,
                      },
                    ),
                  ],
                ),
              ]
            : []),
        ]),
      ],
      { tone: "base" },
    ),
    streamPanel,
    state.showHailDialog
      ? ui.modal({
          id: "comms-hail-modal",
          title: "Compose Hail",
          width: layout.hideNonCritical ? 58 : 72,
          onClose: () => props.dispatch({ type: "toggle-hail-dialog" }),
          content: ui.form({ id: "comms-hail-form", gap: SPACE.sm }, [
            ui.field({
              label: "Target",
              required: true,
              children: ui.input({
                id: "comms-hail-target",
                value: state.hailTarget,
                placeholder: "e.g. Fleet Command",
                onInput: (value) => props.dispatch({ type: "set-hail-target", target: value }),
              }),
            }),
            ui.field({
              label: "Message",
              required: true,
              children: ui.textarea({
                id: "comms-hail-message",
                value: state.hailMessage,
                rows: 5,
                placeholder: "Enter hail message",
                onInput: (value) => props.dispatch({ type: "set-hail-message", message: value }),
              }),
            }),
          ]),
          actions: [
            ui.button({
              id: "comms-hail-cancel",
              label: "Cancel",
              intent: "secondary",
              onPress: () => props.dispatch({ type: "toggle-hail-dialog" }),
            }),
            ui.button({
              id: "comms-hail-send",
              label: "Transmit",
              intent: "primary",
              onPress: () =>
                props.dispatch({
                  type: "send-hail",
                  target: state.hailTarget.trim() || "Unknown",
                  message: state.hailMessage.trim() || "Status check",
                }),
            }),
          ],
        })
      : null,
  ]);
});

export function renderCommsScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  return renderShell({
    title: "Communications",
    context,
    deps,
    body: ui.column({ gap: SPACE.sm, width: "100%" }, [
      CommsDeck({
        key: "comms-deck",
        state: context.state,
        dispatch: deps.dispatch,
      }),
    ]),
  });
}

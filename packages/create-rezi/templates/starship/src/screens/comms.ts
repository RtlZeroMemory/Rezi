import {
  match,
  show,
  ui,
  type LogEntry,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { channelLabel, priorityLabel } from "../helpers/formatters.js";
import { filteredMessages } from "../helpers/state.js";
import { stylesForTheme } from "../theme.js";
import type { CommsMessage, RouteDeps, StarshipState } from "../types.js";
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

export function renderCommsScreen(
  context: RouteRenderContext<StarshipState>,
  deps: RouteDeps,
): VNode {
  const state = context.state;
  const styles = stylesForTheme(state.themeName);
  const messages = filteredMessages(state);

  const activeMessage = messages[messages.length - 1] ?? null;

  return renderShell({
    title: "Communications",
    context,
    deps,
    body: ui.card(
      {
        title: "Comms Relay",
        style: styles.panelStyle,
      },
      [
        ui.column({ gap: 1 }, [
          show(
            state.activeChannel === "emergency",
            ui.callout("Emergency channel monitored with elevated priority.", {
              title: "Emergency Net",
              variant: "warning",
            }),
          ),
          ui.panel("Channel Controls", [
            ui.tabs({
              id: "comms-channel-tabs",
              activeTab: state.activeChannel,
              variant: "pills",
              onChange: (key) =>
                deps.dispatch({ type: "switch-channel", channel: key as CommsMessage["channel"] }),
              tabs: [
                { key: "fleet", label: "Fleet", content: ui.text("Fleet channel") },
                { key: "local", label: "Local", content: ui.text("Local channel") },
                { key: "emergency", label: "Emergency", content: ui.text("Emergency channel") },
                { key: "internal", label: "Internal", content: ui.text("Internal channel") },
              ],
            }),
            ui.form([
              ui.field({
                label: "Search Traffic",
                children: ui.input({
                  id: "comms-search-input",
                  value: state.commsSearchQuery,
                  placeholder: "Filter by sender/content",
                  onInput: (value) => deps.dispatch({ type: "set-comms-search", query: value }),
                }),
              }),
            ]),
            ui.actions([
              ui.button({
                id: "comms-open-hail",
                label: "Open Hail",
                intent: "primary",
                onPress: () => deps.dispatch({ type: "toggle-hail-dialog" }),
              }),
              ui.button({
                id: "comms-ack-latest",
                label: "Acknowledge Latest",
                intent: "secondary",
                onPress: () => {
                  if (!activeMessage) return;
                  deps.dispatch({ type: "acknowledge-message", messageId: activeMessage.id });
                },
              }),
              ui.button({
                id: "comms-help-link",
                label: "Palette",
                intent: "link",
                onPress: () => deps.dispatch({ type: "toggle-command-palette" }),
              }),
            ]),
          ]),
          ui.panel("Message Stream", [
            ui.logsConsole({
              id: "comms-log-console",
              entries: messages.map(messageToLogEntry),
              scrollTop: state.commsScrollTop,
              onScroll: (scrollTop) => deps.dispatch({ type: "set-comms-scroll", scrollTop }),
              expandedEntries: state.expandedMessageIds,
              onEntryToggle: (entryId, expanded) =>
                deps.dispatch({
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
            ui.divider(),
            activeMessage
              ? ui.richText([
                  { text: `[${channelLabel(activeMessage.channel)}] `, style: { bold: true } },
                  { text: `${activeMessage.sender}: `, style: { underline: true } },
                  { text: activeMessage.content },
                ])
              : ui.empty("No messages", {
                  description: "Inbound traffic will appear here",
                }),
            match(state.activeChannel, {
              fleet: ui.text("Fleet directives prioritized."),
              local: ui.text("Local traffic prioritizes proximity updates."),
              emergency: ui.text("Emergency mode enforces high-priority triage."),
              internal: ui.text("Internal chatter remains encrypted."),
              _: ui.text("Unknown channel."),
            }) ?? ui.text(""),
          ]),
        ]),
        state.showHailDialog
          ? ui.modal({
              id: "comms-hail-modal",
              title: "Compose Hail",
              width: 72,
              onClose: () => deps.dispatch({ type: "toggle-hail-dialog" }),
              content: ui.form({ id: "comms-hail-form", gap: 1 }, [
                ui.field({
                  label: "Target",
                  required: true,
                  children: ui.input({
                    id: "comms-hail-target",
                    value: state.hailTarget,
                    placeholder: "e.g. Fleet Command",
                    onInput: (value) => deps.dispatch({ type: "set-hail-target", target: value }),
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
                    onInput: (value) => deps.dispatch({ type: "set-hail-message", message: value }),
                  }),
                }),
              ]),
              actions: [
                ui.button({
                  id: "comms-hail-cancel",
                  label: "Cancel",
                  intent: "secondary",
                  onPress: () => deps.dispatch({ type: "toggle-hail-dialog" }),
                }),
                ui.button({
                  id: "comms-hail-send",
                  label: "Transmit",
                  intent: "primary",
                  onPress: () =>
                    deps.dispatch({
                      type: "send-hail",
                      target: state.hailTarget.trim() || "Unknown",
                      message: state.hailMessage.trim() || "Status check",
                    }),
                }),
              ],
            })
          : null,
      ],
    ),
  });
}

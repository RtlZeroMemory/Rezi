import type { CliAction, CliState } from "../types.js";
import { buildLogEntry, seedLogs } from "./logs.js";

const LOG_HISTORY_LIMIT = 160;
const LOG_SEED_COUNT = 18;

function withExpanded(
  previous: readonly string[],
  entryId: string,
  expanded: boolean,
): readonly string[] {
  if (expanded) {
    if (previous.includes(entryId)) return previous;
    return Object.freeze([...previous, entryId]);
  }
  return Object.freeze(previous.filter((id) => id !== entryId));
}

export function createInitialState(nowMs = Date.now()): CliState {
  return {
    nowMs,
    tick: LOG_SEED_COUNT,
    logs: seedLogs(LOG_SEED_COUNT, "staging"),
    logsScrollTop: 0,
    expandedLogIds: Object.freeze([]),
    autoRefresh: true,
    includeDebug: true,
    operatorName: "operator",
    environment: "staging",
    themeName: "nord",
    showHelp: false,
  };
}

export function reduceCliState(state: CliState, action: CliAction): CliState {
  if (action.type === "tick") {
    if (!state.autoRefresh) return { ...state, nowMs: action.nowMs };
    const tick = state.tick + 1;
    const nextEntry = buildLogEntry(tick, state.environment, state.includeDebug, action.nowMs);
    const logs = Object.freeze([...state.logs, nextEntry].slice(-LOG_HISTORY_LIMIT));
    const expandedLogIds = Object.freeze(
      state.expandedLogIds.filter((entryId) => logs.some((entry) => entry.id === entryId)),
    );
    return {
      ...state,
      tick,
      nowMs: action.nowMs,
      logs,
      expandedLogIds,
    };
  }

  if (action.type === "toggle-refresh") {
    return { ...state, autoRefresh: !state.autoRefresh };
  }

  if (action.type === "toggle-debug") {
    return { ...state, includeDebug: !state.includeDebug };
  }

  if (action.type === "toggle-help") {
    return { ...state, showHelp: !state.showHelp };
  }

  if (action.type === "set-operator") {
    return { ...state, operatorName: action.operatorName };
  }

  if (action.type === "set-environment") {
    return { ...state, environment: action.environment };
  }

  if (action.type === "set-theme") {
    return { ...state, themeName: action.themeName };
  }

  if (action.type === "set-scroll-top") {
    return { ...state, logsScrollTop: action.scrollTop };
  }

  if (action.type === "set-entry-expanded") {
    return {
      ...state,
      expandedLogIds: withExpanded(state.expandedLogIds, action.entryId, action.expanded),
    };
  }

  if (action.type === "clear-logs") {
    return {
      ...state,
      logs: Object.freeze([]),
      logsScrollTop: 0,
      expandedLogIds: Object.freeze([]),
    };
  }

  return state;
}

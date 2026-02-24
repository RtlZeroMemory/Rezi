import type { BadgeVariant } from "@rezi-ui/core";
import type { AlertLevel, CargoItem, CommsMessage, CrewMember } from "../types.js";

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function formatPower(pct: number): string {
  const value = clamp(Math.round(pct), 0, 100);
  return `${String(value).padStart(3, " ")}%`;
}

export function formatTemperature(deg: number): string {
  const value = Math.round(deg);
  return `${value}C`;
}

export function formatWarpFactor(wf: number): string {
  return `WF ${wf.toFixed(2)}`;
}

export function rankBadge(
  rank: CrewMember["rank"],
): Readonly<{ text: string; variant: BadgeVariant }> {
  if (rank === "captain") return { text: "Captain", variant: "warning" };
  if (rank === "commander") return { text: "Cmdr", variant: "info" };
  if (rank === "lieutenant") return { text: "Lt", variant: "default" };
  return { text: "Ens", variant: "success" };
}

export function statusBadge(
  status: CrewMember["status"],
): Readonly<{ text: string; variant: BadgeVariant }> {
  if (status === "active") return { text: "Active", variant: "success" };
  if (status === "away") return { text: "Away", variant: "info" };
  if (status === "off-duty") return { text: "Off", variant: "default" };
  return { text: "Injured", variant: "error" };
}

export function departmentLabel(dept: CrewMember["department"]): string {
  if (dept === "bridge") return "Bridge";
  if (dept === "engineering") return "Engineering";
  if (dept === "medical") return "Medical";
  if (dept === "science") return "Science";
  return "Security";
}

export function alertLabel(level: AlertLevel): string {
  if (level === "green") return "Green";
  if (level === "yellow") return "Yellow";
  return "Red Alert";
}

export function channelLabel(channel: CommsMessage["channel"]): string {
  if (channel === "fleet") return "Fleet";
  if (channel === "local") return "Local";
  if (channel === "emergency") return "Emergency";
  return "Internal";
}

export function priorityLabel(priority: CommsMessage["priority"]): string {
  if (priority === "routine") return "Routine";
  if (priority === "urgent") return "Urgent";
  return "Critical";
}

export function crewCounts(
  crew: readonly CrewMember[],
): Readonly<{ total: number; active: number; away: number; injured: number }> {
  let active = 0;
  let away = 0;
  let injured = 0;
  for (const member of crew) {
    if (member.status === "active") active += 1;
    if (member.status === "away") away += 1;
    if (member.status === "injured") injured += 1;
  }
  return Object.freeze({
    total: crew.length,
    active,
    away,
    injured,
  });
}

export function cargoSummary(
  cargo: readonly CargoItem[],
): Readonly<{ totalQuantity: number; byCategory: Record<CargoItem["category"], number> }> {
  const byCategory: Record<CargoItem["category"], number> = {
    fuel: 0,
    supplies: 0,
    equipment: 0,
    medical: 0,
    ordnance: 0,
  };
  let totalQuantity = 0;

  for (const item of cargo) {
    byCategory[item.category] += item.quantity;
    totalQuantity += item.quantity;
  }

  return Object.freeze({
    totalQuantity,
    byCategory,
  });
}

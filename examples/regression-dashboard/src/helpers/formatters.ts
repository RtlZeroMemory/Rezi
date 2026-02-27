import type { BadgeVariant } from "@rezi-ui/core";
import type { Service, ServiceFilter, ServiceStatus } from "../types.js";

export function formatLatency(ms: number): string {
  return `${Math.round(ms)} ms`;
}

export function formatErrorRate(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

export function formatTraffic(rpm: number): string {
  if (rpm >= 1000) return `${(rpm / 1000).toFixed(1)}k rpm`;
  return `${rpm.toFixed(0)} rpm`;
}

export function statusBadge(
  status: ServiceStatus,
): Readonly<{ label: string; variant: BadgeVariant }> {
  if (status === "healthy") return { label: "Healthy", variant: "success" };
  if (status === "warning") return { label: "Warning", variant: "warning" };
  return { label: "Critical", variant: "error" };
}

export function statusGlyph(status: ServiceStatus): string {
  if (status === "healthy") return "●";
  if (status === "warning") return "▲";
  return "■";
}

export function filterLabel(filter: ServiceFilter): string {
  if (filter === "all") return "All";
  if (filter === "healthy") return "Healthy";
  if (filter === "warning") return "Warning";
  return "Down";
}

export function fleetCounts(
  services: readonly Service[],
): Readonly<{ healthy: number; warning: number; down: number }> {
  return Object.freeze({
    healthy: services.filter((service) => service.status === "healthy").length,
    warning: services.filter((service) => service.status === "warning").length,
    down: services.filter((service) => service.status === "down").length,
  });
}

export function overallStatus(services: readonly Service[]): ServiceStatus {
  const counts = fleetCounts(services);
  if (counts.down > 0) return "down";
  if (counts.warning > 0) return "warning";
  return "healthy";
}

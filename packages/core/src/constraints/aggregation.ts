/**
 * packages/core/src/constraints/aggregation.ts — Sibling aggregation helpers.
 *
 * Why: Pre-computes max/sum sibling values for deterministic function calls.
 */

import type { InstanceId } from "../runtime/instance.js";
import { collectWidgetRefUsages } from "./parser.js";
import type { AggregationName, ExprNode, RefProp } from "./types.js";

export type AggregationRequest = Readonly<{
  name: AggregationName;
  id: string;
  prop: RefProp;
}>;

export type SiblingMetricReader = (instanceId: InstanceId, prop: RefProp) => number;

const EMPTY_REQUESTS: readonly AggregationRequest[] = Object.freeze([]);

function sanitizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function aggregationKey(name: AggregationName, id: string, prop: RefProp): string {
  return `${name}:${id}:${prop}`;
}

export function collectAggregationRequests(ast: ExprNode): readonly AggregationRequest[] {
  const usages = collectWidgetRefUsages(ast);
  const out: AggregationRequest[] = [];
  for (const usage of usages) {
    if (!usage.viaAggregation || usage.aggregation === null) continue;
    out.push({
      name: usage.aggregation,
      id: usage.id,
      prop: usage.prop,
    });
  }
  if (out.length === 0) return EMPTY_REQUESTS;
  return Object.freeze(out);
}

export function computeSiblingAggregations(
  requests: readonly AggregationRequest[],
  idToInstances: ReadonlyMap<string, readonly InstanceId[]>,
  readMetric: SiblingMetricReader,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();

  for (const request of requests) {
    const key = aggregationKey(request.name, request.id, request.prop);
    if (out.has(key)) continue;
    const instances = idToInstances.get(request.id) ?? [];
    if (instances.length === 0) {
      out.set(key, 0);
      continue;
    }

    if (request.name === "max_sibling") {
      let maxValue = Number.NEGATIVE_INFINITY;
      for (const instanceId of instances) {
        const value = sanitizeFinite(readMetric(instanceId, request.prop));
        if (value > maxValue) maxValue = value;
      }
      out.set(key, Number.isFinite(maxValue) ? maxValue : 0);
      continue;
    }

    let total = 0;
    for (const instanceId of instances) {
      total += sanitizeFinite(readMetric(instanceId, request.prop));
    }
    out.set(key, sanitizeFinite(total));
  }

  return out;
}

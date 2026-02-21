/**
 * packages/core/src/animation/spring.ts — Spring simulation utilities.
 */

import type { NormalizedSpringConfig, SpringConfig } from "./types.js";

export type { NormalizedSpringConfig };

export type SpringState = Readonly<{
  value: number;
  velocity: number;
}>;

export type SpringStepResult = Readonly<{
  value: number;
  velocity: number;
  done: boolean;
}>;

const DEFAULT_SPRING_CONFIG: NormalizedSpringConfig = Object.freeze({
  stiffness: 170,
  damping: 26,
  mass: 1,
  restDelta: 0.001,
  restSpeed: 0.001,
  maxDeltaMs: 32,
});

export function normalizeSpringConfig(config: SpringConfig | undefined): NormalizedSpringConfig {
  if (!config) return DEFAULT_SPRING_CONFIG;
  const stiffness =
    typeof config.stiffness === "number" && Number.isFinite(config.stiffness)
      ? Math.max(0, config.stiffness)
      : DEFAULT_SPRING_CONFIG.stiffness;
  const damping =
    typeof config.damping === "number" && Number.isFinite(config.damping)
      ? Math.max(0, config.damping)
      : DEFAULT_SPRING_CONFIG.damping;
  const mass =
    typeof config.mass === "number" && Number.isFinite(config.mass)
      ? Math.max(0.0001, config.mass)
      : DEFAULT_SPRING_CONFIG.mass;
  const restDelta =
    typeof config.restDelta === "number" && Number.isFinite(config.restDelta)
      ? Math.max(0, config.restDelta)
      : DEFAULT_SPRING_CONFIG.restDelta;
  const restSpeed =
    typeof config.restSpeed === "number" && Number.isFinite(config.restSpeed)
      ? Math.max(0, config.restSpeed)
      : DEFAULT_SPRING_CONFIG.restSpeed;
  const maxDeltaMs =
    typeof config.maxDeltaMs === "number" && Number.isFinite(config.maxDeltaMs)
      ? Math.max(1, Math.trunc(config.maxDeltaMs))
      : DEFAULT_SPRING_CONFIG.maxDeltaMs;

  return Object.freeze({
    stiffness,
    damping,
    mass,
    restDelta,
    restSpeed,
    maxDeltaMs,
  });
}

export function isSpringAtRest(
  value: number,
  target: number,
  velocity: number,
  config: NormalizedSpringConfig,
): boolean {
  return Math.abs(velocity) <= config.restSpeed && Math.abs(target - value) <= config.restDelta;
}

export function stepSpring(
  state: SpringState,
  target: number,
  dtSeconds: number,
  config: NormalizedSpringConfig,
): SpringStepResult {
  if (
    !Number.isFinite(state.value) ||
    !Number.isFinite(state.velocity) ||
    !Number.isFinite(target) ||
    !Number.isFinite(dtSeconds) ||
    dtSeconds <= 0
  ) {
    return Object.freeze({
      value: target,
      velocity: 0,
      done: true,
    });
  }

  if (config.stiffness <= 0 || config.mass <= 0) {
    return Object.freeze({
      value: target,
      velocity: 0,
      done: true,
    });
  }

  const displacement = state.value - target;
  const springForce = -config.stiffness * displacement;
  const dampingForce = -config.damping * state.velocity;
  const acceleration = (springForce + dampingForce) / config.mass;
  const nextVelocity = state.velocity + acceleration * dtSeconds;
  const nextValue = state.value + nextVelocity * dtSeconds;
  const done = isSpringAtRest(nextValue, target, nextVelocity, config);

  if (done) {
    return Object.freeze({
      value: target,
      velocity: 0,
      done: true,
    });
  }

  return Object.freeze({
    value: nextValue,
    velocity: nextVelocity,
    done: false,
  });
}

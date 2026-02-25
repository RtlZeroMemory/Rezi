import { createRequire } from "node:module";
import React from "react";

type ReactLike = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: unknown;
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: unknown;
};

const CLIENT_INTERNALS_KEY =
  "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE" as const;
const LEGACY_INTERNALS_KEY = "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED" as const;

function getReactInternals(react: ReactLike): unknown {
  if (react && typeof react === "object") {
    if (CLIENT_INTERNALS_KEY in react) return react[CLIENT_INTERNALS_KEY];
    if (LEGACY_INTERNALS_KEY in react) return react[LEGACY_INTERNALS_KEY];
  }
  return undefined;
}

function setReactInternals(react: ReactLike, internals: unknown): void {
  if (!react || typeof react !== "object") return;
  if (CLIENT_INTERNALS_KEY in react) {
    react[CLIENT_INTERNALS_KEY] = internals;
    return;
  }
  if (LEGACY_INTERNALS_KEY in react) {
    react[LEGACY_INTERNALS_KEY] = internals;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function proxyInternalFields(target: unknown, source: unknown): void {
  const targetRecord = asRecord(target);
  const sourceRecord = asRecord(source);
  if (!targetRecord || !sourceRecord) return;

  const keys = new Set([...Object.keys(targetRecord), ...Object.keys(sourceRecord)]);
  for (const key of keys) {
    try {
      Object.defineProperty(targetRecord, key, {
        configurable: true,
        enumerable: true,
        get() {
          return sourceRecord[key];
        },
        set(next) {
          sourceRecord[key] = next;
        },
      });
    } catch {
      // Some React internals fields may not be re-definable in future versions.
      // Best effort only.
    }
  }
}

function loadHostReact(): ReactLike | null {
  try {
    const hostRequire = createRequire(`${process.cwd()}/package.json`);
    const hostReact = hostRequire("react") as ReactLike;
    if (hostReact && typeof hostReact === "object") return hostReact;
  } catch {
    // Best-effort bridge only.
  }
  return null;
}

/**
 * When ink-compat is linked from a workspace path, Node can load a separate React instance
 * from the linked package tree. Sharing internals avoids Invalid Hook Call failures by ensuring
 * both module instances point at the same current dispatcher.
 */
export function bridgeHostReactInternals(): void {
  const localReact = React as ReactLike;
  const hostReact = loadHostReact();
  if (!hostReact || hostReact === localReact) return;

  const localInternals = getReactInternals(localReact);
  const hostInternals = getReactInternals(hostReact);
  if (!localInternals || !hostInternals || localInternals === hostInternals) return;

  // Keep host internals object shape, but route all field reads/writes to local internals.
  // This makes host hooks read the same current dispatcher that local react-reconciler mutates.
  proxyInternalFields(hostInternals, localInternals);
  setReactInternals(hostReact, hostInternals);
}

bridgeHostReactInternals();

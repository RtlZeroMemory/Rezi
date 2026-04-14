import type { ScenarioCapabilityProfile } from "@rezi-ui/core/testing";

type EnvMap = Readonly<Record<string, string | undefined>>;

export const PTY_TARGET_SCENARIO_ID_ENV = "REZI_SCENARIO_ID" as const;
export const PTY_TARGET_NATIVE_CONFIG_ENV = "REZI_SCENARIO_NATIVE_CONFIG" as const;
export const PTY_TARGET_CAP_MOUSE_ENV = "ZIREAEL_CAP_MOUSE" as const;
export const PTY_TARGET_CAP_BRACKETED_PASTE_ENV = "ZIREAEL_CAP_BRACKETED_PASTE" as const;
export const PTY_TARGET_CAP_FOCUS_EVENTS_ENV = "ZIREAEL_CAP_FOCUS_EVENTS" as const;
export const PTY_TARGET_CAP_OSC52_ENV = "ZIREAEL_CAP_OSC52" as const;

export type PtyCapabilityProfileName =
  | "default-terminal"
  | "keyboard-only"
  | "paste-fallback"
  | "focus-fallback"
  | "clipboard-local-only"
  | "low-color";

export type PtyCapabilityProfileInput =
  | PtyCapabilityProfileName
  | Readonly<Partial<ScenarioCapabilityProfile>>;

function namedProfileOverrides(
  name: PtyCapabilityProfileName,
): Readonly<Partial<ScenarioCapabilityProfile>> {
  switch (name) {
    case "default-terminal":
      return Object.freeze({});
    case "keyboard-only":
      return Object.freeze({ supportsMouse: false });
    case "paste-fallback":
      return Object.freeze({ supportsBracketedPaste: false });
    case "focus-fallback":
      return Object.freeze({ supportsFocusEvents: false });
    case "clipboard-local-only":
      return Object.freeze({ supportsOsc52: false });
    case "low-color":
      return Object.freeze({ colorMode: "16" });
  }
}

export function resolvePtyCapabilityProfile(
  base: ScenarioCapabilityProfile,
  input: PtyCapabilityProfileInput | undefined = undefined,
): ScenarioCapabilityProfile {
  const overrides =
    input === undefined
      ? base
      : typeof input === "string"
        ? namedProfileOverrides(input)
        : input;
  return Object.freeze({
    ...base,
    ...overrides,
  });
}

function termEnvForColorMode(colorMode: ScenarioCapabilityProfile["colorMode"]): EnvMap {
  switch (colorMode) {
    case "none":
      return Object.freeze({
        TERM: "dumb",
        COLORTERM: undefined,
      });
    case "16":
      return Object.freeze({
        TERM: "xterm",
        COLORTERM: undefined,
      });
    case "256":
      return Object.freeze({
        TERM: "xterm-256color",
        COLORTERM: undefined,
      });
    case "truecolor":
      return Object.freeze({
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      });
  }
}

function nativeConfigForCapabilities(
  profile: ScenarioCapabilityProfile,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    plat: Object.freeze({
      enableMouse: profile.supportsMouse,
      enableBracketedPaste: profile.supportsBracketedPaste,
      enableFocusEvents: profile.supportsFocusEvents,
      enableOsc52: profile.supportsOsc52,
    }),
  });
}

export function buildPtyTargetEnv(
  args: Readonly<{
    scenarioId: string;
    capabilityProfile: ScenarioCapabilityProfile;
    env?: EnvMap;
  }>,
): EnvMap {
  const colorEnv = termEnvForColorMode(args.capabilityProfile.colorMode);
  return Object.freeze({
    ...(args.env ?? {}),
    ...colorEnv,
    [PTY_TARGET_CAP_MOUSE_ENV]: args.capabilityProfile.supportsMouse ? "1" : "0",
    [PTY_TARGET_CAP_BRACKETED_PASTE_ENV]: args.capabilityProfile.supportsBracketedPaste
      ? "1"
      : "0",
    [PTY_TARGET_CAP_FOCUS_EVENTS_ENV]: args.capabilityProfile.supportsFocusEvents ? "1" : "0",
    [PTY_TARGET_CAP_OSC52_ENV]: args.capabilityProfile.supportsOsc52 ? "1" : "0",
    [PTY_TARGET_SCENARIO_ID_ENV]: args.scenarioId,
    [PTY_TARGET_NATIVE_CONFIG_ENV]: JSON.stringify(
      nativeConfigForCapabilities(args.capabilityProfile),
    ),
  });
}

export function parsePtyTargetScenarioId(env: EnvMap = process.env as EnvMap): string {
  const raw = env[PTY_TARGET_SCENARIO_ID_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`${PTY_TARGET_SCENARIO_ID_ENV} is required`);
  }
  return raw.trim();
}

export function parsePtyTargetNativeConfig(
  env: EnvMap = process.env as EnvMap,
): Readonly<Record<string, unknown>> {
  const raw = env[PTY_TARGET_NATIVE_CONFIG_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) return Object.freeze({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${PTY_TARGET_NATIVE_CONFIG_ENV} must be valid JSON: ${detail}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${PTY_TARGET_NATIVE_CONFIG_ENV} must be a JSON object`);
  }
  return Object.freeze({ ...(parsed as Record<string, unknown>) });
}

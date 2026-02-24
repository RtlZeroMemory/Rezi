import type {
  CargoItem,
  CommsMessage,
  CrewMember,
  ShipToast,
  StarshipState,
  Subsystem,
} from "../types.js";

const FIRST_NAMES = Object.freeze([
  "Ari",
  "Mina",
  "Jules",
  "Soren",
  "Kei",
  "Tala",
  "Rin",
  "Nova",
  "Ezra",
  "Lena",
  "Iris",
  "Rowan",
  "Cato",
  "Yara",
  "Dax",
  "Milo",
  "Vera",
  "Niko",
  "Rhea",
  "Theo",
]);

const LAST_NAMES = Object.freeze([
  "Ortega",
  "Ramires",
  "Ishida",
  "Kovacs",
  "Singh",
  "Mbeki",
  "Voss",
  "Aalto",
  "Sato",
  "Mori",
  "Hawke",
  "Khan",
  "Liu",
  "Bauer",
  "Doyle",
  "Rios",
  "Quinn",
  "Sloan",
  "Yun",
  "Marek",
]);

const CARGO_NAMES = Object.freeze([
  "Deuterium Canister",
  "Quantum Relay",
  "Medical Kit",
  "Field Ration",
  "Sensor Array",
  "Shield Coupler",
  "Phaser Cell",
  "Nano Fiber",
  "Coolant Unit",
  "Warp Coil",
]);

const SENDERS = Object.freeze([
  "Fleet Command",
  "Outpost Vega",
  "USS Meridian",
  "Civilian Convoy",
  "Science Station Iota",
  "Medical Frigate",
  "Patrol Wing 7",
  "Engineering Net",
]);

const MESSAGE_FRAGMENTS = Object.freeze([
  "Requesting status update",
  "Long-range scan complete",
  "Navigation corridor stable",
  "Cargo transfer window open",
  "Radiation spike detected",
  "Docking approach confirmed",
  "Medical supply check-in",
  "Encrypted burst received",
]);

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return Math.floor(value);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function pick<T>(values: readonly T[], index: number): T {
  return values[index % values.length] as T;
}

function rankFor(index: number): CrewMember["rank"] {
  const roll = index % 16;
  if (roll === 0) return "captain";
  if (roll <= 2) return "commander";
  if (roll <= 8) return "lieutenant";
  return "ensign";
}

function statusFor(index: number): CrewMember["status"] {
  const roll = index % 12;
  if (roll === 0) return "injured";
  if (roll <= 2) return "away";
  if (roll <= 4) return "off-duty";
  return "active";
}

function departmentFor(index: number): CrewMember["department"] {
  const departments: readonly CrewMember["department"][] = [
    "bridge",
    "engineering",
    "medical",
    "science",
    "security",
  ];
  return departments[index % departments.length] ?? "bridge";
}

export function seedCrew(count: number): readonly CrewMember[] {
  const out: CrewMember[] = [];
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES, i * 7 + 3);
    const last = pick(LAST_NAMES, i * 11 + 5);
    const efficiencyBase = 58 + Math.floor(noise(i * 31 + 17) * 40);

    out.push(
      Object.freeze({
        id: `crew-${String(i + 1).padStart(3, "0")}`,
        name: `${first} ${last}`,
        rank: rankFor(i),
        department: departmentFor(i * 3 + 1),
        status: statusFor(i * 5 + 2),
        efficiency: clampInt(efficiencyBase, 45, 99),
      }),
    );
  }
  return Object.freeze(out);
}

export function seedSubsystems(): readonly Subsystem[] {
  const base: readonly Readonly<{ id: string; name: string; parent: string | null }>[] = [
    { id: "propulsion", name: "Propulsion", parent: null },
    { id: "warp-core", name: "Warp Core", parent: "propulsion" },
    { id: "impulse", name: "Impulse Engines", parent: "propulsion" },
    { id: "plasma", name: "Plasma Conduits", parent: "propulsion" },
    { id: "weapons", name: "Weapons", parent: null },
    { id: "phasers", name: "Phasers", parent: "weapons" },
    { id: "torpedoes", name: "Torpedoes", parent: "weapons" },
    { id: "shields", name: "Shields", parent: null },
    { id: "shields-forward", name: "Forward Shield Grid", parent: "shields" },
    { id: "shields-aft", name: "Aft Shield Grid", parent: "shields" },
    { id: "life-support", name: "Life Support", parent: null },
    { id: "atmosphere", name: "Atmosphere Processors", parent: "life-support" },
    { id: "gravity", name: "Gravity Control", parent: "life-support" },
    { id: "medical", name: "Medical Bay Systems", parent: "life-support" },
  ];

  const out = base.map((item, index) => {
    const health = clampInt(72 + Math.floor(noise(index * 19 + 13) * 27), 50, 100);
    const power = clampInt(44 + Math.floor(noise(index * 23 + 7) * 54), 20, 100);
    const temperature = 220 + Math.floor(noise(index * 29 + 5) * 340);
    return Object.freeze({
      id: item.id,
      name: item.name,
      parent: item.parent,
      health,
      power,
      temperature,
    });
  });

  return Object.freeze(out);
}

export function seedCargo(count: number): readonly CargoItem[] {
  const categories: readonly CargoItem["category"][] = [
    "fuel",
    "supplies",
    "equipment",
    "medical",
    "ordnance",
  ];

  const out: CargoItem[] = [];
  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length] ?? "supplies";
    const name = `${pick(CARGO_NAMES, i * 5 + 2)} ${String(i + 1).padStart(3, "0")}`;
    const quantity = 8 + Math.floor(noise(i * 17 + 11) * 980);
    const priority = 1 + Math.floor(noise(i * 37 + 41) * 5);
    const bay = 1 + ((i * 3 + Math.floor(noise(i + 1) * 9)) % 12);

    out.push(
      Object.freeze({
        id: `cargo-${String(i + 1).padStart(4, "0")}`,
        name,
        category,
        quantity,
        priority: clampInt(priority, 1, 5),
        bay,
      }),
    );
  }
  return Object.freeze(out);
}

export function seedMessages(count: number): readonly CommsMessage[] {
  const channels: readonly CommsMessage["channel"][] = ["fleet", "local", "emergency", "internal"];
  const priorities: readonly CommsMessage["priority"][] = ["routine", "urgent", "critical"];
  const out: CommsMessage[] = [];

  const now = Date.UTC(2401, 0, 1, 12, 0, 0);
  for (let i = 0; i < count; i++) {
    const channel = channels[i % channels.length] ?? "fleet";
    const priority = priorities[(i * 5) % priorities.length] ?? "routine";

    out.push(
      Object.freeze({
        id: `msg-${String(i + 1).padStart(4, "0")}`,
        timestamp: now - (count - i) * 52_000,
        channel,
        sender: pick(SENDERS, i * 3 + 1),
        content: `${pick(MESSAGE_FRAGMENTS, i * 7 + 2)} · ref ${String(3000 + i)}`,
        priority,
        acknowledged: i % 4 === 0,
      }),
    );
  }

  return Object.freeze(out);
}

export function generateToast(tick: number, state: StarshipState): ShipToast | null {
  if (tick <= 0) return null;
  if (tick % 9 !== 0 && tick % 13 !== 0) return null;

  const level: ShipToast["level"] =
    state.alertLevel === "red" ? "warning" : tick % 26 === 0 ? "error" : "info";
  const id = `toast-${tick}-${state.themeName}`;

  return Object.freeze({
    id,
    message:
      tick % 26 === 0
        ? "Hull vibration anomaly detected"
        : tick % 13 === 0
          ? "Long-range comms burst received"
          : "Subsystem telemetry synchronized",
    level,
    timestamp: state.nowMs,
    durationMs: level === "error" ? 6_000 : 4_000,
  });
}

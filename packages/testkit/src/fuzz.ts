import { test } from "./nodeTest.js";
import { type Rng, createRng } from "./rng.js";

export type FuzzIterationContext = Readonly<{
  label: string;
  seed: number;
  iteration: number;
  caseSeed: number;
  rng: Rng;
  note: (message: string) => void;
  fail: (message: string, cause?: unknown) => never;
}>;

export type FuzzRunOptions = Readonly<{
  seed: number;
  iterations: number;
  label?: string;
}>;

export type FuzzRunSummary = Readonly<{
  label: string;
  seed: number;
  iterations: number;
}>;

export type FuzzBody = (ctx: FuzzIterationContext) => void | Promise<void>;

export type FuzzFaultPlan<T extends string> = Readonly<{
  selected: readonly T[];
  has: (point: T) => boolean;
  describe: () => string;
}>;

export type FuzzFaultPlanOptions = Readonly<{
  minFailures?: number;
  maxFailures?: number;
}>;

export class FuzzFailureError extends Error {
  readonly label: string;
  readonly seed: number;
  readonly iteration: number;
  readonly caseSeed: number;
  readonly notes: readonly string[];

  constructor(
    ctx: Pick<FuzzIterationContext, "label" | "seed" | "iteration" | "caseSeed">,
    cause: unknown,
    notes: readonly string[],
  ) {
    const detail = describeThrown(cause);
    const noteText = notes.length === 0 ? "" : ` notes=[${notes.join("; ")}]`;
    super(
      `fuzz failed: ${ctx.label} seed=${hexSeed(ctx.seed)} iteration=${String(
        ctx.iteration,
      )} caseSeed=${hexSeed(ctx.caseSeed)}: ${detail}${noteText}`,
      { cause },
    );
    this.name = "FuzzFailureError";
    this.label = ctx.label;
    this.seed = ctx.seed;
    this.iteration = ctx.iteration;
    this.caseSeed = ctx.caseSeed;
    this.notes = Object.freeze([...notes]);
  }
}

export function hexSeed(seed: number): string {
  assertUInt32("seed", seed);
  return `0x${(seed >>> 0).toString(16).padStart(8, "0")}`;
}

export function deriveFuzzCaseSeed(seed: number, iteration: number): number {
  assertUInt32("seed", seed);
  assertNonNegativeInteger("iteration", iteration);

  let x = (seed ^ Math.imul(iteration + 0x9e37_79b9, 0x85eb_ca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb_352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846c_a68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x === 0 ? 0x9e37_79b9 : x;
}

export function randomInt(rng: Rng, min: number, max: number): number {
  assertInteger("min", min);
  assertInteger("max", max);
  if (max < min) {
    throw new Error(`randomInt: max must be >= min (got min=${String(min)} max=${String(max)})`);
  }
  return min + (rng.u32() % (max - min + 1));
}

export function chance(rng: Rng, percent: number): boolean {
  assertInteger("percent", percent);
  if (percent < 0 || percent > 100) {
    throw new Error(`chance: percent must be between 0 and 100 (got ${String(percent)})`);
  }
  return rng.u32() % 100 < percent;
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) throw new Error("pick: values must not be empty");
  const value = values[rng.u32() % values.length];
  if (value === undefined) throw new Error("pick: selected value is unexpectedly undefined");
  return value;
}

export function randomAsciiString(
  rng: Rng,
  opts: Readonly<{ minLength?: number; maxLength: number; alphabet?: string }>,
): string {
  const minLength = opts.minLength ?? 0;
  const maxLength = opts.maxLength;
  assertNonNegativeInteger("minLength", minLength);
  assertNonNegativeInteger("maxLength", maxLength);
  if (maxLength < minLength) {
    throw new Error(
      `randomAsciiString: maxLength must be >= minLength (got minLength=${String(
        minLength,
      )} maxLength=${String(maxLength)})`,
    );
  }

  const alphabet =
    opts.alphabet ?? "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_:/";
  if (alphabet.length === 0) throw new Error("randomAsciiString: alphabet must not be empty");

  const len = randomInt(rng, minLength, maxLength);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[rng.u32() % alphabet.length] ?? "x";
  }
  return out;
}

export async function runFuzz(options: FuzzRunOptions, body: FuzzBody): Promise<FuzzRunSummary> {
  const label = options.label ?? "fuzz";
  assertUInt32("seed", options.seed);
  assertPositiveInteger("iterations", options.iterations);

  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const caseSeed = deriveFuzzCaseSeed(options.seed, iteration);
    const notes: string[] = [];
    const ctx: FuzzIterationContext = Object.freeze({
      label,
      seed: options.seed >>> 0,
      iteration,
      caseSeed,
      rng: createRng(caseSeed),
      note(message: string): void {
        notes.push(message);
      },
      fail(message: string, cause?: unknown): never {
        throw new FuzzFailureError(
          { label, seed: options.seed >>> 0, iteration, caseSeed },
          cause === undefined ? new Error(message) : new Error(message, { cause }),
          notes,
        );
      },
    });

    try {
      await body(ctx);
    } catch (cause: unknown) {
      if (cause instanceof FuzzFailureError) throw cause;
      throw new FuzzFailureError(ctx, cause, notes);
    }
  }

  return Object.freeze({
    label,
    seed: options.seed >>> 0,
    iterations: options.iterations,
  });
}

export function fuzzTest(name: string, options: FuzzRunOptions, body: FuzzBody): void {
  const label = options.label ?? name;
  test(`${name} (${String(options.iterations)} iters, seed ${hexSeed(options.seed)})`, async () => {
    await runFuzz({ ...options, label }, body);
  });
}

export function createFuzzFaultPlan<T extends string>(
  ctx: FuzzIterationContext,
  points: readonly T[],
  opts: FuzzFaultPlanOptions = {},
): FuzzFaultPlan<T> {
  if (points.length === 0) throw new Error("createFuzzFaultPlan: points must not be empty");
  const uniquePoints = [...new Set(points)];
  if (uniquePoints.length !== points.length) {
    throw new Error("createFuzzFaultPlan: points must be unique");
  }
  const minFailures = opts.minFailures ?? 0;
  const maxFailures = opts.maxFailures ?? uniquePoints.length;
  assertNonNegativeInteger("minFailures", minFailures);
  assertNonNegativeInteger("maxFailures", maxFailures);
  if (minFailures > maxFailures) {
    throw new Error("createFuzzFaultPlan: minFailures must be <= maxFailures");
  }
  if (maxFailures > uniquePoints.length) {
    throw new Error("createFuzzFaultPlan: maxFailures must not exceed points.length");
  }

  const target = randomInt(ctx.rng, minFailures, maxFailures);
  const selected: T[] = [];
  while (selected.length < target) {
    const point = pick(ctx.rng, uniquePoints);
    if (!selected.includes(point)) selected.push(point);
  }
  selected.sort();
  const selectedSet = new Set<T>(selected);

  return Object.freeze({
    selected: Object.freeze([...selected]),
    has(point: T): boolean {
      return selectedSet.has(point);
    },
    describe(): string {
      return selected.length === 0 ? "none" : selected.join(",");
    },
  });
}

function assertInteger(name: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer (got ${String(value)})`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  assertInteger(name, value);
  if (value < 0) {
    throw new Error(`${name} must be a non-negative integer (got ${String(value)})`);
  }
}

function assertPositiveInteger(name: string, value: number): void {
  assertInteger(name, value);
  if (value <= 0) {
    throw new Error(`${name} must be a positive integer (got ${String(value)})`);
  }
}

function assertUInt32(name: string, value: number): void {
  assertNonNegativeInteger(name, value);
  if (value > 0xffff_ffff) {
    throw new Error(`${name} must be <= 0xffffffff (got ${String(value)})`);
  }
}

function describeThrown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return String(value);
  } catch {
    return "[unstringifiable thrown value]";
  }
}

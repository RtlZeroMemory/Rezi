import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TemplateKey = "dashboard" | "stress-test" | "cli-tool" | "minimal";

export type TemplateDefinition = {
  key: TemplateKey;
  label: string;
  description: string;
  safetyTag: string;
  safetyNote: string;
  highlights: readonly string[];
  dir: string;
};

export const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = [
  {
    key: "dashboard",
    label: "EdgeOps Dashboard",
    description: "Product-grade operations console with deterministic updates",
    safetyTag: "safe-default",
    safetyNote: "Balanced runtime profile for everyday app development.",
    highlights: [
      "fleet control plane with stable live telemetry",
      "incident feed + inspector + escalation runbook",
    ],
    dir: "dashboard",
  },
  {
    key: "stress-test",
    label: "Visual Benchmark Matrix",
    description:
      "Three-lane visual benchmark with deterministic sim model + real runtime diagnostics",
    safetyTag: "high-cpu-io",
    safetyNote: "Generates heavy CPU/IO pressure; intended for benchmarking only.",
    highlights: [
      "geometry + text/file activity + matrix rain lanes with phase-based intensity ramp",
      "deterministic sim scorecard and measured CPU/RSS/lag/timing/sink throughput",
    ],
    dir: "stress-test",
  },
  {
    key: "cli-tool",
    label: "Multi-Screen CLI Tool",
    description: "Task-oriented multi-screen TUI with first-party page routing",
    safetyTag: "safe-default",
    safetyNote: "Lightweight template focused on product workflows and routing.",
    highlights: [
      "home/logs/settings/detail screens with router history and focus restoration",
      "global route keybindings plus breadcrumb + tabs helpers wired to router state",
    ],
    dir: "cli-tool",
  },
  {
    key: "minimal",
    label: "Minimal Utility TUI",
    description: "Single-screen starter for focused tools with essential patterns only",
    safetyTag: "safe-default",
    safetyNote: "Small footprint template intended for quick utility workflows.",
    highlights: [
      "single-screen state flow with keybindings, theme cycling, and inline error handling",
      "lean multi-file structure plus reducer/render/keybinding test examples",
    ],
    dir: "minimal",
  },
] as const;

const TEMPLATE_BY_KEY = new Map(TEMPLATE_DEFINITIONS.map((template) => [template.key, template]));
const TEMPLATE_ALIASES = new Map<string, TemplateKey>(
  TEMPLATE_DEFINITIONS.map((template) => [template.key, template.key]),
);

TEMPLATE_ALIASES.set("dash", "dashboard");
TEMPLATE_ALIASES.set("stress", "stress-test");
TEMPLATE_ALIASES.set("chaos", "stress-test");
TEMPLATE_ALIASES.set("bench", "stress-test");
TEMPLATE_ALIASES.set("cli", "cli-tool");
TEMPLATE_ALIASES.set("tool", "cli-tool");
TEMPLATE_ALIASES.set("multiscreen", "cli-tool");
TEMPLATE_ALIASES.set("mini", "minimal");
TEMPLATE_ALIASES.set("basic", "minimal");
TEMPLATE_ALIASES.set("utility", "minimal");

const PACKAGE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export function normalizeTemplateName(value: string): TemplateKey | null {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;
  const slug = cleaned.replace(/[\s_]+/g, "-");
  const normalized = TEMPLATE_ALIASES.get(slug);
  if (normalized) return normalized;
  const compact = slug.replace(/-/g, "");
  return TEMPLATE_ALIASES.get(compact) ?? null;
}

export function toDisplayName(value: string): string {
  const name = value.trim();
  if (!name) return "Rezi App";
  const parts = name.split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "Rezi App";
  return parts.map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME_RE.test(name);
}

export function toValidPackageName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (isValidPackageName(trimmed)) return trimmed;
  const sanitized = trimmed
    .replace(/[^a-z0-9-._~@/]+/g, "-")
    .replace(/\/+/, "/")
    .replace(/\/+$/, "")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  if (isValidPackageName(sanitized)) return sanitized;
  return "rezi-app";
}

export function resolveTargetName(targetDir: string): string {
  const resolved = resolve(targetDir);
  const base = basename(resolved);
  return base || "rezi-app";
}

export function getTemplatesRoot(): string {
  return fileURLToPath(new URL("../templates", import.meta.url));
}

export async function ensureEmptyDir(dir: string): Promise<void> {
  try {
    const stats = await stat(dir);
    if (!stats.isDirectory()) {
      throw new Error(`Target path exists and is not a directory: ${dir}`);
    }
    const entries = await readdir(dir);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${dir}`);
    }
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      await mkdir(dir, { recursive: true });
      return;
    }
    throw err;
  }
}

function applySubstitutions(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`__${key}__`, value);
  }
  return out;
}

async function copyTemplateDir(
  sourceDir: string,
  targetDir: string,
  vars: Record<string, string>,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(sourceDir, entry.name);
    const destPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyTemplateDir(srcPath, destPath, vars);
      continue;
    }
    const raw = await readFile(srcPath, "utf8");
    const next = applySubstitutions(raw, vars);
    await writeFile(destPath, next, "utf8");
  }
}

export type CreateProjectOptions = {
  targetDir: string;
  templateKey: TemplateKey;
  packageName: string;
  displayName: string;
};

export type CreateProjectResult = {
  targetDir: string;
  template: TemplateDefinition;
  packageName: string;
  displayName: string;
};

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  const template = TEMPLATE_BY_KEY.get(options.templateKey);
  if (!template) {
    throw new Error(`Unknown template: ${options.templateKey}`);
  }

  await ensureEmptyDir(options.targetDir);

  const templatesRoot = getTemplatesRoot();
  const sourceDir = join(templatesRoot, template.dir);
  const vars = {
    APP_NAME: options.displayName,
    PACKAGE_NAME: options.packageName,
    TEMPLATE_LABEL: template.label,
    TEMPLATE_KEY: template.key,
  };

  await copyTemplateDir(sourceDir, options.targetDir, vars);

  return {
    targetDir: options.targetDir,
    template,
    packageName: options.packageName,
    displayName: options.displayName,
  };
}

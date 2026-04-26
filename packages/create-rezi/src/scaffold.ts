import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TemplateKey = "minimal" | "cli-tool" | "starship";

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
    key: "minimal",
    label: "Minimal Utility TUI",
    description: "Small single-screen starter for focused terminal utilities",
    safetyTag: "safe-default",
    safetyNote: "Small-footprint template for quick utility workflows.",
    highlights: [
      "single-screen state flow with keybindings, theme cycling, and inline error handling",
      "lean multi-file structure plus reducer/render/keybinding test examples",
    ],
    dir: "minimal",
  },
  {
    key: "cli-tool",
    label: "Multi-Screen CLI Tool",
    description: "Routed starter for product-style terminal tools",
    safetyTag: "safe-default",
    safetyNote: "Lightweight template focused on product workflows and routing.",
    highlights: [
      "home/logs/settings screens with router history and focus restoration",
      "global route keybindings plus breadcrumb and tabs helpers wired to router state",
    ],
    dir: "cli-tool",
  },
  {
    key: "starship",
    label: "Starship Command Console",
    description:
      "Larger command-console showcase for routing, animation, charts, forms, and overlays",
    safetyTag: "safe-default",
    safetyNote:
      "Feature-rich showcase template with moderate CPU usage from animation hooks and live telemetry.",
    highlights: [
      "six-screen command console with routing, animated gauges, live telemetry charts, and crew management",
      "command palette, modal dialogs, toast notifications, forms, split panes, canvas, and theme cycling with keybinding modes",
    ],
    dir: "starship",
  },
] as const;

const TEMPLATE_FILENAME_ALIASES = new Map<string, string>([
  ["gitignore", ".gitignore"],
  ["npmignore", ".npmignore"],
]);

const TEMPLATE_BY_KEY = new Map(TEMPLATE_DEFINITIONS.map((template) => [template.key, template]));
const TEMPLATE_ALIASES = new Map<string, TemplateKey>(
  TEMPLATE_DEFINITIONS.map((template) => [template.key, template.key]),
);

TEMPLATE_ALIASES.set("cli", "cli-tool");
TEMPLATE_ALIASES.set("tool", "cli-tool");
TEMPLATE_ALIASES.set("multiscreen", "cli-tool");
TEMPLATE_ALIASES.set("mini", "minimal");
TEMPLATE_ALIASES.set("basic", "minimal");
TEMPLATE_ALIASES.set("utility", "minimal");
TEMPLATE_ALIASES.set("ship", "starship");
TEMPLATE_ALIASES.set("bridge", "starship");
TEMPLATE_ALIASES.set("command", "starship");

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
    const destName = TEMPLATE_FILENAME_ALIASES.get(entry.name) ?? entry.name;
    const destPath = join(targetDir, destName);
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

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TemplateKey = "dashboard" | "form-app" | "file-browser" | "streaming-viewer";

export type TemplateDefinition = {
  key: TemplateKey;
  label: string;
  description: string;
  highlights: readonly string[];
  dir: string;
};

export const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Live ops dashboard with deterministic table updates",
    highlights: [
      "live-updating table with stable row keys",
      "filter/sort/pin controls + incident telemetry",
    ],
    dir: "dashboard",
  },
  {
    key: "form-app",
    label: "Form app",
    description: "Multi-step form with validation and command modes",
    highlights: ["insert/command key modes with chords", "modal help and toast notifications"],
    dir: "form-app",
  },
  {
    key: "file-browser",
    label: "File browser",
    description: "Explorer with async command palette search",
    highlights: [
      "async palette results with cancellation",
      "table browser with details and preview",
    ],
    dir: "file-browser",
  },
  {
    key: "streaming-viewer",
    label: "Streaming viewer",
    description: "High-volume stream monitor with virtualized index",
    highlights: ["virtual list over 15k streams", "live ingest feed with follow/pause controls"],
    dir: "streaming-viewer",
  },
] as const;

const TEMPLATE_BY_KEY = new Map(TEMPLATE_DEFINITIONS.map((template) => [template.key, template]));
const TEMPLATE_ALIASES = new Map<string, TemplateKey>(
  TEMPLATE_DEFINITIONS.map((template) => [template.key, template.key]),
);

TEMPLATE_ALIASES.set("form", "form-app");
TEMPLATE_ALIASES.set("formapp", "form-app");
TEMPLATE_ALIASES.set("file", "file-browser");
TEMPLATE_ALIASES.set("files", "file-browser");
TEMPLATE_ALIASES.set("filebrowser", "file-browser");
TEMPLATE_ALIASES.set("stream", "streaming-viewer");
TEMPLATE_ALIASES.set("streaming", "streaming-viewer");
TEMPLATE_ALIASES.set("streamingviewer", "streaming-viewer");

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

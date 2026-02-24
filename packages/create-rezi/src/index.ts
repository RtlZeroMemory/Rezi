#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { cwd, exit, stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  TEMPLATE_DEFINITIONS,
  createProject,
  isValidPackageName,
  normalizeTemplateName,
  resolveTargetName,
  toDisplayName,
  toValidPackageName,
} from "./scaffold.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type CliOptions = {
  targetDir?: string;
  template?: string;
  install: boolean;
  packageManager?: PackageManager;
  listTemplates: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    install: true,
    listTemplates: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--list-templates" || arg === "--templates") {
      options.listTemplates = true;
      continue;
    }
    if (arg === "--no-install" || arg === "--skip-install") {
      options.install = false;
      continue;
    }
    if (arg === "--template" || arg === "-t") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --template");
      options.template = value;
      i++;
      continue;
    }
    if (arg.startsWith("--template=")) {
      options.template = arg.slice("--template=".length);
      continue;
    }
    if (arg === "--pm" || arg === "--package-manager") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --pm");
      options.packageManager = value as PackageManager;
      i++;
      continue;
    }
    if (arg.startsWith("--pm=")) {
      options.packageManager = arg.slice("--pm=".length) as PackageManager;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!options.targetDir) {
      options.targetDir = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return options;
}

function printHelp(): void {
  stdout.write("create-rezi\n\n");
  stdout.write("Usage:\n");
  stdout.write("  npm create rezi my-app\n");
  stdout.write("  bun create rezi my-app\n\n");
  stdout.write("Options:\n");
  stdout.write(
    "  --template, -t <name>       dashboard | stress-test | cli-tool | animation-lab | minimal | starship\n",
  );
  stdout.write("  --no-install                Skip dependency install\n");
  stdout.write("  --pm <npm|pnpm|yarn|bun>    Choose a package manager\n");
  stdout.write("  --list-templates            Show templates and highlights\n");
  stdout.write("  --help, -h                  Show this help\n");
}

function printTemplates(): void {
  stdout.write("Available templates (--template <name>):\n");
  TEMPLATE_DEFINITIONS.forEach((template, index) => {
    const defaultSuffix = index === 0 ? " (default)" : "";
    const highlights = template.highlights.join(" | ");
    stdout.write(`  ${index + 1}. ${template.key.padEnd(16)} ${template.label}${defaultSuffix}\n`);
    stdout.write(`      ${template.description}\n`);
    stdout.write(`      Safety: ${template.safetyTag} — ${template.safetyNote}\n`);
    stdout.write(`      Highlights: ${highlights}\n`);
  });
}

function detectPackageManager(): PackageManager {
  // biome-ignore lint/complexity/useLiteralKeys: process.env uses an index signature in TS.
  const ua = process.env["npm_config_user_agent"] ?? "";
  if (ua.startsWith("pnpm/")) return "pnpm";
  if (ua.startsWith("yarn/")) return "yarn";
  if (ua.startsWith("bun/")) return "bun";
  return "npm";
}

function resolvePackageManager(value?: string): PackageManager {
  if (!value) return detectPackageManager();
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "npm" ||
    normalized === "pnpm" ||
    normalized === "yarn" ||
    normalized === "bun"
  ) {
    return normalized as PackageManager;
  }
  throw new Error(`Unsupported package manager: ${value}`);
}

async function promptText(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback: string,
): Promise<string> {
  const answer = await rl.question(`${prompt} (${fallback}): `);
  return answer.trim() || fallback;
}

async function promptTemplate(rl: ReturnType<typeof createInterface>): Promise<string> {
  stdout.write("\nSelect a template (name or number):\n");
  TEMPLATE_DEFINITIONS.forEach((template, index) => {
    const defaultSuffix = index === 0 ? " (default)" : "";
    stdout.write(`  ${index + 1}. ${template.key.padEnd(16)} ${template.label}${defaultSuffix}\n`);
    stdout.write(`      ${template.description}\n`);
    stdout.write(`      Safety: ${template.safetyTag} — ${template.safetyNote}\n`);
    stdout.write(`      Highlights: ${template.highlights.join(" | ")}\n`);
  });

  const answer = await rl.question(`Template (1-${TEMPLATE_DEFINITIONS.length}, default 1): `);
  const trimmed = answer.trim();
  if (!trimmed) {
    return TEMPLATE_DEFINITIONS[0]?.key ?? "dashboard";
  }

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= TEMPLATE_DEFINITIONS.length) {
    return TEMPLATE_DEFINITIONS[asNumber - 1]?.key ?? TEMPLATE_DEFINITIONS[0]?.key ?? "dashboard";
  }

  return trimmed;
}

async function confirmStressTemplate(rl: ReturnType<typeof createInterface>): Promise<boolean> {
  stdout.write("\nSafety check for stress-test template:\n");
  stdout.write("  - This template intentionally drives heavy CPU and optional disk I/O load.\n");
  stdout.write("  - Turbo/write-flood modes increase system pressure.\n");
  const answer = await rl.question("Continue with stress-test? (y/N): ");
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

function runInstall(pm: PackageManager, targetDir: string): void {
  const res = spawnSync(pm, ["install"], {
    cwd: targetDir,
    stdio: "inherit",
  });
  if (res.status !== 0) {
    throw new Error(`${pm} install failed`);
  }
}

function printNextSteps(
  targetDir: string,
  packageManager: PackageManager,
  installRan: boolean,
): void {
  const installCommand = `${packageManager} install`;
  const startCommand =
    packageManager === "npm" || packageManager === "bun"
      ? `${packageManager} run start`
      : `${packageManager} start`;

  const rel = relative(cwd(), resolve(targetDir)) || ".";
  stdout.write("\nNext steps:\n");
  if (rel !== ".") {
    stdout.write(`  cd ${rel}\n`);
  }
  if (!installRan) {
    stdout.write(`  ${installCommand}\n`);
  }
  stdout.write(`  ${startCommand}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const isInteractive = Boolean(stdin.isTTY && stdout.isTTY);

  if (options.help) {
    printHelp();
    return;
  }

  if (options.listTemplates) {
    printTemplates();
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const targetDir = options.targetDir || (await promptText(rl, "Project name", "rezi-app"));
    const templateInput = options.template || (await promptTemplate(rl));
    const templateKey = normalizeTemplateName(templateInput);
    if (!templateKey) {
      const allowed = TEMPLATE_DEFINITIONS.map((template) => template.key).join(", ");
      stdout.write(`\nUnknown template: ${templateInput}\n`);
      stdout.write(`Use one of: ${allowed}\n`);
      stdout.write("Run with --list-templates to see highlights.\n");
      throw new Error("Invalid template");
    }

    if (templateKey === "stress-test") {
      if (isInteractive) {
        const confirmed = await confirmStressTemplate(rl);
        if (!confirmed) {
          stdout.write("\nTemplate selection cancelled.\n");
          return;
        }
      } else {
        stdout.write(
          "\nSafety notice: stress-test template selected in non-interactive mode; skipping prompt.\n",
        );
      }
    }

    const rawName = resolveTargetName(targetDir);
    const displayName = toDisplayName(rawName);
    const packageName = toValidPackageName(rawName);
    if (!isValidPackageName(rawName)) {
      stdout.write(`\nUsing package name: ${packageName}\n`);
    }

    const packageManager = resolvePackageManager(options.packageManager);

    stdout.write(`\nCreating Rezi app in ${targetDir}...\n`);

    await createProject({
      targetDir,
      templateKey,
      packageName,
      displayName,
    });

    if (options.install) {
      stdout.write(`\nInstalling dependencies with ${packageManager}...\n`);
      runInstall(packageManager, targetDir);
    }

    printNextSteps(targetDir, packageManager, options.install);
  } finally {
    rl.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    stdout.write(`\ncreate-rezi error: ${err instanceof Error ? err.message : String(err)}\n`);
    exit(1);
  });
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const supportsTestConcurrency = process.allowedNodeEnvironmentFlags.has("--test-concurrency");
const nodeTestArgs = ["--test", ...(supportsTestConcurrency ? ["--test-concurrency=1"] : [])];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const releaseCriticalSuites = Object.freeze([
  Object.freeze({
    id: "input-editing-and-focus",
    title: "Input editing and focus-capture contracts",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/runtime/__tests__/inputEditor.contract.test.js",
          "packages/core/dist/testing/__tests__/referenceScenario.semantic.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "table-visible-behavior",
    title: "Table selection, sorting, viewport, and row-key behavior",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/app/__tests__/table.interactions.test.js",
          "packages/core/dist/widgets/__tests__/table.selection.test.js",
          "packages/core/dist/widgets/__tests__/table.sorting.test.js",
          "packages/core/dist/widgets/__tests__/table.virtualization.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "virtual-list-range-and-navigation",
    title: "Virtual-list visible range and navigation behavior",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/widgets/__tests__/virtualList.contract.test.js",
          "packages/core/dist/widgets/__tests__/virtualList.keyboard.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "command-palette-behavior",
    title: "Command palette query, async fetch, selection, and close behavior",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/app/__tests__/commandPaletteRouting.test.js",
          "packages/core/dist/widgets/__tests__/commandPalette.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "file-navigation-behavior",
    title: "File picker and file-tree explorer browse, open, and select flows",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/app/__tests__/filePickerRouting.contracts.test.js",
          "packages/core/dist/app/__tests__/fileTreeExplorer.contextMenu.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "modal-focus-behavior",
    title: "Modal focus entry and return behavior",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/widgets/__tests__/modal.focus.test.js",
          "packages/core/dist/app/__tests__/widgetBehavior.contracts.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "code-editor-behavior",
    title: "Code editor editing, selection, and scroll behavior",
    slice: "release-critical-packages",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/core/dist/widgets/__tests__/codeEditor.editing.test.js",
          "packages/core/dist/widgets/__tests__/codeEditor.selection.test.js",
          "packages/core/dist/widgets/__tests__/codeEditor.scroll.test.js",
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: "terminal-runtime-behavior",
    title: "Node terminal IO and worker/native backend flow",
    slice: "release-critical-terminal",
    commands: Object.freeze([
      Object.freeze({
        kind: "node-test",
        files: Object.freeze([
          "packages/node/dist/__tests__/ptyScenario.test.js",
          "packages/node/dist/__tests__/worker_integration.test.js",
          "packages/node/dist/__e2e__/terminal_io_contract.e2e.test.js",
        ]),
      }),
      Object.freeze({
        kind: "npm-script",
        script: "test:native:smoke",
      }),
    ]),
  }),
]);

const referenceScenarioExpectations = Object.freeze({
  ptyScenarioIds: Object.freeze([
    "input-modal-blocking-focus-restore",
    "input-incomplete-paste-recovers",
    "input-mouse-disabled-keeps-keyboard-focus",
    "input-incomplete-escape-recovers",
    "virtual-list-resize-storm-stays-interactive",
  ]),
  failureFallbackScenarioIds: Object.freeze([
    "input-incomplete-paste-recovers",
    "input-mouse-disabled-keeps-keyboard-focus",
    "input-incomplete-escape-recovers",
    "virtual-list-resize-storm-stays-interactive",
  ]),
});

function parseArgs(argv) {
  const [command, value, extra] = argv;
  const json = argv.includes("--json");

  if (command === "summary") {
    const unexpected = argv.slice(1).filter((arg) => arg !== "--json");
    if (unexpected.length > 0) {
      throw new Error(`testing-slices: unexpected extra argument: ${unexpected[0]}`);
    }
    return { command, json };
  }

  if (command === "run") {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("testing-slices: run requires a slice name");
    }
    if (typeof extra === "string") {
      throw new Error(`testing-slices: unexpected extra argument: ${extra}`);
    }
    return { command, slice: value, json };
  }

  throw new Error("testing-slices: expected `summary` or `run <slice>`");
}

function collectReferenceScenarios() {
  const dir = join(root, "packages", "core", "src", "testing", "referenceScenarios");
  const files = readdirSync(dir)
    .filter((entry) => entry.endsWith(".ts"))
    .sort();

  return files.map((file) => {
    const content = readFileSync(join(dir, file), "utf8");
    const id = content.match(/\bid:\s*"([^"]+)"/u)?.[1];
    const fidelity = content.match(/\bfidelityRequirement:\s*"([^"]+)"/u)?.[1];
    if (!id || !fidelity) {
      throw new Error(`testing-slices: failed to parse scenario metadata from ${file}`);
    }
    return Object.freeze({ file, id, fidelity });
  });
}

function buildSummary() {
  const scenarios = collectReferenceScenarios();
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));

  for (const scenarioId of referenceScenarioExpectations.ptyScenarioIds) {
    if (!scenarioIds.has(scenarioId)) {
      throw new Error(`testing-slices: missing expected PTY scenario id ${scenarioId}`);
    }
  }

  for (const scenarioId of referenceScenarioExpectations.failureFallbackScenarioIds) {
    if (!scenarioIds.has(scenarioId)) {
      throw new Error(
        `testing-slices: missing expected failure/fallback scenario id ${scenarioId}`,
      );
    }
  }

  const packageSuites = releaseCriticalSuites.filter(
    (suite) => suite.slice === "release-critical-packages",
  );
  const terminalSuites = releaseCriticalSuites.filter(
    (suite) => suite.slice === "release-critical-terminal",
  );

  return Object.freeze({
    metrics: Object.freeze({
      releaseCriticalSuiteCount: releaseCriticalSuites.length,
      releaseCriticalPackageSuiteCount: packageSuites.length,
      releaseCriticalTerminalSuiteCount: terminalSuites.length,
      referenceScenarioCount: scenarios.length,
      terminalRealReferenceScenarioCount: scenarios.filter(
        (scenario) => scenario.fidelity === "terminal-real",
      ).length,
      ptyReferenceScenarioCount: referenceScenarioExpectations.ptyScenarioIds.length,
      failureFallbackReferenceScenarioCount:
        referenceScenarioExpectations.failureFallbackScenarioIds.length,
    }),
    groups: Object.freeze({
      "release-critical-packages": packageSuites.map((suite) => suite.id),
      "release-critical-terminal": terminalSuites.map((suite) => suite.id),
      "release-critical-all": releaseCriticalSuites.map((suite) => suite.id),
    }),
    releaseCriticalSuites: releaseCriticalSuites.map((suite) =>
      Object.freeze({
        id: suite.id,
        title: suite.title,
        slice: suite.slice,
      }),
    ),
    scenarios,
  });
}

function renderMarkdown(summary) {
  const lines = [
    "## Testing progress",
    "",
    `- Release-critical suites with named CI slices: ${summary.metrics.releaseCriticalSuiteCount}`,
    `- Release-critical package suites: ${summary.metrics.releaseCriticalPackageSuiteCount}`,
    `- Release-critical terminal suites: ${summary.metrics.releaseCriticalTerminalSuiteCount}`,
    `- Shared reference scenarios: ${summary.metrics.referenceScenarioCount}`,
    `- Terminal-real reference scenarios: ${summary.metrics.terminalRealReferenceScenarioCount}`,
    `- PTY-backed reference scenarios: ${summary.metrics.ptyReferenceScenarioCount}`,
    `- Failure/fallback reference scenarios: ${summary.metrics.failureFallbackReferenceScenarioCount}`,
    "",
    "## Release-critical suites",
    "",
  ];

  for (const suite of summary.releaseCriticalSuites) {
    const sliceLabel =
      suite.slice === "release-critical-terminal" ? "terminal-real slice" : "package slice";
    lines.push(`- ${suite.title} \`${suite.id}\` (${sliceLabel})`);
  }

  return `${lines.join("\n")}\n`;
}

function suiteIdsForSlice(slice) {
  if (
    slice !== "release-critical-packages" &&
    slice !== "release-critical-terminal" &&
    slice !== "release-critical-all"
  ) {
    throw new Error(`testing-slices: unknown slice ${slice}`);
  }

  if (slice === "release-critical-all") {
    return releaseCriticalSuites.map((suite) => suite.id);
  }

  return releaseCriticalSuites.filter((suite) => suite.slice === slice).map((suite) => suite.id);
}

function beginGroup(title) {
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stdout.write(`::group::${title}\n`);
    return;
  }
  process.stdout.write(`\n=== ${title} ===\n`);
}

function endGroup() {
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stdout.write("::endgroup::\n");
  }
}

function ensureFilesExist(files) {
  for (const file of files) {
    if (!existsSync(join(root, file))) {
      throw new Error(`testing-slices: missing ${file}; build the repo first so dist tests exist`);
    }
  }
}

function runNodeTests(files) {
  ensureFilesExist(files);
  const result = spawnSync(process.execPath, [...nodeTestArgs, ...files], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpmScript(script) {
  const result = spawnSync(npmCommand, ["run", script], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runSlice(slice) {
  for (const suiteId of suiteIdsForSlice(slice)) {
    const suite = releaseCriticalSuites.find((candidate) => candidate.id === suiteId);
    if (!suite) {
      throw new Error(`testing-slices: unknown suite id ${suiteId}`);
    }

    beginGroup(suite.title);
    for (const command of suite.commands) {
      if (command.kind === "node-test") {
        process.stdout.write(`node --test ${command.files.join(" ")}\n`);
        runNodeTests([...command.files]);
        continue;
      }

      process.stdout.write(`npm run ${command.script}\n`);
      runNpmScript(command.script);
    }
    endGroup();
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.command === "summary") {
  const summary = buildSummary();
  process.stdout.write(
    args.json ? `${JSON.stringify(summary, null, 2)}\n` : renderMarkdown(summary),
  );
} else {
  runSlice(args.slice);
}

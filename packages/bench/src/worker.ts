#!/usr/bin/env node
/**
 * Worker process: runs a single (scenario, params, framework) benchmark in isolation.
 *
 * Why: process-level isolation avoids cross-framework contamination for memory (RSS)
 * and reduces incidental shared state (timers, module caches, retained trees).
 */

import { writeFileSync } from "node:fs";
import { scenarios } from "./scenarios/index.js";
import type { BenchResult, Framework, ScenarioConfig } from "./types.js";

type Payload = Readonly<{
  scenario: string;
  framework: Framework;
  config: ScenarioConfig;
  params: Record<string, number | string>;
  replicate: number;
}>;

function parseArgs(argv: string[]): { payloadB64: string | null; resultPath: string | null } {
  let payloadB64: string | null = null;
  let resultPath: string | null = null;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--payload") payloadB64 = argv[++i] ?? null;
    if (arg === "--result-path") resultPath = argv[++i] ?? null;
  }
  return { payloadB64, resultPath };
}

async function main(): Promise<void> {
  const { payloadB64, resultPath } = parseArgs(process.argv);
  if (!payloadB64) {
    console.error(JSON.stringify({ ok: false, error: "missing --payload" }));
    process.exit(2);
  }

  let payload: Payload;
  try {
    const json = Buffer.from(payloadB64, "base64").toString("utf-8");
    payload = JSON.parse(json) as Payload;
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `invalid payload: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
    process.exit(2);
  }

  const scenario = scenarios.find((s) => s.name === payload.scenario);
  if (!scenario) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `unknown scenario "${payload.scenario}". Available: ${scenarios.map((s) => s.name).join(", ")}`,
      }),
    );
    process.exit(2);
  }

  if (!scenario.frameworks.includes(payload.framework)) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `scenario "${payload.scenario}" does not support framework "${payload.framework}"`,
      }),
    );
    process.exit(2);
  }

  const timestamp = new Date().toISOString();
  const executionFramework: Framework =
    payload.framework === "bubbletea" ? "opentui" : payload.framework;

  try {
    const metrics = await scenario.run(executionFramework, payload.config, payload.params);
    const result: BenchResult = {
      scenario: scenario.name,
      framework: payload.framework,
      params: { ...payload.params },
      metrics,
      replicate: payload.replicate,
      timestamp,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    const out = JSON.stringify({ ok: true, result });
    if (resultPath) {
      writeFileSync(resultPath, out, "utf-8");
    } else {
      process.stdout.write(`${out}\n`);
    }
  } catch (err) {
    const out = JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      timestamp,
    });
    if (resultPath) {
      writeFileSync(resultPath, out, "utf-8");
    } else {
      process.stdout.write(`${out}\n`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  process.exit(1);
});

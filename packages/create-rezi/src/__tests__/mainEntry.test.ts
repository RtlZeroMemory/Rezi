import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assert, test } from "@rezi-ui/testkit";
import { isMainModuleEntry } from "../mainEntry.js";

test("isMainModuleEntry returns true for direct script execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "rezi-main-entry-"));
  const scriptPath = join(root, "create-rezi.mjs");
  await writeFile(scriptPath, "export {};\n", "utf8");

  const moduleUrl = pathToFileURL(scriptPath).href;
  assert.equal(isMainModuleEntry(scriptPath, moduleUrl), true);
});

test("isMainModuleEntry resolves symlinked launchers", async () => {
  const root = await mkdtemp(join(tmpdir(), "rezi-main-entry-"));
  const scriptPath = join(root, "dist-index.mjs");
  const launcherPath = join(root, "launcher.mjs");
  await writeFile(scriptPath, "export {};\n", "utf8");
  await symlink(scriptPath, launcherPath);

  const moduleUrl = pathToFileURL(scriptPath).href;
  assert.equal(isMainModuleEntry(launcherPath, moduleUrl), true);
});

test("isMainModuleEntry rejects non-matching entry paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "rezi-main-entry-"));
  const scriptPath = join(root, "dist-index.mjs");
  const otherPath = join(root, "other.mjs");
  await writeFile(scriptPath, "export {};\n", "utf8");
  await writeFile(otherPath, "export {};\n", "utf8");

  const moduleUrl = pathToFileURL(scriptPath).href;
  assert.equal(isMainModuleEntry(otherPath, moduleUrl), false);
  assert.equal(isMainModuleEntry(undefined, moduleUrl), false);
});

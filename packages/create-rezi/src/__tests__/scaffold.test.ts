import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, test } from "@rezi-ui/testkit";
import { createProject, normalizeTemplateName, toValidPackageName } from "../scaffold.js";

test("normalizeTemplateName accepts friendly aliases", () => {
  assert.equal(normalizeTemplateName("form app"), "form-app");
  assert.equal(normalizeTemplateName("file-browser"), "file-browser");
  assert.equal(normalizeTemplateName("streaming"), "streaming-viewer");
});

test("createProject scaffolds a dashboard project with substitutions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rezi-create-"));
  const targetDir = join(root, "my-app");
  const displayName = "My Rezi App";
  const packageName = toValidPackageName("my-rezi-app");

  await createProject({
    targetDir,
    templateKey: "dashboard",
    packageName,
    displayName,
  });

  const pkgRaw = await readFile(join(targetDir, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as { name: string };
  assert.equal(pkg.name, packageName);

  const main = await readFile(join(targetDir, "src", "main.ts"), "utf8");
  assert.ok(main.includes(displayName));
  assert.ok(!main.includes("__APP_NAME__"));
});

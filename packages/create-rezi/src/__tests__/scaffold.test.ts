import { access, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, test } from "@rezi-ui/testkit";
import {
  TEMPLATE_DEFINITIONS,
  createProject,
  getTemplatesRoot,
  normalizeTemplateName,
  toValidPackageName,
} from "../scaffold.js";

test("normalizeTemplateName accepts friendly aliases", () => {
  assert.equal(normalizeTemplateName("dashboard"), "dashboard");
  assert.equal(normalizeTemplateName("dash"), "dashboard");
  assert.equal(normalizeTemplateName("stress-test"), "stress-test");
  assert.equal(normalizeTemplateName("stress"), "stress-test");
  assert.equal(normalizeTemplateName("chaos"), "stress-test");
  assert.equal(normalizeTemplateName("bench"), "stress-test");
  assert.equal(normalizeTemplateName("cli-tool"), "cli-tool");
  assert.equal(normalizeTemplateName("cli"), "cli-tool");
  assert.equal(normalizeTemplateName("tool"), "cli-tool");
  assert.equal(normalizeTemplateName("multi_screen"), "cli-tool");
  assert.equal(normalizeTemplateName("minimal"), "minimal");
  assert.equal(normalizeTemplateName("mini"), "minimal");
  assert.equal(normalizeTemplateName("basic"), "minimal");
  assert.equal(normalizeTemplateName("utility"), "minimal");
});

test("template keys match template directories and include highlights", async () => {
  const expectedKeys = ["dashboard", "stress-test", "cli-tool", "minimal"];
  const keys = TEMPLATE_DEFINITIONS.map((template) => template.key);
  assert.equal(keys.join(","), expectedKeys.join(","));

  const directories = (await readdir(getTemplatesRoot(), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const definedDirectories = TEMPLATE_DEFINITIONS.map((template) => template.dir).sort();
  assert.equal(directories.join(","), definedDirectories.join(","));

  for (const template of TEMPLATE_DEFINITIONS) {
    assert.equal(template.dir, template.key);
    assert.ok(template.highlights.length >= 2);
  }
});

test("createProject scaffolds each template with substitutions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rezi-create-"));

  for (const template of TEMPLATE_DEFINITIONS) {
    const targetDir = join(root, template.key);
    const displayName = `My ${template.label}`;
    const packageName = toValidPackageName(`my-${template.key}`);

    await createProject({
      targetDir,
      templateKey: template.key,
      packageName,
      displayName,
    });

    const pkgRaw = await readFile(join(targetDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { name: string };
    assert.equal(pkg.name, packageName);

    const main = await readFile(join(targetDir, "src", "main.ts"), "utf8");
    let appNameSource = main;
    let appNamePath = join(targetDir, "src", "main.ts");

    const themePath = join(targetDir, "src", "theme.ts");
    try {
      await access(themePath);
      appNameSource = await readFile(themePath, "utf8");
      appNamePath = themePath;
    } catch {
      // Fallback to main.ts for legacy templates.
    }

    assert.ok(
      appNameSource.includes(displayName),
      `Expected ${appNamePath} to include scaffolded display name`,
    );
    assert.ok(!appNameSource.includes("__APP_NAME__"));

    const readme = await readFile(join(targetDir, "README.md"), "utf8");
    assert.ok(readme.includes(template.label));
    assert.ok(!readme.includes("__TEMPLATE_LABEL__"));
  }
});

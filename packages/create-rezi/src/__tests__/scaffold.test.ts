import { mkdtemp, readFile, readdir } from "node:fs/promises";
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
  assert.equal(normalizeTemplateName("form-app"), "form-app");
  assert.equal(normalizeTemplateName("form app"), "form-app");
  assert.equal(normalizeTemplateName("file-browser"), "file-browser");
  assert.equal(normalizeTemplateName("filebrowser"), "file-browser");
  assert.equal(normalizeTemplateName("streaming"), "streaming-viewer");
  assert.equal(normalizeTemplateName("streamingviewer"), "streaming-viewer");
});

test("template keys match template directories and include highlights", async () => {
  const expectedKeys = ["dashboard", "form-app", "file-browser", "streaming-viewer"];
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
    assert.ok(main.includes(displayName));
    assert.ok(!main.includes("__APP_NAME__"));

    const readme = await readFile(join(targetDir, "README.md"), "utf8");
    assert.ok(readme.includes(template.label));
    assert.ok(!readme.includes("__TEMPLATE_LABEL__"));
  }
});

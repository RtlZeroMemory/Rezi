import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_SELF_EDIT_BANNER,
  applySelfEditBanner,
  rewriteWidgetViewBanner,
  sanitizeSelfEditBanner,
} from "../hsr/widget-view-self-edit.mjs";

describe("widget-view self-edit helper", () => {
  test("default self-edit banner is showcase-friendly placeholder", () => {
    assert.equal(DEFAULT_SELF_EDIT_BANNER, "placeholder");
  });

  test("sanitizeSelfEditBanner normalizes whitespace and enforces fallback", () => {
    assert.equal(sanitizeSelfEditBanner("  REZO   demo\tbanner  "), "REZO demo banner");
    assert.equal(sanitizeSelfEditBanner("REZO\u0013demo"), "REZO demo");
    assert.equal(sanitizeSelfEditBanner(""), DEFAULT_SELF_EDIT_BANNER);
    assert.equal(sanitizeSelfEditBanner("     "), DEFAULT_SELF_EDIT_BANNER);
  });

  test("sanitizeSelfEditBanner clamps size and strips multiline/control chars", () => {
    const raw = `line 1\nline 2\t${"x".repeat(90)}\u0000`;
    const out = sanitizeSelfEditBanner(raw);
    assert.equal(out.includes("\n"), false);
    assert.equal(out.includes("\t"), false);
    assert.equal(out.includes("\u0000"), false);
    assert.equal(out.length <= 60, true);
  });

  test("applySelfEditBanner rewrites the SELF_EDIT_BANNER declaration", () => {
    const source = [
      'import { ui } from "@rezi-ui/core";',
      'export const SELF_EDIT_BANNER = "old";',
      "export function renderWidgetScreen() { return ui.text('x'); }",
      "",
    ].join("\n");

    const result = applySelfEditBanner(source, "new banner");
    assert.equal(result.changed, true);
    assert.equal(result.banner, "new banner");
    assert.equal(result.nextSource.includes('export const SELF_EDIT_BANNER = "new banner";'), true);
  });

  test("applySelfEditBanner returns changed=false when banner already matches", () => {
    const source = [
      'import { ui } from "@rezi-ui/core";',
      'export const SELF_EDIT_BANNER = "same";',
      "export function renderWidgetScreen() { return ui.text('x'); }",
      "",
    ].join("\n");

    const result = applySelfEditBanner(source, "same");
    assert.equal(result.changed, false);
  });

  test("applySelfEditBanner throws when declaration is missing", () => {
    assert.throws(
      () => applySelfEditBanner("export const somethingElse = 1;", "x"),
      /SELF_EDIT_BANNER declaration not found/,
    );
  });

  test("rewriteWidgetViewBanner persists changes to disk deterministically", () => {
    const dir = mkdtempSync(join(tmpdir(), "rezi-hsr-self-edit-"));
    try {
      const viewFile = join(dir, "widget-view.mjs");
      writeFileSync(
        viewFile,
        [
          'export const SELF_EDIT_BANNER = "old";',
          "export function renderWidgetScreen() {}",
          "",
        ].join("\n"),
        "utf8",
      );

      const first = rewriteWidgetViewBanner(viewFile, "disk banner");
      assert.equal(first.changed, true);
      assert.equal(first.banner, "disk banner");
      assert.equal(
        readFileSync(viewFile, "utf8").includes('export const SELF_EDIT_BANNER = "disk banner";'),
        true,
      );

      const second = rewriteWidgetViewBanner(viewFile, "disk banner");
      assert.equal(second.changed, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rewriteWidgetViewBanner supports file URLs and quote-safe banner values", () => {
    const dir = mkdtempSync(join(tmpdir(), "rezi-hsr-self-edit-url-"));
    try {
      const viewFile = join(dir, "widget-view.mjs");
      writeFileSync(
        viewFile,
        [
          'export const SELF_EDIT_BANNER = "old";',
          "export function renderWidgetScreen() {}",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = rewriteWidgetViewBanner(pathToFileURL(viewFile), `say "REZO" now`);
      assert.equal(result.changed, true);
      assert.equal(result.banner, 'say "REZO" now');
      const source = readFileSync(viewFile, "utf8");
      assert.equal(source.includes('export const SELF_EDIT_BANNER = "say \\"REZO\\" now";'), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

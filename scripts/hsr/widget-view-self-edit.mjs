import { readFileSync, writeFileSync } from "node:fs";

export const DEFAULT_SELF_EDIT_BANNER = "placeholder";

const SELF_EDIT_BANNER_DECLARATION = /^export const SELF_EDIT_BANNER = .*;$/m;

export function sanitizeSelfEditBanner(value) {
  const text = typeof value === "string" ? value : "";
  let withoutControl = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isControl = code < 32 || code === 127;
    withoutControl += isControl ? " " : text[i];
  }
  const normalized = withoutControl.replace(/\s+/g, " ").trim();
  const bounded = normalized.slice(0, 60);
  return bounded.length > 0 ? bounded : DEFAULT_SELF_EDIT_BANNER;
}

export function applySelfEditBanner(source, nextBanner) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("widget-view source must be a non-empty string");
  }

  if (!SELF_EDIT_BANNER_DECLARATION.test(source)) {
    throw new Error("SELF_EDIT_BANNER declaration not found in widget-view.mjs");
  }

  const banner = sanitizeSelfEditBanner(nextBanner);
  const nextLine = `export const SELF_EDIT_BANNER = ${JSON.stringify(banner)};`;
  const nextSource = source.replace(SELF_EDIT_BANNER_DECLARATION, nextLine);
  return Object.freeze({
    banner,
    nextSource,
    changed: nextSource !== source,
  });
}

export function rewriteWidgetViewBanner(filePath, nextBanner) {
  const source = readFileSync(filePath, "utf8");
  const result = applySelfEditBanner(source, nextBanner);
  if (result.changed) {
    writeFileSync(filePath, result.nextSource, "utf8");
  }
  return result;
}

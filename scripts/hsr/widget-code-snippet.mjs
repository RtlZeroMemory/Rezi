import { DEFAULT_SELF_EDIT_BANNER, sanitizeSelfEditBanner } from "./widget-view-self-edit.mjs";

const FALLBACK_BANNER = DEFAULT_SELF_EDIT_BANNER;

function unescapeSimple(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\`/g, "`")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function extractLiteralValue(literal) {
  if (typeof literal !== "string" || literal.length < 2) return null;
  const quote = literal[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  if (literal[literal.length - 1] !== quote) return null;
  return unescapeSimple(literal.slice(1, -1));
}

export function buildWidgetSnippet(banner) {
  const safeBanner = sanitizeSelfEditBanner(typeof banner === "string" ? banner : FALLBACK_BANNER);
  return [
    'import { ui } from "@rezi-ui/core";',
    "",
    "// This export is read by scripts/hsr/widget-view.mjs during live HSR swaps.",
    `export const SELF_EDIT_BANNER = ${JSON.stringify(safeBanner)};`,
    "",
    "export function renderHeroTitle() {",
    "  return ui.richText([",
    '    { text: SELF_EDIT_BANNER, style: { fg: "amber", bold: true } },',
    '    { text: " Hot State-Preserving Reload Widget Lab", style: { bold: true } },',
    "  ]);",
    "}",
    "",
    "// Save from the demo with F6/Ctrl+O/Ctrl+S or Save button + Enter.",
  ].join("\n");
}

export function extractBannerFromSnippet(snippet, fallback = FALLBACK_BANNER) {
  const source = typeof snippet === "string" ? snippet : "";
  const declarationMatch = source.match(
    /SELF_EDIT_BANNER\s*=\s*("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)/,
  );

  if (!declarationMatch || typeof declarationMatch[1] !== "string") {
    return sanitizeSelfEditBanner(fallback);
  }

  const parsed = extractLiteralValue(declarationMatch[1]);
  if (parsed === null) return sanitizeSelfEditBanner(fallback);
  return sanitizeSelfEditBanner(parsed);
}

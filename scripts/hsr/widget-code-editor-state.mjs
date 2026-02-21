function toSafeString(value) {
  return typeof value === "string" ? value : "";
}

export function splitCodeDraft(draft) {
  const normalized = toSafeString(draft).replace(/\r\n?/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [""];
  return Object.freeze(lines.map((line) => toSafeString(line)));
}

export function joinCodeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const safeLines = lines.map((line) => toSafeString(line).replace(/\r/g, ""));
  return safeLines.join("\n");
}

export function clampCodeCursor(lines, cursor) {
  const safeLines = splitCodeDraft(joinCodeLines(lines));
  const lineCount = safeLines.length;
  const rawLine =
    typeof cursor?.line === "number" && Number.isFinite(cursor.line) ? Math.floor(cursor.line) : 0;
  const line = Math.max(0, Math.min(rawLine, lineCount - 1));
  const lineText = safeLines[line] ?? "";
  const rawColumn =
    typeof cursor?.column === "number" && Number.isFinite(cursor.column)
      ? Math.floor(cursor.column)
      : lineText.length;
  const column = Math.max(0, Math.min(rawColumn, lineText.length));
  return Object.freeze({ line, column });
}

export function findBannerCursor(lines) {
  const safeLines = splitCodeDraft(joinCodeLines(lines));
  for (let index = 0; index < safeLines.length; index++) {
    const line = safeLines[index] ?? "";
    const marker = "SELF_EDIT_BANNER";
    const markerIndex = line.indexOf(marker);
    if (markerIndex === -1) continue;
    const equalsIndex = line.indexOf("=", markerIndex + marker.length);
    if (equalsIndex === -1) continue;

    for (const quote of ['"', "'", "`"]) {
      const openQuote = line.indexOf(quote, equalsIndex + 1);
      if (openQuote === -1) continue;
      const closeQuote = line.indexOf(quote, openQuote + 1);
      const column = closeQuote === -1 ? openQuote + 1 : closeQuote;
      return Object.freeze({ line: index, column });
    }
  }

  const fallbackLine = Math.max(0, safeLines.length - 1);
  return Object.freeze({
    line: fallbackLine,
    column: (safeLines[fallbackLine] ?? "").length,
  });
}

export function createCodeEditorState(draft, options = {}) {
  const lines = splitCodeDraft(draft);
  const scrollTop =
    typeof options.scrollTop === "number" && Number.isFinite(options.scrollTop)
      ? Math.max(0, Math.floor(options.scrollTop))
      : 0;
  const scrollLeft =
    typeof options.scrollLeft === "number" && Number.isFinite(options.scrollLeft)
      ? Math.max(0, Math.floor(options.scrollLeft))
      : 0;

  const preferredCursor = options.cursor ? clampCodeCursor(lines, options.cursor) : null;
  const cursor = preferredCursor ?? findBannerCursor(lines);

  return Object.freeze({
    lines,
    cursor,
    selection: null,
    scrollTop,
    scrollLeft,
  });
}

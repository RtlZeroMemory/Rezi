import type { DrawlistBuilderV1 } from "../../../index.js";
import { measureTextCells } from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { Theme } from "../../../theme/theme.js";
import { tokenizeCodeEditorLineWithCustom } from "../../../widgets/codeEditorSyntax.js";
import {
  formatCost,
  formatDuration,
  formatTimestamp,
  formatTokenCount,
} from "../../../widgets/logsConsole.js";
import type {
  CodeEditorLineTokenizer,
  CodeEditorProps,
  CodeEditorSyntaxTokenKind,
  DiffViewerProps,
  LogsConsoleProps,
} from "../../../widgets/types.js";
import { asTextStyle } from "../../styles.js";
import { renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { clampNonNegative } from "../spacing.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle } from "../textStyle.js";
import type { CodeEditorRenderCache, DiffRenderCache, LogsConsoleRenderCache } from "../types.js";
import type { CursorInfo } from "../types.js";
import {
  focusIndicatorEnabled,
  readFocusConfig,
  resolveFocusIndicatorStyle,
  resolveFocusedContentStyle,
} from "./focusConfig.js";

type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

function logLevelToThemeColor(theme: Theme, level: LogsConsoleProps["entries"][number]["level"]) {
  switch (level) {
    case "warn":
      return theme.colors.warning;
    case "error":
      return theme.colors.danger;
    case "info":
      return theme.colors.fg;
    default:
      return theme.colors.muted;
  }
}

type CodeEditorSyntaxStyleMap = Readonly<Record<CodeEditorSyntaxTokenKind, ResolvedTextStyle>>;

function resolveSyntaxThemeColor(
  theme: Theme,
  key: string,
  fallback: Readonly<{ r: number; g: number; b: number }>,
) {
  return theme.colors[key] ?? fallback;
}

function createCodeEditorSyntaxStyleMap(
  parentStyle: ResolvedTextStyle,
  theme: Theme,
): CodeEditorSyntaxStyleMap {
  return Object.freeze({
    plain: parentStyle,
    keyword: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.keyword", theme.colors.info),
      bold: true,
    }),
    type: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.type", theme.colors.warning),
      bold: true,
    }),
    string: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.string", theme.colors.success),
    }),
    number: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.number", theme.colors.warning),
    }),
    comment: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.comment", theme.colors.muted),
      italic: true,
    }),
    operator: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.operator", theme.colors.primary),
    }),
    punctuation: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.punctuation", theme.colors.fg),
    }),
    function: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.function", theme.colors.primary),
      bold: true,
    }),
    variable: mergeTextStyle(parentStyle, {
      fg: resolveSyntaxThemeColor(theme, "syntax.variable", theme.colors.secondary),
      bold: true,
    }),
  });
}

function drawCodeEditorSyntaxLine(
  builder: DrawlistBuilderV1,
  x: number,
  y: number,
  width: number,
  scrollLeft: number,
  line: string,
  styles: CodeEditorSyntaxStyleMap,
  language: NonNullable<CodeEditorProps["syntaxLanguage"]>,
  lineNumber: number,
  customTokenizer: CodeEditorLineTokenizer | null,
): void {
  if (width <= 0) return;
  const viewStart = Math.max(0, scrollLeft);
  const viewEnd = viewStart + width;
  const tokens = tokenizeCodeEditorLineWithCustom(
    line,
    Object.freeze({ language, lineNumber }),
    customTokenizer,
  );
  let sourceOffset = 0;
  let drawX = x;

  for (const token of tokens) {
    const tokenStart = sourceOffset;
    const tokenText = token.text;
    const tokenEnd = tokenStart + tokenText.length;
    sourceOffset = tokenEnd;

    if (tokenEnd <= viewStart || tokenStart >= viewEnd) continue;

    const sliceStart = Math.max(0, viewStart - tokenStart);
    const sliceEnd = Math.min(tokenText.length, viewEnd - tokenStart);
    if (sliceEnd <= sliceStart) continue;

    const fragment = tokenText.slice(sliceStart, sliceEnd);
    if (fragment.length === 0) continue;

    builder.drawText(drawX, y, fragment, styles[token.kind] ?? styles.plain);
    drawX += measureTextCells(fragment);
    if (drawX >= x + width) return;
  }
}

export function renderEditorWidget(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  rect: Rect,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  cursorInfo: CursorInfo | undefined,
  diffViewerFocusedHunkById: ReadonlyMap<string, number> | undefined,
  diffViewerExpandedHunksById: ReadonlyMap<string, ReadonlySet<number>> | undefined,
  logsConsoleRenderCacheById: ReadonlyMap<string, LogsConsoleRenderCache> | undefined,
  diffRenderCacheById: ReadonlyMap<string, DiffRenderCache> | undefined,
  codeEditorRenderCacheById: ReadonlyMap<string, CodeEditorRenderCache> | undefined,
): ResolvedCursor | null {
  const vnode = node.vnode;
  let resolvedCursor: ResolvedCursor | null = null;

  switch (vnode.kind) {
    case "codeEditor": {
      if (!isVisibleRect(rect)) break;

      const props = vnode.props as CodeEditorProps;
      const focusConfig = readFocusConfig(props.focusConfig);
      const showFocusIndicator = focusIndicatorEnabled(focusConfig);
      const { lines, scrollTop, scrollLeft, cursor } = props;
      const lineNumbers = props.lineNumbers !== false;
      const editorCache = codeEditorRenderCacheById?.get(props.id);
      const lineNumWidth =
        editorCache?.lineNumWidth ?? (lineNumbers ? String(lines.length).length + 1 : 0);
      const lineNums = editorCache?.lineNums;
      const textX = rect.x + lineNumWidth;
      const textW = clampNonNegative(rect.w - lineNumWidth);
      const syntaxLanguage = props.syntaxLanguage ?? "plain";
      const syntaxStyles = createCodeEditorSyntaxStyleMap(parentStyle, theme);
      const customTokenizer = typeof props.tokenizeLine === "function" ? props.tokenizeLine : null;

      const selection = props.selection;
      const selectionBg = theme.colors.secondary;
      const lineNumberStyle = mergeTextStyle(parentStyle, { fg: theme.colors.muted });
      const diagnostics = Array.isArray(
        (props as CodeEditorProps & Readonly<{ diagnostics?: unknown }>).diagnostics,
      )
        ? ((props as CodeEditorProps & Readonly<{ diagnostics?: unknown }>)
            .diagnostics as readonly {
            line?: unknown;
            startColumn?: unknown;
            endColumn?: unknown;
            severity?: unknown;
          }[])
        : [];

      const normalizedSelection = (() => {
        if (!selection) return null;
        const a = selection.anchor;
        const b = selection.active;
        if (a.line < b.line || (a.line === b.line && a.column <= b.column))
          return { start: a, end: b };
        return { start: b, end: a };
      })();

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);

      // Render visible lines
      const visibleLines = rect.h;
      const startLine = scrollTop;
      const endLine = Math.min(startLine + visibleLines, lines.length);

      for (let i = startLine; i < endLine; i++) {
        const y = rect.y + (i - startLine);
        const line = lines[i] ?? "";

        // Line number
        if (lineNumbers) {
          const lineNum =
            lineNums && lineNums[i] !== undefined
              ? (lineNums[i] ?? "")
              : String(i + 1).padStart(Math.max(0, lineNumWidth - 1), " ");
          builder.drawText(rect.x, y, lineNum, lineNumberStyle);
        }

        // Selection background (best-effort, character-based)
        if (normalizedSelection && textW > 0) {
          const { start, end } = normalizedSelection;
          if (i >= start.line && i <= end.line) {
            const startCol = i === start.line ? start.column : 0;
            const endCol = i === end.line ? end.column : line.length;
            const visStart = Math.max(0, Math.min(textW, startCol - scrollLeft));
            const visEnd = Math.max(0, Math.min(textW, endCol - scrollLeft));
            const w = visEnd - visStart;
            if (w > 0) builder.fillRect(textX + visStart, y, w, 1, { bg: selectionBg });
          }
        }

        // Line content (syntax-highlighted).
        drawCodeEditorSyntaxLine(
          builder,
          textX,
          y,
          textW,
          scrollLeft,
          line,
          syntaxStyles,
          syntaxLanguage,
          i,
          customTokenizer,
        );

        // Diagnostics underlines (curly + semantic color)
        if (diagnostics.length > 0 && textW > 0) {
          for (const diagnostic of diagnostics) {
            const lineIndex =
              typeof diagnostic.line === "number" && Number.isFinite(diagnostic.line)
                ? Math.trunc(diagnostic.line)
                : -1;
            if (lineIndex !== i) continue;
            const startRaw =
              typeof diagnostic.startColumn === "number" && Number.isFinite(diagnostic.startColumn)
                ? Math.trunc(diagnostic.startColumn)
                : 0;
            const endRaw =
              typeof diagnostic.endColumn === "number" && Number.isFinite(diagnostic.endColumn)
                ? Math.trunc(diagnostic.endColumn)
                : startRaw + 1;
            const startCol = Math.max(0, Math.min(line.length, startRaw));
            const endCol = Math.max(startCol + 1, Math.min(line.length, endRaw));
            const visStart = Math.max(0, startCol - scrollLeft);
            const visEnd = Math.max(visStart, Math.min(textW, endCol - scrollLeft));
            if (visEnd <= visStart) continue;
            const segment = line.slice(scrollLeft + visStart, scrollLeft + visEnd);
            if (segment.length === 0) continue;
            const severity = diagnostic.severity;
            const underlineColor =
              severity === "warning"
                ? (theme.colors["diagnostic.warning"] ?? theme.colors.warning)
                : severity === "info"
                  ? (theme.colors["diagnostic.info"] ?? theme.colors.info)
                  : severity === "hint"
                    ? (theme.colors["diagnostic.hint"] ?? theme.colors.success)
                    : (theme.colors["diagnostic.error"] ?? theme.colors.danger);
            builder.drawText(textX + visStart, y, segment, {
              underline: true,
              underlineStyle: "curly",
              underlineColor,
            });
          }
        }
      }

      builder.popClip();

      // v2 cursor: resolve cursor position for focused code editor
      const focused = focusState.focusedId === props.id;
      if (focused && cursorInfo) {
        const cy = cursor.line - scrollTop;
        if (cy >= 0 && cy < rect.h) {
          const cx = cursor.column - scrollLeft;
          const x = rect.x + lineNumWidth + cx;
          if (x >= rect.x + lineNumWidth && x < rect.x + rect.w) {
            resolvedCursor = {
              x,
              y: rect.y + cy,
              shape: cursorInfo.shape,
              blink: cursorInfo.blink,
            };
          }
        }
      }

      if (focused && showFocusIndicator && props.highlightActiveCursorCell !== false && textW > 0) {
        const localY = cursor.line - scrollTop;
        const localX = cursor.column - scrollLeft;
        if (localY >= 0 && localY < rect.h && localX >= 0 && localX < textW) {
          const cursorLine = lines[cursor.line] ?? "";
          const cursorGlyph = cursorLine.slice(cursor.column, cursor.column + 1) || " ";
          const cursorCellStyle = resolveFocusedContentStyle(
            resolveFocusIndicatorStyle(
              parentStyle,
              theme,
              focusConfig,
              mergeTextStyle(parentStyle, {
                fg: resolveSyntaxThemeColor(theme, "syntax.cursor.fg", theme.colors.bg),
                bg: resolveSyntaxThemeColor(theme, "syntax.cursor.bg", theme.colors.primary),
                bold: true,
              }),
            ),
            theme,
            focusConfig,
          );
          builder.pushClip(textX, rect.y, textW, rect.h);
          builder.drawText(textX + localX, rect.y + localY, cursorGlyph, cursorCellStyle);
          builder.popClip();
        }
      }
      break;
    }
    case "diffViewer": {
      if (!isVisibleRect(rect)) break;

      const props = vnode.props as DiffViewerProps;
      const focusConfig = readFocusConfig(props.focusConfig);
      const showFocusIndicator = focusIndicatorEnabled(focusConfig);
      const focusedHunkStyle = asTextStyle(props.focusedHunkStyle, theme);
      const { diff } = props;
      const diffCache = diffRenderCacheById?.get(props.id);
      const addBg = theme.colors.success;
      const deleteBg = theme.colors.danger;
      const addFg = theme.colors.bg;
      const deleteFg = theme.colors.bg;
      const hunkHeaderFg = theme.colors.info;
      const lineNumberFg = theme.colors.muted;
      const borderFg = theme.colors.border;
      const collapsedStyle = mergeTextStyle(parentStyle, { fg: theme.colors.muted });

      if (diff.isBinary === true) {
        builder.drawText(
          rect.x,
          rect.y,
          "Binary file differs",
          mergeTextStyle(parentStyle, { fg: hunkHeaderFg }),
        );
        break;
      }

      const mode = props.mode;
      const scrollTop = props.scrollTop;
      const showLineNumbers = props.lineNumbers !== false;

      const focusedHunk = diffViewerFocusedHunkById?.get(props.id) ?? props.focusedHunk ?? 0;
      const focusedHeaderBaseStyle = mergeTextStyle(parentStyle, { fg: hunkHeaderFg });
      const focusedHeaderStyle = (() => {
        let out = resolveFocusedContentStyle(
          resolveFocusIndicatorStyle(
            focusedHeaderBaseStyle,
            theme,
            focusConfig,
            mergeTextStyle(focusedHeaderBaseStyle, { inverse: true }),
          ),
          theme,
          focusConfig,
        );
        if (focusedHunkStyle) out = mergeTextStyle(out, focusedHunkStyle);
        return out;
      })();
      const internalExpanded = diffViewerExpandedHunksById?.get(props.id);
      const expandedSet =
        !internalExpanded && props.expandedHunks ? new Set(props.expandedHunks) : null;

      const isExpandedHunk = (hunkIndex: number): boolean => {
        if (internalExpanded) return internalExpanded.has(hunkIndex);
        if (expandedSet) return expandedSet.has(hunkIndex);
        return true;
      };

      let maxOld = 0;
      let maxNew = 0;
      if (!diffCache) {
        for (const hunk of diff.hunks) {
          if (!hunk) continue;
          const oldLast = hunk.oldStart + Math.max(0, hunk.oldCount - 1);
          const newLast = hunk.newStart + Math.max(0, hunk.newCount - 1);
          if (oldLast > maxOld) maxOld = oldLast;
          if (newLast > maxNew) maxNew = newLast;
        }
      }
      const numWidth = diffCache?.numWidth ?? Math.max(1, String(Math.max(maxOld, maxNew)).length);
      const blankNum = diffCache?.blankNum ?? " ".repeat(numWidth);
      const fmtNum = (n: number | null): string => {
        if (n === null) return blankNum;
        const cached = diffCache?.formattedNums.get(n);
        if (cached) return cached;
        const formatted = String(n).padStart(numWidth, " ");
        if (diffCache) diffCache.formattedNums.set(n, formatted);
        return formatted;
      };

      const drawUnifiedLine = (
        y: number,
        oldNum: number | null,
        newNum: number | null,
        type: "context" | "add" | "delete",
        content: string,
        highlights: readonly (readonly [number, number])[] | undefined,
      ): void => {
        const nums = showLineNumbers ? `${fmtNum(oldNum)} ${fmtNum(newNum)} ` : "";
        const x0 = rect.x;
        const numsW = showLineNumbers ? measureTextCells(nums) : 0;
        const textX = x0 + numsW;
        const remaining = rect.w - numsW;
        if (remaining <= 0) return;

        if (type === "add") builder.fillRect(x0, y, rect.w, 1, { bg: addBg });
        if (type === "delete") builder.fillRect(x0, y, rect.w, 1, { bg: deleteBg });

        if (showLineNumbers) {
          builder.drawText(x0, y, nums, mergeTextStyle(parentStyle, { fg: lineNumberFg }));
        }

        const prefix = type === "add" ? "+" : type === "delete" ? "-" : " ";
        const fg = type === "add" ? addFg : type === "delete" ? deleteFg : undefined;
        builder.drawText(
          textX,
          y,
          `${prefix}${content}`.slice(0, remaining),
          fg ? { fg } : undefined,
        );

        if (highlights && highlights.length > 0 && rect.w > 0) {
          const highlightBg =
            type === "add"
              ? theme.colors.secondary
              : type === "delete"
                ? theme.colors.warning
                : null;
          if (highlightBg) {
            for (const h of highlights) {
              const start = Math.max(0, h[0]);
              const end = Math.max(start, h[1]);
              const slice = content.slice(start, end);
              if (slice.length === 0) continue;
              const hx = textX + 1 + start; // +1 for prefix
              if (hx >= rect.x + rect.w) continue;
              const style = fg ? { fg, bg: highlightBg } : { bg: highlightBg };
              builder.drawText(hx, y, slice.slice(0, Math.max(0, rect.x + rect.w - hx)), style);
            }
          }
        }
      };

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      nodeStack.push(null);

      if (mode === "sideBySide" && rect.w >= 4) {
        const dividerX = rect.x + Math.floor(rect.w / 2);
        const leftW = clampNonNegative(dividerX - rect.x);
        const rightX = dividerX + 1;
        const rightW = clampNonNegative(rect.x + rect.w - rightX);

        const drawSide = (
          x: number,
          w: number,
          y: number,
          num: number | null,
          type: "context" | "add" | "delete" | "blank",
          content: string,
          highlights: readonly (readonly [number, number])[] | undefined,
        ): void => {
          if (w <= 0) return;

          if (type === "add") builder.fillRect(x, y, w, 1, { bg: addBg });
          if (type === "delete") builder.fillRect(x, y, w, 1, { bg: deleteBg });

          const nums = showLineNumbers ? `${fmtNum(num)} ` : "";
          const numsW = showLineNumbers ? measureTextCells(nums) : 0;
          const textX = x + numsW;
          const remaining = w - numsW;
          if (showLineNumbers) {
            builder.drawText(x, y, nums, mergeTextStyle(parentStyle, { fg: lineNumberFg }));
          }

          if (remaining <= 0) return;

          const prefix =
            type === "add" ? "+" : type === "delete" ? "-" : type === "blank" ? " " : " ";
          const fg = type === "add" ? addFg : type === "delete" ? deleteFg : undefined;
          const text = type === "blank" ? "" : `${prefix}${content}`;
          builder.drawText(
            textX,
            y,
            text.slice(0, Math.max(0, remaining)),
            fg ? { fg } : undefined,
          );

          if (type !== "blank" && highlights && highlights.length > 0) {
            const highlightBg =
              type === "add"
                ? theme.colors.secondary
                : type === "delete"
                  ? theme.colors.warning
                  : null;
            if (highlightBg) {
              for (const h of highlights) {
                const start = Math.max(0, h[0]);
                const end = Math.max(start, h[1]);
                const slice = content.slice(start, end);
                if (slice.length === 0) continue;
                const hx = textX + 1 + start;
                if (hx >= x + w) continue;
                const style = fg ? { fg, bg: highlightBg } : { bg: highlightBg };
                builder.drawText(hx, y, slice.slice(0, Math.max(0, x + w - hx)), style);
              }
            }
          }
        };

        let lineIndex = 0;
        for (let hunkIndex = 0; hunkIndex < diff.hunks.length; hunkIndex++) {
          const hunk = diff.hunks[hunkIndex];
          if (!hunk) continue;

          if (lineIndex >= scrollTop && lineIndex < scrollTop + rect.h) {
            const y = rect.y + (lineIndex - scrollTop);
            const header =
              diffCache?.headerByHunk[hunkIndex] ??
              `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${
                hunk.header ? ` ${hunk.header}` : ""
              }`;
            const focused = showFocusIndicator && hunkIndex === focusedHunk;
            builder.drawText(
              rect.x,
              y,
              header.slice(0, rect.w),
              focused ? focusedHeaderStyle : focusedHeaderBaseStyle,
            );
            if (dividerX >= rect.x && dividerX < rect.x + rect.w) {
              builder.drawText(dividerX, y, "│", mergeTextStyle(parentStyle, { fg: borderFg }));
            }
          }
          lineIndex++;

          if (!isExpandedHunk(hunkIndex)) {
            if (lineIndex >= scrollTop && lineIndex < scrollTop + rect.h) {
              const y = rect.y + (lineIndex - scrollTop);
              const msg =
                diffCache?.collapsedByHunk[hunkIndex] ?? `… ${String(hunk.lines.length)} lines …`;
              builder.drawText(rect.x, y, msg.slice(0, rect.w), collapsedStyle);
              if (dividerX >= rect.x && dividerX < rect.x + rect.w) {
                builder.drawText(dividerX, y, "│", mergeTextStyle(parentStyle, { fg: borderFg }));
              }
            }
            lineIndex++;
            continue;
          }

          let oldLine = hunk.oldStart;
          let newLine = hunk.newStart;

          for (let i = 0; i < hunk.lines.length; i++) {
            const line = hunk.lines[i];
            if (!line) continue;

            let leftType: "context" | "delete" | "blank" = "blank";
            let rightType: "context" | "add" | "blank" = "blank";
            let leftContent = "";
            let rightContent = "";
            let leftNum: number | null = null;
            let rightNum: number | null = null;
            let leftHighlights: readonly (readonly [number, number])[] | undefined;
            let rightHighlights: readonly (readonly [number, number])[] | undefined;

            if (line.type === "context") {
              leftType = "context";
              rightType = "context";
              leftContent = line.content;
              rightContent = line.content;
              leftNum = oldLine++;
              rightNum = newLine++;
            } else if (line.type === "delete") {
              const next = hunk.lines[i + 1];
              if (next && next.type === "add") {
                leftType = "delete";
                rightType = "add";
                leftContent = line.content;
                rightContent = next.content;
                leftHighlights = line.highlights;
                rightHighlights = next.highlights;
                leftNum = oldLine++;
                rightNum = newLine++;
                i++; // consume paired add
              } else {
                leftType = "delete";
                leftContent = line.content;
                leftHighlights = line.highlights;
                leftNum = oldLine++;
              }
            } else if (line.type === "add") {
              rightType = "add";
              rightContent = line.content;
              rightHighlights = line.highlights;
              rightNum = newLine++;
            }

            if (lineIndex >= scrollTop && lineIndex < scrollTop + rect.h) {
              const y = rect.y + (lineIndex - scrollTop);
              drawSide(rect.x, leftW, y, leftNum, leftType, leftContent, leftHighlights);
              if (dividerX >= rect.x && dividerX < rect.x + rect.w) {
                builder.drawText(dividerX, y, "│", mergeTextStyle(parentStyle, { fg: borderFg }));
              }
              drawSide(rightX, rightW, y, rightNum, rightType, rightContent, rightHighlights);
            }
            lineIndex++;
          }
        }
        break;
      }

      // Unified mode (or fallback if too narrow)
      let lineIndex = 0;
      for (let hunkIndex = 0; hunkIndex < diff.hunks.length; hunkIndex++) {
        const hunk = diff.hunks[hunkIndex];
        if (!hunk) continue;

        if (lineIndex >= scrollTop && lineIndex < scrollTop + rect.h) {
          const y = rect.y + (lineIndex - scrollTop);
          const header =
            diffCache?.headerByHunk[hunkIndex] ??
            `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${
              hunk.header ? ` ${hunk.header}` : ""
            }`;
          const focused = showFocusIndicator && hunkIndex === focusedHunk;
          builder.drawText(
            rect.x,
            y,
            header.slice(0, rect.w),
            focused ? focusedHeaderStyle : focusedHeaderBaseStyle,
          );
        }
        lineIndex++;

        if (!isExpandedHunk(hunkIndex)) {
          if (lineIndex >= scrollTop && lineIndex < scrollTop + rect.h) {
            const y = rect.y + (lineIndex - scrollTop);
            const msg =
              diffCache?.collapsedByHunk[hunkIndex] ?? `… ${String(hunk.lines.length)} lines …`;
            builder.drawText(rect.x, y, msg.slice(0, rect.w), collapsedStyle);
          }
          lineIndex++;
          continue;
        }

        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        for (const line of hunk.lines) {
          if (!line) continue;
          if (lineIndex >= scrollTop && lineIndex < scrollTop + rect.h) {
            const y = rect.y + (lineIndex - scrollTop);
            if (line.type === "context") {
              drawUnifiedLine(y, oldLine, newLine, "context", line.content, line.highlights);
            } else if (line.type === "delete") {
              drawUnifiedLine(y, oldLine, null, "delete", line.content, line.highlights);
            } else {
              drawUnifiedLine(y, null, newLine, "add", line.content, line.highlights);
            }
          }

          if (line.type === "context") {
            oldLine++;
            newLine++;
          } else if (line.type === "delete") {
            oldLine++;
          } else {
            newLine++;
          }
          lineIndex++;
        }
      }
      break;
    }
    case "logsConsole": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as LogsConsoleProps;
      const focusConfig = readFocusConfig(props.focusConfig);
      const focusedStyleOverride = asTextStyle(props.focusedStyle, theme);
      const widgetFocused = focusState.focusedId === props.id;
      const showFocusRing = widgetFocused && focusIndicatorEnabled(focusConfig);
      const contentRect = showFocusRing
        ? {
            x: rect.x + 1,
            y: rect.y + 1,
            w: clampNonNegative(rect.w - 2),
            h: clampNonNegative(rect.h - 2),
          }
        : rect;

      if (showFocusRing) {
        let ringStyle = resolveFocusIndicatorStyle(
          parentStyle,
          theme,
          focusConfig,
          mergeTextStyle(parentStyle, { fg: theme.colors.info }),
        );
        if (focusedStyleOverride) {
          ringStyle = mergeTextStyle(ringStyle, focusedStyleOverride);
        }
        renderBoxBorder(builder, rect, "single", undefined, "left", ringStyle);
      }

      const contentStyle = showFocusRing
        ? resolveFocusedContentStyle(parentStyle, theme, focusConfig)
        : parentStyle;
      const timestampStyle = mergeTextStyle(contentStyle, { fg: theme.colors.muted });
      const sourceStyle = mergeTextStyle(contentStyle, { fg: theme.colors.info });

      const showTimestamps = props.showTimestamps !== false;
      const showSource = props.showSource !== false;
      const expandedEntries = (props.expandedEntries ?? EMPTY_STRING_ARRAY) as readonly string[];
      const expandedSet = expandedEntries.length > 0 ? new Set(expandedEntries) : null;

      const cache = logsConsoleRenderCacheById?.get(props.id);
      let filtered = cache?.filtered;
      const entryMetaById = cache?.entryMetaById;

      if (!filtered) {
        const levelFilter = (props.levelFilter ?? EMPTY_STRING_ARRAY) as readonly string[];
        const sourceFilter = (props.sourceFilter ?? EMPTY_STRING_ARRAY) as readonly string[];
        const q = props.searchQuery ? props.searchQuery.toLowerCase() : null;
        const levelSet = levelFilter.length > 0 ? new Set(levelFilter) : null;
        const sourceSet = sourceFilter.length > 0 ? new Set(sourceFilter) : null;
        const tmp: LogsConsoleProps["entries"][number][] = [];
        for (const entry of props.entries) {
          if (!entry) continue;
          if (levelSet && !levelSet.has(entry.level)) continue;
          if (sourceSet && !sourceSet.has(entry.source)) continue;
          if (q) {
            const msg = entry.message.toLowerCase();
            if (msg.includes(q)) {
              tmp.push(entry);
              continue;
            }
            const src = entry.source.toLowerCase();
            if (src.includes(q)) {
              tmp.push(entry);
              continue;
            }
            if (entry.details?.toLowerCase().includes(q)) {
              tmp.push(entry);
              continue;
            }
            continue;
          }
          tmp.push(entry);
        }
        filtered = tmp;
      }

      builder.pushClip(contentRect.x, contentRect.y, contentRect.w, contentRect.h);

      const startIndex = Math.max(0, props.scrollTop);
      const endIndex = Math.min(filtered.length, startIndex + contentRect.h);

      let y = contentRect.y;
      for (let i = startIndex; i < endIndex; i++) {
        const entry = filtered[i];
        if (!entry) continue;

        const levelColor = logLevelToThemeColor(theme, entry.level);
        const isError = entry.level === "error";

        let x = contentRect.x;

        const meta = entryMetaById?.get(entry.id);
        const timestamp = meta?.timestamp ?? formatTimestamp(entry.timestamp);
        const levelLabel = meta?.levelLabel ?? `[${entry.level.toUpperCase().padEnd(5)}]`;
        const sourceLabel = meta?.sourceLabel ?? entry.source.slice(0, 6).padEnd(6);
        let metaSuffix = meta?.metaSuffix ?? "";
        if (metaSuffix.length === 0) {
          if (typeof entry.durationMs === "number")
            metaSuffix += ` | ${formatDuration(entry.durationMs)}`;
          if (entry.tokens) metaSuffix += ` | ${formatTokenCount(entry.tokens.total)} tokens`;
          if (typeof entry.costCents === "number")
            metaSuffix += ` | ${formatCost(entry.costCents)}`;
        }

        // Timestamp
        if (showTimestamps) {
          builder.drawText(x, y, timestamp, timestampStyle);
          x += 9; // "HH:MM:SS" + space
        }

        // Level
        builder.drawText(
          x,
          y,
          levelLabel,
          isError
            ? { fg: levelColor, bold: true }
            : mergeTextStyle(contentStyle, { fg: levelColor }),
        );
        x += 8;

        // Source
        if (showSource) {
          builder.drawText(x, y, sourceLabel, sourceStyle);
          x += 7;
        }

        const hasDetails = typeof entry.details === "string" && entry.details.length > 0;
        const expanded = hasDetails && (expandedSet ? expandedSet.has(entry.id) : false);
        const marker = hasDetails ? (expanded ? "▼ " : "▶ ") : "";

        const details = expanded && entry.details ? ` | ${entry.details}` : "";
        const msg = `${marker}${entry.message}${details}${metaSuffix}`;

        const remaining = contentRect.w - (x - contentRect.x);
        if (remaining > 0) {
          builder.drawText(
            x,
            y,
            msg.slice(0, remaining),
            isError
              ? { fg: levelColor, bold: true }
              : mergeTextStyle(contentStyle, { fg: levelColor }),
          );
        }

        y++;
      }

      builder.popClip();
      break;
    }
    default:
      break;
  }

  return resolvedCursor;
}

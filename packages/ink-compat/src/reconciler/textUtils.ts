import { type Rgb, type RichTextSpan, type TextStyle, type VNode, ui } from "@rezi-ui/core";
import { resolveInkColor } from "../color.js";
import { InkCompatError } from "../errors.js";
import { mapTextProps } from "../props.js";
import type { TextProps } from "../types.js";
import type { HostElement, HostNode } from "./types.js";

type MutableTextStyle = {
  fg?: Rgb;
  bg?: Rgb;
  bold?: true;
  dim?: true;
  italic?: true;
  underline?: true;
  inverse?: true;
};

function mergeStyle(a: TextStyle | undefined, b: TextStyle | undefined): TextStyle | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

function sameStyle(a: TextStyle | undefined, b: TextStyle | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    (a.fg?.r ?? null) === (b.fg?.r ?? null) &&
    (a.fg?.g ?? null) === (b.fg?.g ?? null) &&
    (a.fg?.b ?? null) === (b.fg?.b ?? null) &&
    (a.bg?.r ?? null) === (b.bg?.r ?? null) &&
    (a.bg?.g ?? null) === (b.bg?.g ?? null) &&
    (a.bg?.b ?? null) === (b.bg?.b ?? null)
  );
}

function pushSpan(out: RichTextSpan[], span: RichTextSpan): void {
  const prev = out[out.length - 1];
  if (prev && sameStyle(prev.style, span.style)) {
    out[out.length - 1] = {
      text: prev.text + span.text,
      ...(prev.style ? { style: prev.style } : {}),
    };
    return;
  }
  out.push(span);
}

type InternalTransform = (children: string, index: number) => string;

function getInternalTransform(props: Record<string, unknown>): InternalTransform | null {
  const t = (props as { internal_transform?: unknown }).internal_transform;
  return typeof t === "function" ? (t as InternalTransform) : null;
}

function applyTransformPerLine(text: string, transform: InternalTransform): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    lines[i] = transform(line ?? "", i);
  }
  return lines.join("\n");
}

function styleOrUndefined(style: MutableTextStyle): TextStyle | undefined {
  if (
    style.fg === undefined &&
    style.bg === undefined &&
    style.bold === undefined &&
    style.dim === undefined &&
    style.italic === undefined &&
    style.underline === undefined &&
    style.inverse === undefined
  ) {
    return undefined;
  }
  return style;
}

function ansiIndexToRgb(index: number): Rgb | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) return undefined;
  return resolveInkColor(`ansi256(${index})`);
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(n)));
}

function parseSgrParams(raw: string): number[] {
  if (raw.length === 0) return [0];
  return raw
    .split(";")
    .map((p) => {
      if (p.length === 0) return 0;
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .filter((n) => !Number.isNaN(n));
}

function applySgrCodes(style: MutableTextStyle, rawParams: string): MutableTextStyle {
  const params = parseSgrParams(rawParams);
  const next: MutableTextStyle = { ...style };
  let i = 0;

  while (i < params.length) {
    const code = params[i];
    if (code === undefined) break;

    // Extended colors: 38;5;n / 48;5;n and 38;2;r;g;b / 48;2;r;g;b
    if (code === 38 || code === 48) {
      const mode = params[i + 1];
      if (mode === 5) {
        const idx = params[i + 2];
        if (idx !== undefined) {
          const color = ansiIndexToRgb(idx);
          if (color !== undefined) {
            if (code === 38) next.fg = color;
            else next.bg = color;
          }
          i += 3;
          continue;
        }
      } else if (mode === 2) {
        const r = params[i + 2];
        const g = params[i + 3];
        const b = params[i + 4];
        if (r !== undefined && g !== undefined && b !== undefined) {
          const color = { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
          if (code === 38) next.fg = color;
          else next.bg = color;
          i += 5;
          continue;
        }
      }
    }

    switch (code) {
      case 0:
        delete next.fg;
        delete next.bg;
        delete next.bold;
        delete next.dim;
        delete next.italic;
        delete next.underline;
        delete next.inverse;
        break;
      case 1:
        next.bold = true;
        break;
      case 2:
        next.dim = true;
        break;
      case 3:
        next.italic = true;
        break;
      case 4:
        next.underline = true;
        break;
      case 7:
        next.inverse = true;
        break;
      case 22:
        delete next.bold;
        delete next.dim;
        break;
      case 23:
        delete next.italic;
        break;
      case 24:
        delete next.underline;
        break;
      case 27:
        delete next.inverse;
        break;
      case 39:
        delete next.fg;
        break;
      case 49:
        delete next.bg;
        break;
      default:
        if (code >= 30 && code <= 37) {
          const fg = ansiIndexToRgb(code - 30);
          if (fg !== undefined) next.fg = fg;
        } else if (code >= 90 && code <= 97) {
          const fg = ansiIndexToRgb(code - 90 + 8);
          if (fg !== undefined) next.fg = fg;
        } else if (code >= 40 && code <= 47) {
          const bg = ansiIndexToRgb(code - 40);
          if (bg !== undefined) next.bg = bg;
        } else if (code >= 100 && code <= 107) {
          const bg = ansiIndexToRgb(code - 100 + 8);
          if (bg !== undefined) next.bg = bg;
        }
        break;
    }

    i++;
  }

  return next;
}

type CsiSequence = Readonly<{
  final: string;
  params: string;
  end: number;
}>;

function parseCsi(text: string, start: number): CsiSequence | null {
  if (text[start] !== "\u001b" || text[start + 1] !== "[") return null;

  let i = start + 2;
  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined) break;
    const code = ch.charCodeAt(0);
    // CSI final bytes: 0x40..0x7e
    if (code >= 0x40 && code <= 0x7e) {
      return {
        final: ch,
        params: text.slice(start + 2, i),
        end: i + 1,
      };
    }
    i++;
  }

  return null;
}

export function sanitizeTextForTerminal(raw: string): string {
  // Normalize CRLF/CR into LF.
  const text = raw.replace(/\r\n?/g, "\n");

  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === undefined) continue;
    if (ch === "\n") {
      out += "\n";
      continue;
    }
    if (ch === "\t") {
      // Tabs are control chars; expand to spaces to avoid cursor movement.
      out += "  ";
      continue;
    }
    if (ch === "\u001b") {
      // Drop complete CSI sequences so we don't leak raw "[...m" fragments.
      const csi = parseCsi(text, i);
      if (csi) {
        i = csi.end - 1;
      }
      continue;
    }

    const code = ch.charCodeAt(0);
    // Drop other ASCII control chars.
    if (code < 0x20 || code === 0x7f) continue;

    out += ch;
  }

  return out;
}

function pushSanitizedStyledText(
  raw: string,
  inherited: TextStyle | undefined,
  out: RichTextSpan[],
): void {
  const text = raw.replace(/\r\n?/g, "\n");
  let buf = "";
  let ansiStyle: MutableTextStyle = {};

  const flush = (): void => {
    if (buf.length === 0) return;
    const merged = mergeStyle(inherited, styleOrUndefined(ansiStyle));
    pushSpan(out, { text: buf, ...(merged ? { style: merged } : {}) });
    buf = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === undefined) continue;

    if (ch === "\n") {
      buf += "\n";
      continue;
    }
    if (ch === "\t") {
      buf += "  ";
      continue;
    }
    if (ch === "\u001b") {
      const csi = parseCsi(text, i);
      if (csi) {
        if (csi.final === "m") {
          flush();
          ansiStyle = applySgrCodes(ansiStyle, csi.params);
        }
        i = csi.end - 1;
      }
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    buf += ch;
  }

  flush();
}

function collectTextSpans(
  nodes: readonly HostNode[],
  inherited: TextStyle | undefined,
  out: RichTextSpan[],
): void {
  for (const n of nodes) {
    if (n.kind === "text") {
      pushSanitizedStyledText(n.text, inherited, out);
      continue;
    }

    if (n.type === "ink-text" || n.type === "ink-virtual-text") {
      const { style } = mapTextProps(n.props as unknown as TextProps);
      const merged = mergeStyle(inherited, style);
      const transform = getInternalTransform(n.props);
      if (transform) {
        const inner: RichTextSpan[] = [];
        collectTextSpans(n.children, merged, inner);
        const text = inner.map((s) => s.text).join("");
        const transformed = applyTransformPerLine(text, transform);
        if (transformed.length === 0) continue;
        pushSpan(out, { text: transformed, ...(merged ? { style: merged } : {}) });
      } else {
        collectTextSpans(n.children, merged, out);
      }
      continue;
    }

    throw new InkCompatError(
      "INK_COMPAT_INVALID_PROPS",
      `<${String(n.type)}> cannot be nested inside <Text>`,
    );
  }
}

export function splitSpansByNewline(spans: readonly RichTextSpan[]): RichTextSpan[][] {
  const lines: RichTextSpan[][] = [[]];

  for (const s of spans) {
    const parts = s.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? "";
      if (part.length > 0) {
        const line = lines[lines.length - 1];
        if (!line) continue;
        pushSpan(line, { text: part, ...(s.style ? { style: s.style } : {}) });
      }
      // Every newline starts a new line (including trailing newline -> empty last line).
      if (i < parts.length - 1) lines.push([]);
    }
  }

  return lines;
}

export function convertText(node: HostElement): VNode | null {
  const mapped = mapTextProps(node.props as unknown as TextProps);
  const transform = getInternalTransform(node.props);
  let spans: RichTextSpan[] = [];

  if (transform) {
    const inner: RichTextSpan[] = [];
    collectTextSpans(node.children, mapped.style, inner);
    const text = inner.map((s) => s.text).join("");
    const transformed = applyTransformPerLine(text, transform);
    if (transformed.length > 0) {
      spans = [{ text: transformed, ...(mapped.style ? { style: mapped.style } : {}) }];
    }
  } else {
    spans = [];
    collectTextSpans(node.children, mapped.style, spans);
  }

  if (spans.length === 0) return null;

  const isMultiline = spans.some((s) => s.text.includes("\n"));
  if (isMultiline) {
    const lines = splitSpansByNewline(spans);
    const children: VNode[] = [];
    for (const line of lines) {
      if (line.length === 0) {
        children.push(ui.text(""));
        continue;
      }
      if (line.length === 1) {
        const s = line[0];
        if (!s) continue;
        const props = {
          ...(s.style ? { style: s.style } : {}),
          ...(mapped.textOverflow ? { textOverflow: mapped.textOverflow } : {}),
        };
        children.push(Object.keys(props).length === 0 ? ui.text(s.text) : ui.text(s.text, props));
        continue;
      }
      children.push(ui.richText(line));
    }
    return children.length === 1 ? (children[0] ?? ui.text("")) : ui.column({}, children);
  }

  if (spans.length === 1) {
    const s = spans[0];
    if (!s) return null;
    const props = {
      ...(s.style ? { style: s.style } : {}),
      ...(mapped.textOverflow ? { textOverflow: mapped.textOverflow } : {}),
    };
    // If there are no props, use the simplest `ui.text` overload.
    return Object.keys(props).length === 0 ? ui.text(s.text) : ui.text(s.text, props);
  }

  return ui.richText(spans);
}

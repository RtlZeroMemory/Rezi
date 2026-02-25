/**
 * ink-gradient shim.
 * Applies a per-line multiline gradient and emits ANSI truecolor text.
 */
import React from "react";

import { Text } from "../components/Text.js";

export interface GradientProps {
  colors: string[];
  children?: React.ReactNode;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const GRADIENT_TRACE_ENABLED = process.env["INK_GRADIENT_TRACE"] === "1";
let gradientTraceRenderCount = 0;

const traceGradient = (message: string): void => {
  if (!GRADIENT_TRACE_ENABLED) return;
  try {
    process.stderr.write(`[ink-gradient-shim trace] ${message}\n`);
  } catch {
    // Best-effort tracing only.
  }
};

const NAMED_COLORS: Readonly<Record<string, readonly [number, number, number]>> = Object.freeze({
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 255, 0],
  yellow: [255, 255, 0],
  blue: [0, 0, 255],
  magenta: [255, 0, 255],
  cyan: [0, 255, 255],
  white: [255, 255, 255],
  gray: [127, 127, 127],
  grey: [127, 127, 127],
});

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9:;]*[ -/]*[@-~]|\u009b[0-9:;]*[ -/]*[@-~]/g;

const parseColor = (color: unknown): RgbColor | undefined => {
  if (typeof color !== "string") return undefined;
  const trimmed = color.trim();
  if (trimmed.length === 0) return undefined;

  const lower = trimmed.toLowerCase();
  const named = NAMED_COLORS[lower];
  if (named) {
    return { r: named[0], g: named[1], b: named[2] };
  }

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (/^[\da-fA-F]{6}$/.test(hex)) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }
    if (/^[\da-fA-F]{3}$/.test(hex)) {
      return {
        r: Number.parseInt(`${hex[0]}${hex[0]}`, 16),
        g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
        b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
      };
    }
    return undefined;
  }

  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!rgbMatch) return undefined;

  return {
    r: clampByte(Number(rgbMatch[1])),
    g: clampByte(Number(rgbMatch[2])),
    b: clampByte(Number(rgbMatch[3])),
  };
};

const mixChannel = (start: number, end: number, t: number): number =>
  clampByte(start + (end - start) * t);

const interpolateStops = (stops: readonly RgbColor[], t: number): RgbColor => {
  if (stops.length === 0) return { r: 255, g: 255, b: 255 };
  if (stops.length === 1) return stops[0]!;

  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(stops.length - 1, leftIndex + 1);
  const localT = scaled - leftIndex;

  const left = stops[leftIndex]!;
  const right = stops[rightIndex]!;
  return {
    r: mixChannel(left.r, right.r, localT),
    g: mixChannel(left.g, right.g, localT),
    b: mixChannel(left.b, right.b, localT),
  };
};

const stripAnsi = (value: string): string => value.replace(ANSI_ESCAPE_REGEX, "");

const extractPlainText = (value: React.ReactNode): string => {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(extractPlainText).join("");
  if (React.isValidElement(value)) {
    return extractPlainText((value.props as { children?: React.ReactNode } | null)?.children);
  }
  return "";
};

const applyGradient = (text: string, stops: readonly RgbColor[]): string => {
  if (stops.length < 2) return stripAnsi(text);

  const lines = text.split("\n");
  const maxLength = Math.max(
    stops.length,
    ...lines.map((line) => Array.from(stripAnsi(line)).length),
  );
  const denominator = Math.max(1, maxLength - 1);
  const sampled = Array.from({ length: maxLength }, (_unused, index) =>
    interpolateStops(stops, index / denominator),
  );

  const renderedLines = lines.map((line) => {
    const chars = Array.from(stripAnsi(line));
    if (chars.length === 0) return "";
    let out = "";
    for (let index = 0; index < chars.length; index += 1) {
      const color = sampled[index]!;
      out += `\u001b[38;2;${color.r};${color.g};${color.b}m${chars[index]!}`;
    }
    return `${out}\u001b[0m`;
  });

  return renderedLines.join("\n");
};

const Gradient: React.FC<GradientProps> = ({ colors, children }) => {
  const parsedStops = colors
    .map((entry) => parseColor(entry))
    .filter((entry): entry is RgbColor => entry != null);
  const plainText = extractPlainText(children);
  const gradientText = applyGradient(plainText, parsedStops);
  if (GRADIENT_TRACE_ENABLED && gradientTraceRenderCount < 20) {
    gradientTraceRenderCount += 1;
    traceGradient(
      `render#${gradientTraceRenderCount} colors=${colors.length} parsedStops=${parsedStops.length} textChars=${Array.from(plainText).length} emittedAnsi=${gradientText.includes("\u001b[38;2;")}`,
    );
  }
  return React.createElement(Text, null, gradientText);
};

export default Gradient;

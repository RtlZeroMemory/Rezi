/**
 * ink-gradient shim — simplified replacement.
 * Applies a horizontal per-line gradient and emits ANSI truecolor text.
 */
import React from "react";
import { Text } from "ink";

const NAMED_COLORS = {
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
};

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const parseColor = (color) => {
  if (!color || typeof color !== "string") return undefined;
  const trimmed = color.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  const named = NAMED_COLORS[lower];
  if (named) return { r: named[0], g: named[1], b: named[2] };

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
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
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

const extractPlainText = (value) => {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(extractPlainText).join("");
  if (React.isValidElement(value)) return extractPlainText(value.props?.children);
  return "";
};

const mixChannel = (start, end, t) => clampByte(start + (end - start) * t);

const interpolateStops = (stops, t) => {
  if (stops.length === 0) return { r: 255, g: 255, b: 255 };
  if (stops.length === 1) return stops[0];

  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(stops.length - 1, leftIndex + 1);
  const localT = scaled - leftIndex;

  const left = stops[leftIndex];
  const right = stops[rightIndex];
  return {
    r: mixChannel(left.r, right.r, localT),
    g: mixChannel(left.g, right.g, localT),
    b: mixChannel(left.b, right.b, localT),
  };
};

const applyGradient = (text, colors) => {
  const parsedStops = (Array.isArray(colors) ? colors : [])
    .map((entry) => parseColor(entry))
    .filter(Boolean);

  if (parsedStops.length < 2) return text;

  return text
    .split("\n")
    .map((line) => {
      const chars = Array.from(line);
      if (chars.length === 0) return "";
      const denominator = Math.max(1, chars.length - 1);
      const gradient = chars
        .map((char, index) => {
          const color = interpolateStops(parsedStops, index / denominator);
          return `\u001b[38;2;${color.r};${color.g};${color.b}m${char}`;
        })
        .join("");
      return `${gradient}\u001b[0m`;
    })
    .join("\n");
};

const Gradient = ({ colors, children }) => {
  const plainText = extractPlainText(children);
  const gradientText = applyGradient(plainText, colors);
  return React.createElement(Text, null, gradientText);
};

export default Gradient;

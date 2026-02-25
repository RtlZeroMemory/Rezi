import assert from "node:assert/strict";
import { test } from "node:test";

import {
  toStyledCharacters,
  styledCharsToString,
  styledCharsWidth,
  wordBreakStyledChars,
  wrapStyledChars,
  widestLineFromStyledChars,
} from "../../styledChars.js";

test("toStyledCharacters: plain text", () => {
  const chars = toStyledCharacters("hello");
  assert.equal(chars.length, 5);
  assert.equal(chars[0]!.char, "h");
  assert.equal(chars[0]!.style, "");
});

test("toStyledCharacters: text with ANSI escapes", () => {
  const chars = toStyledCharacters("\u001b[31mred\u001b[0m");
  assert.equal(chars.length, 3);
  assert.equal(chars[0]!.char, "r");
  assert.ok(chars[0]!.style.includes("\u001b[31m"));
});

test("styledCharsToString: round-trips plain text", () => {
  const chars = toStyledCharacters("hello");
  const result = styledCharsToString(chars);
  assert.equal(result, "hello");
});

test("styledCharsWidth: ASCII text", () => {
  const chars = toStyledCharacters("hello");
  assert.equal(styledCharsWidth(chars), 5);
});

test("styledCharsWidth: ignores ANSI in width", () => {
  const chars = toStyledCharacters("\u001b[31mhi\u001b[0m");
  assert.equal(styledCharsWidth(chars), 2);
});

test("wordBreakStyledChars: splits on spaces", () => {
  const chars = toStyledCharacters("hello world foo");
  const words = wordBreakStyledChars(chars);
  assert.equal(words.length, 3);
  assert.equal(styledCharsToString(words[0]!), "hello");
  assert.equal(styledCharsToString(words[1]!), "world");
  assert.equal(styledCharsToString(words[2]!), "foo");
});

test("wrapStyledChars: wraps at width", () => {
  const chars = toStyledCharacters("hello world foo bar");
  const lines = wrapStyledChars(chars, 11);
  assert.equal(lines.length, 2);
  assert.equal(styledCharsToString(lines[0]!), "hello world");
  assert.equal(styledCharsToString(lines[1]!), "foo bar");
});

test("wrapStyledChars: single long word doesn't wrap", () => {
  const chars = toStyledCharacters("abcdefghij");
  const lines = wrapStyledChars(chars, 5);
  assert.equal(lines.length, 1);
  assert.equal(styledCharsToString(lines[0]!), "abcdefghij");
});

test("widestLineFromStyledChars: finds max width", () => {
  const lines = [
    toStyledCharacters("short"),
    toStyledCharacters("a longer line"),
    toStyledCharacters("medium"),
  ];
  assert.equal(widestLineFromStyledChars(lines), 13);
});

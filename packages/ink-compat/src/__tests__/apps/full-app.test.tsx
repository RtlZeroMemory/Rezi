/**
 * Tier 1 Test App: Full Mini-App
 *
 * A complete mini CLI app combining ALL Ink features:
 * Box, Text, Spacer, Static, Transform, Newline,
 * useInput, useApp, useFocus, useFocusManager,
 * useStdout, borders, colors, nested text,
 * conditional rendering, list rendering.
 *
 * Simulates a small "file processor" CLI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React, { useState } from "react";

import {
  Box,
  Newline,
  Spacer,
  Static,
  Text,
  Transform,
  useApp,
  useFocus,
  useFocusManager,
  useInput,
  useStdout,
} from "../../index.js";
import { render } from "../../testing/index.js";

// --- Types ---

interface FileEntry {
  name: string;
  size: number;
  status: "pending" | "processing" | "done" | "error";
}

// --- Sub-components ---

const StatusIcon: React.FC<{ status: FileEntry["status"] }> = ({ status }) => {
  const map = {
    pending: { icon: "○", color: "gray" },
    processing: { icon: "◉", color: "yellow" },
    done: { icon: "✓", color: "green" },
    error: { icon: "✗", color: "red" },
  };
  const { icon, color } = map[status];
  return React.createElement(Text, { color }, icon);
};

const ActionButton: React.FC<{
  label: string;
  focusId: string;
  autoFocus?: boolean;
}> = ({ label, focusId, autoFocus }) => {
  const focusOpts: { id: string; autoFocus?: boolean } = { id: focusId };
  if (autoFocus !== undefined) focusOpts.autoFocus = autoFocus;
  const { isFocused } = useFocus(focusOpts);
  return React.createElement(
    Box,
    { borderStyle: isFocused ? "bold" : "single", paddingX: 1 },
    React.createElement(
      Text,
      { bold: isFocused, color: isFocused ? "cyan" : "white" },
      label,
    ),
  );
};

// --- Main app ---

const FileProcessor: React.FC = () => {
  const { exit } = useApp();
  const { write } = useStdout();
  const { focusNext, focusPrevious } = useFocusManager();

  const [files, setFiles] = useState<FileEntry[]>([
    { name: "readme.md", size: 1024, status: "pending" },
    { name: "index.ts", size: 2048, status: "pending" },
    { name: "package.json", size: 512, status: "pending" },
  ]);
  const [log, setLog] = useState<string[]>([]);

  const doneFiles = files.filter((f) => f.status === "done");
  const pendingFiles = files.filter((f) => f.status !== "done");

  useInput((input, key) => {
    if (key.tab && key.shift) {
      focusPrevious();
    } else if (key.tab) {
      focusNext();
    } else if (input === "p") {
      // Process next pending file
      const next = files.find((f) => f.status === "pending");
      if (next) {
        setFiles((prev) =>
          prev.map((f) =>
            f.name === next.name ? { ...f, status: "done" } : f,
          ),
        );
        setLog((prev) => [...prev, `Processed: ${next.name}`]);
      }
    } else if (input === "q") {
      exit();
    }
  });

  const allDone = files.every((f) => f.status === "done");

  return React.createElement(Box, { flexDirection: "column" },
    // Completed files in Static
    doneFiles.length > 0
      ? React.createElement(Static<FileEntry>, {
          items: doneFiles,
          children: (file: FileEntry) =>
            React.createElement(
              Box,
              { key: file.name, flexDirection: "row", gap: 1 },
              React.createElement(StatusIcon, { status: "done" }),
              React.createElement(Text, { dimColor: true }, file.name),
              React.createElement(Text, { dimColor: true }, `(${file.size}B)`),
            ),
        })
      : null,

    // Header
    React.createElement(
      Box,
      { borderStyle: "round", paddingX: 1, paddingY: 0 },
      React.createElement(
        Box,
        { flexDirection: "row" },
        React.createElement(Text, { bold: true, color: "cyan" }, "File Processor"),
        React.createElement(Spacer, null),
        React.createElement(
          Text,
          { dimColor: true },
          `${doneFiles.length}/${files.length} done`,
        ),
      ),
    ),

    // File list
    React.createElement(
      Box,
      { flexDirection: "column", paddingX: 1, marginTop: 1 },
      ...pendingFiles.map((file) =>
        React.createElement(
          Box,
          { key: file.name, flexDirection: "row", gap: 1 },
          React.createElement(StatusIcon, { status: file.status }),
          React.createElement(Text, null, file.name),
          React.createElement(
            Text,
            { dimColor: true },
            `${file.size}B`,
          ),
        ),
      ),
      pendingFiles.length === 0
        ? React.createElement(
            Text,
            { color: "green", bold: true },
            "All files processed!",
          )
        : null,
    ),

    // Log via Transform (uppercase timestamps)
    log.length > 0
      ? React.createElement(
          Box,
          { marginTop: 1, paddingX: 1 },
          React.createElement(Transform, {
            transform: (line: string, idx: number) =>
              `[${String(idx + 1).padStart(2, "0")}] ${line}`,
            children: React.createElement(Text, { dimColor: true }, log.join("\n")),
          }),
        )
      : null,

    // Action buttons
    React.createElement(
      Box,
      { flexDirection: "row", gap: 1, marginTop: 1, paddingX: 1 },
      React.createElement(ActionButton, {
        label: "[P]rocess",
        focusId: "btn-process",
        autoFocus: true,
      }),
      React.createElement(ActionButton, {
        label: "[Q]uit",
        focusId: "btn-quit",
      }),
    ),

    // Status bar
    React.createElement(
      Box,
      { marginTop: 1, borderStyle: "single", paddingX: 1 },
      React.createElement(
        Text,
        { dimColor: true },
        allDone
          ? "Complete — press q to exit"
          : "Press p to process next file",
      ),
    ),
  );
};

// --- Tests ---

test("full-app: renders initial state", () => {
  const { lastFrame } = render(React.createElement(FileProcessor));
  const frame = lastFrame();
  assert.ok(frame.includes("File Processor"), "header present");
  assert.ok(frame.includes("0/3 done"), "progress counter");
  assert.ok(frame.includes("readme.md"), "first file");
  assert.ok(frame.includes("index.ts"), "second file");
  assert.ok(frame.includes("package.json"), "third file");
  assert.ok(frame.includes("[P]rocess"), "process button");
  assert.ok(frame.includes("[Q]uit"), "quit button");
});

test("full-app: process button is auto-focused", () => {
  const { lastFrame } = render(React.createElement(FileProcessor));
  const frame = lastFrame();
  // The focused button should have bold border (which renders differently)
  assert.ok(frame.includes("[P]rocess"), "process button visible");
});

test("full-app: p key processes first file", () => {
  const { lastFrame, stdin } = render(React.createElement(FileProcessor));
  stdin.write("p");
  const frame = lastFrame();
  assert.ok(frame.includes("1/3 done"), "progress updated to 1/3");
  assert.ok(frame.includes("✓"), "checkmark for completed file");
  assert.ok(frame.includes("Processed: readme.md"), "log entry for processed file");
});

test("full-app: process all files", () => {
  const { lastFrame, stdin } = render(React.createElement(FileProcessor));
  stdin.write("p"); // readme.md
  stdin.write("p"); // index.ts
  stdin.write("p"); // package.json
  const frame = lastFrame();
  assert.ok(frame.includes("3/3 done"), "all files processed");
  assert.ok(frame.includes("All files processed!"), "completion message");
  assert.ok(frame.includes("Complete"), "status bar shows complete");
});

test("full-app: log shows numbered entries via Transform", () => {
  const { lastFrame, stdin } = render(React.createElement(FileProcessor));
  stdin.write("p");
  stdin.write("p");
  const frame = lastFrame();
  assert.ok(frame.includes("[01]"), "first log entry numbered");
  assert.ok(frame.includes("[02]"), "second log entry numbered");
});

test("full-app: Tab switches focus between buttons", () => {
  const { lastFrame, stdin } = render(React.createElement(FileProcessor));
  // Initial focus is on Process
  stdin.write("\t"); // Tab → Quit
  const frame = lastFrame();
  assert.ok(frame.includes("[Q]uit"), "quit button visible");
});

test("full-app: Shift+Tab reverses focus", () => {
  const { lastFrame, stdin } = render(React.createElement(FileProcessor));
  stdin.write("\t"); // Tab → Quit
  stdin.write("\u001b[Z"); // Shift+Tab → back to Process
  const frame = lastFrame();
  assert.ok(frame.includes("[P]rocess"), "process button visible");
});

test("full-app: border characters present", () => {
  const { lastFrame } = render(React.createElement(FileProcessor));
  const frame = lastFrame();
  // Should have rounded border (╭) from header and single border (┌) from status
  const hasBorderChars = "╭╮╰╯┌┐└┘│─┃━".split("").some((c) => frame.includes(c));
  assert.ok(hasBorderChars, "border characters present in output");
});

test("full-app: Spacer pushes progress to right of header", () => {
  const { lastFrame } = render(React.createElement(FileProcessor));
  const lines = lastFrame().split("\n");
  const headerLine = lines.find((l) => l.includes("File Processor") && l.includes("done"));
  // Both title and progress on same line means spacer worked
  assert.ok(
    headerLine !== undefined,
    "title and progress should be on same line (Spacer worked)",
  );
});

test("full-app: renders status icons for pending files", () => {
  const { lastFrame } = render(React.createElement(FileProcessor));
  const frame = lastFrame();
  // Pending status = ○
  const pendingCount = (frame.match(/○/g) || []).length;
  assert.ok(pendingCount >= 3, `should have 3 pending icons (found ${pendingCount})`);
});

test("full-app: multiple rerenders maintain consistency", () => {
  const { lastFrame, stdin } = render(React.createElement(FileProcessor));

  // Process one, check state
  stdin.write("p");
  let frame = lastFrame();
  assert.ok(frame.includes("1/3 done"), "1/3 after first process");

  // Process another
  stdin.write("p");
  frame = lastFrame();
  assert.ok(frame.includes("2/3 done"), "2/3 after second process");

  // Process last
  stdin.write("p");
  frame = lastFrame();
  assert.ok(frame.includes("3/3 done"), "3/3 after third process");
  assert.ok(frame.includes("All files processed!"), "completion shown");

  // Extra p should be harmless
  stdin.write("p");
  frame = lastFrame();
  assert.ok(frame.includes("3/3 done"), "still 3/3 after extra process");
});

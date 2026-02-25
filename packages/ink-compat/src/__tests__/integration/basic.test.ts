import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import React, { useEffect } from "react";

import { Box } from "../../components/Box.js";
import { Newline } from "../../components/Newline.js";
import { Spacer } from "../../components/Spacer.js";
import { Text } from "../../components/Text.js";
import { useApp } from "../../hooks/useApp.js";
import { useFocus } from "../../hooks/useFocus.js";
import { useInput } from "../../hooks/useInput.js";
import { render as runtimeRender } from "../../runtime/render.js";
import { render } from "../../testing/index.js";

function latestFrameFromWrites(writes: string): string {
  const marker = "\u001b[H\u001b[J";
  const start = writes.lastIndexOf(marker);
  return start >= 0 ? writes.slice(start + marker.length) : writes;
}

test("simple text render", () => {
  const result = render(React.createElement(Text, null, "Hello"));
  assert.match(result.lastFrame(), /Hello/);
});

test("styled text render", () => {
  const result = render(React.createElement(Text, { color: "green", bold: true }, "Hi"));
  assert.match(result.lastFrame(), /Hi/);
});

test("box layout column", () => {
  const result = render(
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, "A"),
      React.createElement(Text, null, "B"),
    ),
  );

  const frame = result.lastFrame();
  assert.ok(frame.indexOf("A") < frame.indexOf("B"));
});

test("box layout row", () => {
  const result = render(
    React.createElement(
      Box,
      { flexDirection: "row" },
      React.createElement(Text, null, "A"),
      React.createElement(Text, null, "B"),
    ),
  );

  const compact = result.lastFrame().replace(/\n/g, "");
  assert.match(compact, /A\s*B/);
});

test("spacer expands between left and right", () => {
  const result = render(
    React.createElement(
      Box,
      { flexDirection: "row", width: 20 },
      React.createElement(Text, null, "L"),
      React.createElement(Spacer),
      React.createElement(Text, null, "R"),
    ),
  );

  const line = result.lastFrame().split("\n")[0] ?? "";
  const leftIndex = line.indexOf("L");
  const rightIndex = line.lastIndexOf("R");

  assert.ok(leftIndex >= 0);
  assert.ok(rightIndex > leftIndex + 1);
});

test("nested boxes with padding", () => {
  const result = render(
    React.createElement(
      Box,
      { padding: 1 },
      React.createElement(Box, { padding: 1 }, React.createElement(Text, null, "Inner")),
    ),
  );

  assert.match(result.lastFrame(), /Inner/);
});

test("border rendering", () => {
  const result = render(
    React.createElement(Box, { borderStyle: "round" }, React.createElement(Text, null, "Content")),
  );

  const frame = result.lastFrame();
  assert.match(frame, /Content/);
  assert.ok(
    frame.includes("╭") || frame.includes("╮") || frame.includes("╰") || frame.includes("╯"),
  );
});

test("newline renders multi-line text", () => {
  const result = render(React.createElement(Text, null, "A", React.createElement(Newline), "B"));

  assert.match(result.lastFrame(), /A\nB/);
});

test("useInput handles simulated key press", () => {
  const seen: Array<{ input: string; up: boolean; ctrl: boolean }> = [];

  function App(): React.ReactElement {
    useInput((input, key) => {
      seen.push({ input, up: key.upArrow, ctrl: key.ctrl });
    });
    return React.createElement(Text, null, "Input");
  }

  const result = render(React.createElement(App));
  result.stdin.write("\u001b[A");
  result.stdin.write("q");
  result.stdin.write("\u0001");

  assert.deepEqual(seen[0], { input: "", up: true, ctrl: false });
  assert.deepEqual(seen[1], { input: "q", up: false, ctrl: false });
  assert.deepEqual(seen[2], { input: "a", up: false, ctrl: true });
});

test("useApp exit resolves instance waitUntilExit", async () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  function App(): React.ReactElement {
    const { exit } = useApp();
    useEffect(() => {
      exit();
    }, [exit]);
    return React.createElement(Text, null, "Bye");
  }

  const instance = runtimeRender(React.createElement(App), {
    stdin,
    stdout,
    stderr,
  });

  await instance.waitUntilExit();
  instance.unmount();
  instance.cleanup();
});

test("runtime render hides cursor and restores it on teardown", () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(React.createElement(Text, null, "Cursor"), {
    stdin,
    stdout,
    stderr,
  });

  instance.unmount();
  instance.cleanup();

  const hideIndex = writes.indexOf("\u001b[?25l");
  const showIndex = writes.lastIndexOf("\u001b[?25h");
  assert.ok(hideIndex >= 0, "expected cursor hide escape sequence");
  assert.ok(showIndex >= 0, "expected cursor show escape sequence");
  assert.ok(showIndex > hideIndex, "expected cursor show after hide");
});

test("runtime render redraws on terminal resize", async () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};

  const stdout = new PassThrough() as PassThrough & {
    columns?: number;
    rows?: number;
  };
  stdout.columns = 80;
  stdout.rows = 24;

  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(React.createElement(Text, null, "Resize me"), {
    stdin,
    stdout,
    stderr,
  });

  try {
    assert.match(writes, /Resize me/);
    writes = "";

    stdout.columns = 100;
    stdout.rows = 28;
    stdout.emit("resize");
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.match(writes, /Resize me/);
    writes = "";

    stdout.columns = 120;
    stdout.rows = 30;
    stdout.emit("resize");
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.match(writes, /Resize me/);
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

test("runtime render coalesces rapid resize bursts", async () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};

  const stdout = new PassThrough() as PassThrough & {
    columns?: number;
    rows?: number;
  };
  stdout.columns = 80;
  stdout.rows = 24;

  const stderr = new PassThrough();
  let writeCount = 0;
  let writes = "";
  stdout.on("data", (chunk) => {
    writeCount += 1;
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(React.createElement(Text, null, "Resize storm"), {
    stdin,
    stdout,
    stderr,
  });

  try {
    const baselineWrites = writeCount;
    for (let index = 0; index < 30; index += 1) {
      stdout.columns = 80 + (index % 6);
      stdout.rows = 24 + (index % 4);
      stdout.emit("resize");
    }

    await new Promise((resolve) => setTimeout(resolve, 70));
    const writesDuringStorm = writeCount - baselineWrites;

    assert.ok(
      writesDuringStorm <= 3,
      `expected coalesced writes during resize burst, saw ${writesDuringStorm}`,
    );
    assert.match(writes, /Resize storm/);
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

test("runtime render keeps latest frame under stdout backpressure", async () => {
  class SlowStdout extends Writable {
    columns = 80;
    rows = 24;
    writes: string[] = [];

    constructor() {
      super({ decodeStrings: false, highWaterMark: 1 });
    }

    override _write(
      chunk: string | Buffer,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ): void {
      this.writes.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
      setTimeout(callback, 15);
    }
  }

  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new SlowStdout();
  const stderr = new PassThrough();

  const instance = runtimeRender(React.createElement(Text, null, "Backpressure"), {
    stdin,
    stdout,
    stderr,
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const baselineWrites = stdout.writes.length;

    for (let index = 0; index < 25; index += 1) {
      stdout.columns = 80 + (index % 5);
      stdout.rows = 24 + (index % 3);
      stdout.emit("resize");
    }

    await new Promise((resolve) => setTimeout(resolve, 320));
    const writesDuringStorm = stdout.writes.length - baselineWrites;

    assert.ok(
      writesDuringStorm <= 8,
      `expected latest-frame writes under backpressure, saw ${writesDuringStorm}`,
    );
    assert.match(stdout.writes[stdout.writes.length - 1] ?? "", /Backpressure/);
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

test("runtime render falls back to getWindowSize when columns and rows are zero", () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};

  const stdout = new PassThrough() as PassThrough & {
    columns?: number;
    rows?: number;
    getWindowSize?: () => [number, number];
  };
  stdout.columns = 0;
  stdout.rows = 0;
  stdout.getWindowSize = () => [120, 30];

  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(
    React.createElement(
      Box,
      { flexDirection: "row", width: 100 },
      React.createElement(Text, null, "L"),
      React.createElement(Spacer),
      React.createElement(Text, null, "R"),
    ),
    {
      stdin,
      stdout,
      stderr,
    },
  );

  try {
    const marker = "\u001b[H\u001b[J";
    const start = writes.lastIndexOf(marker);
    const latest = start >= 0 ? writes.slice(start + marker.length) : writes;
    const stripped = latest.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, "");
    const wideLine = stripped
      .split("\n")
      .find((line) => line.includes("L") && line.includes("R"));

    assert.ok(wideLine != null);
    assert.ok(wideLine.length >= 95);
    assert.ok(wideLine.indexOf("L") >= 0);
    assert.ok(wideLine.lastIndexOf("R") > wideLine.indexOf("L"));
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

test("runtime render stretches hidden-overflow root to viewport height", async () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};

  const stdout = new PassThrough() as PassThrough & {
    columns?: number;
    rows?: number;
  };
  stdout.columns = 20;
  stdout.rows = 10;

  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(
    React.createElement(
      Box,
      { flexDirection: "column", width: 20, overflow: "hidden" },
      React.createElement(Text, null, "Top"),
      React.createElement(Spacer),
      React.createElement(Text, null, "Bottom"),
    ),
    {
      stdin,
      stdout,
      stderr,
    },
  );

  try {
    await new Promise((resolve) => setTimeout(resolve, 25));

    const latest = latestFrameFromWrites(writes)
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/\r/g, "");
    const lines = latest.split("\n");
    const bottomLine = lines.findIndex((line) => line.includes("Bottom"));

    assert.ok(bottomLine >= 8, `expected Bottom near viewport end, got line ${bottomLine}`);
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

test("runtime render keeps root-child flexGrow with viewport-coerced root height", async () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};

  const stdout = new PassThrough() as PassThrough & {
    columns?: number;
    rows?: number;
  };
  stdout.columns = 20;
  stdout.rows = 10;

  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(
    React.createElement(
      Box,
      { flexDirection: "column", width: 20, overflow: "hidden" },
      React.createElement(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        React.createElement(Text, null, "Body"),
      ),
      React.createElement(Text, null, "Footer"),
    ),
    {
      stdin,
      stdout,
      stderr,
    },
  );

  try {
    await new Promise((resolve) => setTimeout(resolve, 25));

    const latest = latestFrameFromWrites(writes)
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/\r/g, "");
    const lines = latest.split("\n");
    const footerLine = lines.findIndex((line) => line.includes("Footer"));

    assert.ok(footerLine >= 8, `expected Footer near viewport end, got line ${footerLine}`);
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

test("useFocus and Tab traversal", async () => {
  let receivedTab = false;

  function Focusable(props: {
    id: string;
    label: string;
    autoFocus?: boolean;
  }): React.ReactElement {
    const { isFocused } = useFocus(
      props.autoFocus === undefined
        ? { id: props.id }
        : { id: props.id, autoFocus: props.autoFocus },
    );
    return React.createElement(Text, null, isFocused ? `[${props.label}]` : props.label);
  }

  function App(): React.ReactElement {
    useInput((_input, key) => {
      if (key.tab) {
        receivedTab = true;
      }
    });

    return React.createElement(
      Box,
      { flexDirection: "row" },
      React.createElement(Focusable, { id: "a", label: "A", autoFocus: true }),
      React.createElement(Focusable, { id: "b", label: "B" }),
    );
  }

  const result = render(React.createElement(App));
  assert.match(result.lastFrame().replace(/\n/g, ""), /\[A\].*B/);

  result.stdin.write("\t");
  await Promise.resolve();
  assert.equal(receivedTab, true);
  assert.match(result.lastFrame().replace(/\n/g, ""), /A.*\[B\]/);

  result.stdin.write("\u001b[Z");
  await Promise.resolve();
  assert.match(result.lastFrame().replace(/\n/g, ""), /\[A\].*B/);
});

test("rerender updates output", () => {
  const result = render(React.createElement(Text, null, "Old"));
  assert.match(result.lastFrame(), /Old/);

  result.rerender(React.createElement(Text, null, "New"));
  assert.match(result.lastFrame(), /New/);
});

test("display none hides content", () => {
  const result = render(
    React.createElement(
      Box,
      null,
      React.createElement(Box, { display: "none" }, React.createElement(Text, null, "hidden")),
      React.createElement(Text, null, "visible"),
    ),
  );

  const frame = result.lastFrame();
  assert.equal(frame.includes("hidden"), false);
  assert.equal(frame.includes("visible"), true);
});

test("flexGrow child with spacer can fill row", () => {
  const result = render(
    React.createElement(
      Box,
      { flexDirection: "row", width: 30 },
      React.createElement(Text, null, "Start"),
      React.createElement(Spacer),
      React.createElement(Text, null, "End"),
    ),
  );

  const line = result.lastFrame().split("\n")[0] ?? "";
  const start = line.indexOf("Start");
  const end = line.indexOf("End");

  assert.ok(start >= 0);
  assert.ok(end > start + 5);
});

test("padding and margin apply spacing", () => {
  const result = render(
    React.createElement(
      Box,
      { paddingLeft: 2, marginLeft: 1 },
      React.createElement(Text, null, "X"),
    ),
  );

  const frame = result.lastFrame();
  const line = frame.split("\n").find((entry) => entry.includes("X")) ?? "";
  assert.ok(line.indexOf("X") >= 2);
});

// ─── Regression: styleToSgr always resets before applying new attributes ───

test("ANSI output resets attributes between differently-styled cells", () => {
  // Two adjacent Text elements with different styles. The second element's ANSI
  // codes must include a reset (SGR 0) so that bold from the first doesn't
  // bleed into the second.
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(
    React.createElement(
      Box,
      { flexDirection: "row" },
      React.createElement(Text, { bold: true }, "Bold"),
      React.createElement(Text, { color: "green" }, "Green"),
    ),
    { stdin, stdout, stderr },
  );

  try {
    // Every SGR sequence that sets attributes should start with \u001b[0;...
    // to prevent attribute bleed from the previous cell.
    const sgrPattern = /\u001b\[(\d[^m]*)m/g;
    let match: RegExpExecArray | null;
    const nonResetCodes: string[] = [];
    while ((match = sgrPattern.exec(writes)) !== null) {
      const inner = match[1]!;
      // "0m" is a bare reset (fine). Any code that sets attributes (contains
      // digits > 0) MUST begin with "0;" to include a reset prefix.
      if (inner === "0") continue; // bare reset
      if (inner.startsWith("0;")) continue; // reset + new attrs
      if (/^\d+$/.test(inner) && Number(inner) === 0) continue;
      // CSI sequences like "?25l" (cursor hide) are not SGR — skip them
      if (inner.includes("?")) continue;
      // H and J are cursor positioning, not SGR
      if (/[HJ]/.test(inner)) continue;
      nonResetCodes.push(inner);
    }

    assert.deepEqual(
      nonResetCodes,
      [],
      `Expected all SGR attribute sequences to include reset prefix, but found: ${nonResetCodes.join(", ")}`,
    );
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

// ─── Regression: text inherits background from underlying fillRect ───

test("text over backgroundColor box preserves box background in ANSI output", () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  // A Box with a dark background containing plain white text.
  // The text cells should inherit the box's bg via mergeCellStyles.
  const instance = runtimeRender(
    React.createElement(
      Box,
      { backgroundColor: "#1c1c1c" },
      React.createElement(Text, null, "Hello"),
    ),
    { stdin, stdout, stderr },
  );

  try {
    // #1c1c1c = rgb(28,28,28). The ANSI output should contain 48;2;28;28;28
    // (SGR background color) on the line that renders "Hello".
    const lines = writes.split("\n");
    const helloLine = lines.find((l) => l.includes("Hello"));
    assert.ok(helloLine, "expected 'Hello' in ANSI output");

    // The background color should be present in the same line as the text
    assert.ok(
      helloLine.includes("48;2;28;28;28"),
      `expected bg color 48;2;28;28;28 on the Hello line, got: ${helloLine}`,
    );
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

// ─── Regression: flexGrow propagates through nested definite columns ───

test("flexGrow works through nested definite-height column chain", () => {
  // Simulates Gemini CLI's layout: root overflow:hidden column > intermediate
  // column (no explicit height) > child with flexGrow:1. The child should
  // receive flex:1 and expand to fill available space.
  const result = render(
    React.createElement(
      Box,
      { flexDirection: "column", overflow: "hidden" },
      React.createElement(
        Box,
        { flexDirection: "column" },
        React.createElement(
          Box,
          { flexGrow: 1, flexDirection: "column" },
          React.createElement(Text, null, "Content"),
        ),
        React.createElement(Text, null, "Footer"),
      ),
    ),
  );

  const frame = result.lastFrame();
  const lines = frame.split("\n");
  const contentLine = lines.findIndex((l) => l.includes("Content"));
  const footerLine = lines.findIndex((l) => l.includes("Footer"));

  assert.ok(contentLine >= 0, "Content should be rendered");
  assert.ok(footerLine >= 0, "Footer should be rendered");
  // With flexGrow working, footer should be pushed near the bottom of the
  // 24-row viewport, not immediately after content.
  assert.ok(
    footerLine > contentLine + 5,
    `Footer (line ${footerLine}) should be significantly below Content (line ${contentLine}) due to flexGrow`,
  );
});

// ─── Regression: resize throttle skips intermediate non-forced renders ───

test("resize debounce prevents intermediate frame renders", async () => {
  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};

  const stdout = new PassThrough() as PassThrough & {
    columns?: number;
    rows?: number;
  };
  stdout.columns = 80;
  stdout.rows = 24;

  const stderr = new PassThrough();
  let clearCount = 0;
  stdout.on("data", (chunk) => {
    const s = chunk.toString("utf-8");
    // Count how many times the screen is fully cleared (home + erase)
    const matches = s.match(/\u001b\[H\u001b\[J/g);
    if (matches) clearCount += matches.length;
  });

  const instance = runtimeRender(React.createElement(Text, null, "Throttle"), {
    stdin,
    stdout,
    stderr,
  });

  try {
    const baseClears = clearCount;

    // Fire 20 rapid resize events in quick succession
    for (let i = 0; i < 20; i++) {
      stdout.columns = 80 + (i % 5);
      stdout.rows = 24 + (i % 3);
      stdout.emit("resize");
    }

    // Wait for the debounce timer to settle
    await new Promise((resolve) => setTimeout(resolve, 80));

    const resizeClears = clearCount - baseClears;
    // Without throttling, each resize would produce a clear. With throttling,
    // we should see far fewer than 20 clears (typically 1-3).
    assert.ok(
      resizeClears < 10,
      `Expected fewer than 10 clears for 20 rapid resizes, got ${resizeClears}`,
    );
  } finally {
    instance.unmount();
    instance.cleanup();
  }
});

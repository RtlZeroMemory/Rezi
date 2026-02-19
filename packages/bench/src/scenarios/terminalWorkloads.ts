function clipPad(s: string, cols: number): string {
  if (s.length >= cols) return s.slice(0, cols);
  return `${s}${" ".repeat(cols - s.length)}`;
}

function bar(value: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

export function buildTerminalScreenTransitionLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): readonly string[] {
  const rows = Number(params["rows"] ?? 40);
  const cols = Number(params["cols"] ?? 120);
  const mode = tick % 3;
  const lines: string[] = [];

  if (mode === 0) {
    lines.push(clipPad("terminal-screen-transition [dashboard]", cols));
    for (let i = 0; i < rows - 1; i++) {
      const v = ((tick * 37 + i * 97) % 1000) / 1000;
      lines.push(clipPad(`svc-${String(i).padStart(2, "0")} ${bar(v, 24)} ${(v * 100).toFixed(1)}%`, cols));
    }
    return lines;
  }

  if (mode === 1) {
    lines.push(clipPad("terminal-screen-transition [table]", cols));
    lines.push(clipPad("ID        NAME                 STATE     LAT(ms)   ERR", cols));
    for (let i = 0; i < rows - 2; i++) {
      const id = `node-${String((tick + i) % 512).padStart(3, "0")}`;
      const state = (tick + i) % 7 === 0 ? "degraded" : "healthy ";
      const lat = 10 + ((tick * 13 + i * 7) % 190);
      const err = (tick + i * 3) % 53 === 0 ? "yes" : "no ";
      lines.push(clipPad(`${id}   backend-${String(i).padStart(2, "0")}        ${state}     ${String(lat).padStart(3, " ")}      ${err}`, cols));
    }
    return lines;
  }

  lines.push(clipPad("terminal-screen-transition [logs]", cols));
  for (let i = 0; i < rows - 1; i++) {
    const seq = tick * rows + i;
    const lvl = seq % 11 === 0 ? "WARN" : seq % 23 === 0 ? "ERROR" : "INFO ";
    lines.push(clipPad(`${lvl} ${new Date(1700000000000 + seq * 17).toISOString()} service=${seq % 17} msg=transition-${seq}`, cols));
  }
  return lines;
}

export function buildTerminalFpsStreamLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): readonly string[] {
  const rows = Number(params["rows"] ?? 40);
  const cols = Number(params["cols"] ?? 120);
  const channels = Number(params["channels"] ?? 12);

  const lines: string[] = [];
  lines.push(clipPad(`terminal-fps-stream tick=${tick} target=60fps channels=${channels}`, cols));
  lines.push(clipPad("Channel  Value      Trend", cols));

  const bodyRows = Math.max(1, rows - 2);
  for (let i = 0; i < bodyRows; i++) {
    const ch = i % channels;
    const v = ((tick * (17 + ch) + i * 31) % 1000) / 1000;
    const trendSeed = (tick + i * 13 + ch * 11) % 16;
    const trend = Array.from({ length: 16 }, (_, j) => (((trendSeed + j * 3) % 16) / 15 < v ? "▮" : "▯")).join("");
    lines.push(clipPad(`ch-${String(ch).padStart(2, "0")}    ${(v * 100).toFixed(2).padStart(6, " ")}%    ${trend}`, cols));
  }
  return lines;
}

export function buildTerminalInputLatencyLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): readonly string[] {
  const rows = Number(params["rows"] ?? 40);
  const cols = Number(params["cols"] ?? 120);
  const lines: string[] = [];

  lines.push(clipPad("terminal-input-latency synthetic-key-event -> frame", cols));
  lines.push(clipPad(`tick=${tick} active=${tick % 16} token=${((tick * 1103515245) >>> 0).toString(16)}`, cols));
  for (let i = 0; i < rows - 2; i++) {
    const active = i === tick % Math.max(1, rows - 2);
    lines.push(clipPad(`${active ? ">" : " "} command-${String(i).padStart(2, "0")}  value=${(tick + i * 9) % 10000}`, cols));
  }
  return lines;
}

export function buildTerminalMemorySoakLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): readonly string[] {
  const rows = Number(params["rows"] ?? 40);
  const cols = Number(params["cols"] ?? 120);
  const lines: string[] = [];

  lines.push(clipPad(`terminal-memory-soak tick=${tick}`, cols));
  for (let i = 0; i < rows - 1; i++) {
    const id = (tick * 7 + i * 19) % 100000;
    const payload = `${String(id).padStart(5, "0")} ${"x".repeat((i % 7) + 8)} ${(tick + i) % 997}`;
    lines.push(clipPad(payload, cols));
  }
  return lines;
}

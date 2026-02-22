function clipPad(s: string, cols: number): string {
  if (s.length >= cols) return s.slice(0, cols);
  return `${s}${" ".repeat(cols - s.length)}`;
}

function bar(value: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

type WorkloadParam = number | string;
type TerminalWorkloadParams = Readonly<{
  rows?: WorkloadParam;
  cols?: WorkloadParam;
  channels?: WorkloadParam;
  services?: WorkloadParam;
  dwell?: WorkloadParam;
}>;

function numberParam(value: WorkloadParam | undefined, fallback: number): number {
  return Number(value ?? fallback);
}

type PaneWidths = Readonly<{
  left: number;
  center: number;
  right: number;
}>;

function fullUiPaneWidths(cols: number): PaneWidths {
  const left = Math.max(22, Math.floor(cols * 0.24));
  const right = Math.max(24, Math.floor(cols * 0.28));
  const center = Math.max(24, cols - left - right - 6);
  return { left, center, right };
}

function paneLine(
  cols: number,
  widths: PaneWidths,
  left: string,
  center: string,
  right: string,
): string {
  return clipPad(
    `${clipPad(left, widths.left)} │ ${clipPad(center, widths.center)} │ ${clipPad(right, widths.right)}`,
    cols,
  );
}

function spark(seed: number, width: number): string {
  let out = "";
  for (let i = 0; i < width; i++) {
    out += (seed + i * 3) % 7 > 2 ? "#" : ".";
  }
  return out;
}

export function buildTerminalScreenTransitionLines(
  tick: number,
  params: TerminalWorkloadParams,
): readonly string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const mode = tick % 3;
  const lines: string[] = [];

  if (mode === 0) {
    lines.push(clipPad("terminal-screen-transition [dashboard]", cols));
    for (let i = 0; i < rows - 1; i++) {
      const v = ((tick * 37 + i * 97) % 1000) / 1000;
      lines.push(
        clipPad(`svc-${String(i).padStart(2, "0")} ${bar(v, 24)} ${(v * 100).toFixed(1)}%`, cols),
      );
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
      lines.push(
        clipPad(
          `${id}   backend-${String(i).padStart(2, "0")}        ${state}     ${String(lat).padStart(3, " ")}      ${err}`,
          cols,
        ),
      );
    }
    return lines;
  }

  lines.push(clipPad("terminal-screen-transition [logs]", cols));
  for (let i = 0; i < rows - 1; i++) {
    const seq = tick * rows + i;
    const lvl = seq % 11 === 0 ? "WARN" : seq % 23 === 0 ? "ERROR" : "INFO ";
    lines.push(
      clipPad(
        `${lvl} ${new Date(1700000000000 + seq * 17).toISOString()} service=${seq % 17} msg=transition-${seq}`,
        cols,
      ),
    );
  }
  return lines;
}

export function buildTerminalFpsStreamLines(
  tick: number,
  params: TerminalWorkloadParams,
): readonly string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const channels = numberParam(params.channels, 12);

  const lines: string[] = [];
  lines.push(clipPad(`terminal-fps-stream tick=${tick} target=60fps channels=${channels}`, cols));
  lines.push(clipPad("Channel  Value      Trend", cols));

  const bodyRows = Math.max(1, rows - 2);
  for (let i = 0; i < bodyRows; i++) {
    const ch = i % channels;
    const v = ((tick * (17 + ch) + i * 31) % 1000) / 1000;
    const trendSeed = (tick + i * 13 + ch * 11) % 16;
    const trend = Array.from({ length: 16 }, (_, j) =>
      ((trendSeed + j * 3) % 16) / 15 < v ? "▮" : "▯",
    ).join("");
    lines.push(
      clipPad(
        `ch-${String(ch).padStart(2, "0")}    ${(v * 100).toFixed(2).padStart(6, " ")}%    ${trend}`,
        cols,
      ),
    );
  }
  return lines;
}

export function buildTerminalInputLatencyLines(
  tick: number,
  params: TerminalWorkloadParams,
): readonly string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const lines: string[] = [];

  lines.push(clipPad("terminal-input-latency synthetic-key-event -> frame", cols));
  lines.push(
    clipPad(
      `tick=${tick} active=${tick % 16} token=${((tick * 1103515245) >>> 0).toString(16)}`,
      cols,
    ),
  );
  for (let i = 0; i < rows - 2; i++) {
    const active = i === tick % Math.max(1, rows - 2);
    lines.push(
      clipPad(
        `${active ? ">" : " "} command-${String(i).padStart(2, "0")}  value=${(tick + i * 9) % 10000}`,
        cols,
      ),
    );
  }
  return lines;
}

export function buildTerminalMemorySoakLines(
  tick: number,
  params: TerminalWorkloadParams,
): readonly string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const lines: string[] = [];

  lines.push(clipPad(`terminal-memory-soak tick=${tick}`, cols));
  for (let i = 0; i < rows - 1; i++) {
    const id = (tick * 7 + i * 19) % 100000;
    const payload = `${String(id).padStart(5, "0")} ${"x".repeat((i % 7) + 8)} ${(tick + i) % 997}`;
    lines.push(clipPad(payload, cols));
  }
  return lines;
}

export function buildTerminalFullUiLines(
  tick: number,
  params: TerminalWorkloadParams,
): readonly string[] {
  const rows = Math.max(12, numberParam(params.rows, 40));
  const cols = Math.max(80, numberParam(params.cols, 120));
  const services = Math.max(12, numberParam(params.services, 24));
  const widths = fullUiPaneWidths(cols);
  const modes = ["overview", "services", "deploy", "incidents"] as const;
  const mode = modes[tick % modes.length];
  const navItems = [
    "Dashboard",
    "Services",
    "Deployments",
    "Incidents",
    "Queues",
    "Logs",
    "Audit",
    "Settings",
  ] as const;

  const lines: string[] = [];
  lines.push(clipPad(`terminal-full-ui mode=${mode} tick=${tick}`, cols));
  lines.push(
    clipPad(
      `cluster=prod-us-east budget=16.6ms cpu=${35 + ((tick * 7) % 40)}% mem=${42 + ((tick * 11) % 49)}% qps=${900 + ((tick * 29) % 1500)}`,
      cols,
    ),
  );

  const bodyRows = Math.max(1, rows - 4);
  const activeNav = tick % navItems.length;
  const visibleTableRows = Math.max(6, Math.min(18, bodyRows - 6));
  const viewportOffset = tick % Math.max(1, services - visibleTableRows + 1);
  const activeSvc = tick % services;

  for (let r = 0; r < bodyRows; r++) {
    let left = "";
    let center = "";
    let right = "";

    if (r === 0) left = "NAV";
    else if (r <= navItems.length) {
      const idx = r - 1;
      left = `${idx === activeNav ? ">" : " "} ${navItems[idx]}`;
    } else if (r === navItems.length + 1) {
      left = `env=${["prod", "stage", "dev"][tick % 3]} region=${["use1", "usw2", "euw1"][tick % 3]}`;
    } else if (r === navItems.length + 2) {
      left = `focus=svc-${String(activeSvc).padStart(3, "0")} alerts=${(tick * 3) % 19}`;
    } else {
      left = `saved-view-${String((tick + r) % 12).padStart(2, "0")} ${spark(tick + r, 10)}`;
    }

    if (r === 0) center = "SERVICES";
    else if (r === 1) center = "id      state      lat   rps   err";
    else if (r >= 2 && r < 2 + visibleTableRows) {
      const svc = viewportOffset + (r - 2);
      const degraded = (tick + svc * 5) % 17 === 0;
      const lat = 12 + ((tick * 13 + svc * 7) % 180);
      const rps = 100 + ((tick * 19 + svc * 37) % 2500);
      const err = ((tick + svc * 11) % 70) / 10;
      center = `${svc === activeSvc ? ">" : " "} svc-${String(svc).padStart(3, "0")} ${degraded ? "degraded" : "healthy "} ${String(lat).padStart(3, " ")}ms ${String(rps).padStart(4, " ")} ${err.toFixed(1)}%`;
    } else if (r === 2 + visibleTableRows) {
      const cpu = ((tick * 17) % 1000) / 1000;
      center = `cpu ${bar(cpu, 20)} ${(cpu * 100).toFixed(1)}%  io ${(45 + ((tick * 23) % 50)).toString().padStart(2, " ")}%`;
    } else if (r === 3 + visibleTableRows) {
      const mem = ((tick * 31 + 211) % 1000) / 1000;
      center = `mem ${bar(mem, 20)} ${(mem * 100).toFixed(1)}%  gc ${(tick * 97) % 999}ms`;
    } else if (r === 4 + visibleTableRows) {
      center = `queue depth=${(tick * 7) % 180} retries=${(tick * 11) % 37} dropped=${(tick * 13) % 9}`;
    } else {
      center = `timeline ${spark(tick * 3 + r, Math.max(16, widths.center - 10))}`;
    }

    if (r === 0) right = "INSPECTOR";
    else if (r === 1)
      right = `service=svc-${String(activeSvc).padStart(3, "0")} owner=team-${activeSvc % 7}`;
    else if (r === 2) right = `slo p95<120ms  now=${45 + ((tick * 5 + activeSvc * 3) % 110)}ms`;
    else if (r === 3)
      right = `deploy=${(tick * 3 + activeSvc) % 2 === 0 ? "green" : "canary"} zone=az-${(activeSvc % 3) + 1}`;
    else {
      const seq = tick * bodyRows + r;
      const lvl = seq % 19 === 0 ? "ERROR" : seq % 11 === 0 ? "WARN " : "INFO ";
      right = `${lvl} t+${String(seq).padStart(5, "0")} op=${String((seq * 7) % 97).padStart(2, "0")} msg=event-${seq}`;
    }

    lines.push(paneLine(cols, widths, left, center, right));
  }

  lines.push(
    clipPad(
      `status=online conn=${1200 + ((tick * 17) % 800)} sync=${(tick * 29) % 9999} pending=${(tick * 5) % 48} diff=${(tick * 7) % 21}`,
      cols,
    ),
  );
  lines.push(
    clipPad(
      "hotkeys: [1]overview [2]services [3]deploy [4]incidents [/]filter [enter]open [q]quit",
      cols,
    ),
  );

  return lines.slice(0, rows);
}

export function buildTerminalFullUiNavigationLines(
  tick: number,
  params: TerminalWorkloadParams,
): readonly string[] {
  const rows = Math.max(12, numberParam(params.rows, 40));
  const cols = Math.max(80, numberParam(params.cols, 120));
  const services = Math.max(10, numberParam(params.services, 24));
  const dwell = Math.max(2, numberParam(params.dwell, 8));
  const pages = ["overview", "services", "deployments", "incidents", "logs", "command"] as const;
  const pageIndex = Math.floor(tick / dwell) % pages.length;
  const page = pages[pageIndex];
  const localTick = tick % dwell;

  const lines: string[] = [];
  lines.push(
    clipPad(
      `terminal-full-ui-navigation page=${page} tick=${tick} local=${localTick}/${dwell - 1}`,
      cols,
    ),
  );
  lines.push(
    clipPad(
      `tabs: ${pages.map((p, i) => `${i === pageIndex ? "[" : ""}${p}${i === pageIndex ? "]" : ""}`).join(" | ")}`,
      cols,
    ),
  );

  const bodyRows = Math.max(1, rows - 4);
  for (let i = 0; i < bodyRows; i++) {
    let line = "";

    if (page === "overview") {
      if (i === 0) line = "overview: global health + throughput + alerts";
      else if (i <= 8) {
        const svc = i - 1;
        const healthy = (tick + svc * 5) % 9 !== 0;
        const v = ((tick * 23 + svc * 41) % 1000) / 1000;
        line = `card svc-${String(svc).padStart(2, "0")} ${healthy ? "healthy " : "degraded"} ${bar(v, 24)} ${(v * 100).toFixed(1)}%`;
      } else if (i === 9)
        line = `alerts open=${(tick * 3) % 11} acked=${(tick * 7) % 17} muted=${(tick * 5) % 5}`;
      else line = `trend ${spark(tick + i * 3, Math.max(16, cols - 10))}`;
    } else if (page === "services") {
      if (i === 0) line = "services: inventory + selection + per-row telemetry";
      else if (i === 1) line = "id      state      lat   rps   err";
      else {
        const row = i - 2;
        const svc = (tick + row) % services;
        const selected = row === tick % Math.max(1, bodyRows - 2);
        const degraded = (tick + svc * 3) % 15 === 0;
        const lat = 10 + ((tick * 13 + svc * 9) % 220);
        const rps = 80 + ((tick * 17 + svc * 31) % 3000);
        const err = ((tick + svc * 7) % 80) / 10;
        line = `${selected ? ">" : " "} svc-${String(svc).padStart(3, "0")} ${degraded ? "degraded" : "healthy "} ${String(lat).padStart(3, " ")}ms ${String(rps).padStart(4, " ")} ${err.toFixed(1)}%`;
      }
    } else if (page === "deployments") {
      if (i === 0) line = "deployments: staged rollout + promotion gates";
      else {
        const step = i % 12;
        const pct = (tick * 7 + i * 9) % 101;
        const gate = (tick + step) % 5 === 0 ? "blocked" : "ready  ";
        line = `pipeline-${String(step).padStart(2, "0")} ${gate} ${bar(pct / 100, 18)} ${String(pct).padStart(3, " ")}% canary=${(tick + step) % 2 === 0 ? "on" : "off"}`;
      }
    } else if (page === "incidents") {
      if (i === 0) line = "incidents: queue + assignee + response status";
      else {
        const incident = tick * bodyRows + i;
        const sev = incident % 13 === 0 ? "sev1" : incident % 7 === 0 ? "sev2" : "sev3";
        const state =
          incident % 5 === 0 ? "mitigating" : incident % 3 === 0 ? "triaging  " : "open      ";
        line = `${sev} inc-${String(incident % 10000).padStart(4, "0")} ${state} owner=oncall-${incident % 9} age=${(incident * 3) % 180}m`;
      }
    } else if (page === "logs") {
      const seq = tick * bodyRows + i;
      const lvl = seq % 17 === 0 ? "ERROR" : seq % 9 === 0 ? "WARN " : "INFO ";
      line = `${lvl} trace=${String((seq * 19) % 100000).padStart(5, "0")} shard=${seq % 12} msg=stream-${seq}`;
    } else {
      if (i < 2) line = "command palette: type to filter actions";
      else if (i < 10) {
        const cmd = i - 2;
        const selected = cmd === tick % 8;
        line = `${selected ? ">" : " "} /command-${String(cmd).padStart(2, "0")} target=svc-${String((tick + cmd) % services).padStart(3, "0")} preview=${(tick + cmd) % 2 === 0 ? "safe" : "risky"}`;
      } else {
        line = `preview: ${spark(tick * 5 + i, Math.max(16, cols - 10))}`;
      }
    }

    lines.push(clipPad(line, cols));
  }

  lines.push(
    clipPad(
      `route=${page} navLatency=${1 + ((tick * 7) % 9)}ms commit=${(tick * 97) % 10000} pending=${(tick * 13) % 33}`,
      cols,
    ),
  );
  lines.push(
    clipPad(
      "flow: [tab]next-page [shift+tab]prev-page [enter]open [esc]close [/]command [ctrl+c]quit",
      cols,
    ),
  );
  return lines.slice(0, rows);
}

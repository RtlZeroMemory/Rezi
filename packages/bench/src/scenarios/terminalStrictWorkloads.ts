type WorkloadParam = number | string;
type StrictWorkloadParams = Readonly<{
  rows?: WorkloadParam;
  cols?: WorkloadParam;
  services?: WorkloadParam;
  dwell?: WorkloadParam;
}>;

export type StrictVariant = "dashboard" | "navigation";

export type StrictSections = Readonly<{
  rows: number;
  cols: number;
  header: string;
  leftTitle: string;
  leftLines: readonly string[];
  centerTitle: string;
  centerLines: readonly string[];
  rightTitle: string;
  rightLines: readonly string[];
  status: string;
  footer: string;
}>;

function clipPad(s: string, cols: number): string {
  if (s.length >= cols) return s.slice(0, cols);
  return `${s}${" ".repeat(cols - s.length)}`;
}

function bar(value: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

function spark(seed: number, width: number): string {
  let out = "";
  for (let i = 0; i < width; i++) out += (seed + i * 3) % 7 > 2 ? "#" : ".";
  return out;
}

function numberParam(value: WorkloadParam | undefined, fallback: number): number {
  return Number(value ?? fallback);
}

function strictRows(params: StrictWorkloadParams): number {
  return Math.max(16, numberParam(params.rows, 40));
}

function strictCols(params: StrictWorkloadParams): number {
  return Math.max(100, numberParam(params.cols, 120));
}

function strictServices(params: StrictWorkloadParams): number {
  return Math.max(12, numberParam(params.services, 24));
}

function strictDwell(params: StrictWorkloadParams): number {
  return Math.max(2, numberParam(params.dwell, 8));
}

function strictPages(): readonly string[] {
  return ["dashboard", "services", "deployments", "incidents", "logs", "commands"];
}

function navLines(page: string, tick: number): readonly string[] {
  const tabs = ["dashboard", "services", "deploy", "incidents", "logs", "settings"];
  const lines: string[] = [];
  const active = tabs.findIndex((t) => page.startsWith(t) || page === t);
  for (let i = 0; i < tabs.length; i++) {
    lines.push(`${i === active ? ">" : " "} ${tabs[i]}`);
  }
  lines.push(
    `env=${["prod", "stage", "dev"][tick % 3]} region=${["use1", "usw2", "euw1"][tick % 3]}`,
  );
  lines.push(`window=${15 + ((tick * 7) % 30)}m filter=${tick % 2 === 0 ? "on" : "off"}`);
  return lines;
}

function serviceTableLines(services: number, tick: number, rowBudget: number): readonly string[] {
  const lines: string[] = [];
  lines.push("id      state      lat   rps   err");
  const viewportRows = Math.max(4, rowBudget - 4);
  const offset = tick % Math.max(1, services - viewportRows + 1);
  const active = tick % services;
  for (let r = 0; r < viewportRows; r++) {
    const svc = offset + r;
    const degraded = (tick + svc * 5) % 17 === 0;
    const lat = 10 + ((tick * 13 + svc * 7) % 220);
    const rps = 80 + ((tick * 19 + svc * 37) % 3000);
    const err = ((tick + svc * 11) % 90) / 10;
    lines.push(
      `${svc === active ? ">" : " "} svc-${String(svc).padStart(3, "0")} ${degraded ? "degraded" : "healthy "} ${String(lat).padStart(3, " ")}ms ${String(rps).padStart(4, " ")} ${err.toFixed(1)}%`,
    );
  }

  const cpu = ((tick * 17) % 1000) / 1000;
  const mem = ((tick * 31 + 211) % 1000) / 1000;
  lines.push(
    `cpu ${bar(cpu, 18)} ${(cpu * 100).toFixed(1)}% io ${String(30 + ((tick * 11) % 60)).padStart(2, " ")}%`,
  );
  lines.push(`mem ${bar(mem, 18)} ${(mem * 100).toFixed(1)}% gc ${(tick * 97) % 999}ms`);
  lines.push(`queue=${(tick * 7) % 200} retry=${(tick * 11) % 40} drop=${(tick * 13) % 9}`);
  return lines;
}

function deploymentLines(tick: number, rowBudget: number): readonly string[] {
  const lines: string[] = [];
  lines.push("pipeline rollout and gate state");
  for (let i = 1; i < rowBudget; i++) {
    const step = i % 12;
    const pct = (tick * 7 + i * 9) % 101;
    const gate = (tick + step) % 5 === 0 ? "blocked" : "ready  ";
    const canary = (tick + step) % 2 === 0 ? "on" : "off";
    lines.push(
      `pipe-${String(step).padStart(2, "0")} ${gate} ${bar(pct / 100, 16)} ${String(pct).padStart(3, " ")}% canary=${canary}`,
    );
  }
  return lines;
}

function incidentLines(tick: number, rowBudget: number): readonly string[] {
  const lines: string[] = [];
  lines.push("incident queue and ownership");
  for (let i = 1; i < rowBudget; i++) {
    const seq = tick * rowBudget + i;
    const sev = seq % 13 === 0 ? "sev1" : seq % 7 === 0 ? "sev2" : "sev3";
    const state = seq % 5 === 0 ? "mitigating" : seq % 3 === 0 ? "triaging  " : "open      ";
    lines.push(
      `${sev} inc-${String(seq % 10000).padStart(4, "0")} ${state} owner=oncall-${seq % 9} age=${(seq * 3) % 180}m`,
    );
  }
  return lines;
}

function logLines(tick: number, rowBudget: number): readonly string[] {
  const lines: string[] = [];
  lines.push("streamed logs");
  for (let i = 1; i < rowBudget; i++) {
    const seq = tick * rowBudget + i;
    const lvl = seq % 17 === 0 ? "ERROR" : seq % 9 === 0 ? "WARN " : "INFO ";
    lines.push(
      `${lvl} trace=${String((seq * 19) % 100000).padStart(5, "0")} shard=${seq % 12} msg=event-${seq}`,
    );
  }
  return lines;
}

function commandLines(services: number, tick: number, rowBudget: number): readonly string[] {
  const lines: string[] = [];
  lines.push("command palette actions");
  for (let i = 1; i < rowBudget; i++) {
    const cmd = i - 1;
    const selected = cmd === tick % Math.max(1, rowBudget - 1);
    const preview = (tick + cmd) % 2 === 0 ? "safe" : "risky";
    lines.push(
      `${selected ? ">" : " "} /command-${String(cmd).padStart(2, "0")} target=svc-${String((tick + cmd) % services).padStart(3, "0")} preview=${preview}`,
    );
  }
  return lines;
}

function rightPanelLines(page: string, tick: number, rowBudget: number): readonly string[] {
  const lines: string[] = [];
  lines.push(`page=${page} focus=svc-${String((tick * 3) % 24).padStart(3, "0")}`);
  lines.push(`slo p95<120ms now=${40 + ((tick * 5) % 120)}ms`);
  lines.push(`deploy=${tick % 2 === 0 ? "green" : "canary"} zone=az-${(tick % 3) + 1}`);
  for (let i = 3; i < rowBudget; i++) {
    const seq = tick * rowBudget + i;
    const lvl = seq % 19 === 0 ? "ERROR" : seq % 11 === 0 ? "WARN " : "INFO ";
    lines.push(
      `${lvl} t+${String(seq).padStart(5, "0")} op=${String((seq * 7) % 97).padStart(2, "0")} note=${spark(seq, 10)}`,
    );
  }
  return lines;
}

function fitLines(lines: readonly string[], target: number): readonly string[] {
  if (target <= 0) return [];
  if (lines.length >= target) return lines.slice(0, target);
  return [...lines, ...Array.from({ length: target - lines.length }, () => "")];
}

function buildDashboardSections(tick: number, params: StrictWorkloadParams): StrictSections {
  const rows = strictRows(params);
  const cols = strictCols(params);
  const services = strictServices(params);
  const bodyRows = Math.max(4, rows - 5);
  const leftRows = bodyRows - 1;
  const centerRows = bodyRows - 1;
  const rightRows = bodyRows - 1;
  const page = "dashboard";

  return {
    rows,
    cols,
    header: `terminal-strict-ui page=${page} tick=${tick} cpu=${35 + ((tick * 7) % 40)}% mem=${42 + ((tick * 11) % 49)}% qps=${900 + ((tick * 29) % 1500)}`,
    leftTitle: "NAV",
    leftLines: fitLines(navLines(page, tick), leftRows),
    centerTitle: "SERVICES",
    centerLines: fitLines(serviceTableLines(services, tick, centerRows), centerRows),
    rightTitle: "INSPECTOR",
    rightLines: fitLines(rightPanelLines(page, tick, rightRows), rightRows),
    status: `status=online conn=${1200 + ((tick * 17) % 800)} sync=${(tick * 29) % 9999} pending=${(tick * 5) % 48}`,
    footer: "keys: [tab] move  [enter] open  [/] command  [q] quit",
  };
}

function buildNavigationSections(tick: number, params: StrictWorkloadParams): StrictSections {
  const rows = strictRows(params);
  const cols = strictCols(params);
  const services = strictServices(params);
  const dwell = strictDwell(params);
  const pages = strictPages();
  const page = pages[Math.floor(tick / dwell) % pages.length] ?? "dashboard";
  const bodyRows = Math.max(4, rows - 5);
  const leftRows = bodyRows - 1;
  const centerRows = bodyRows - 1;
  const rightRows = bodyRows - 1;

  let centerLines: readonly string[] = [];
  if (page === "dashboard") {
    centerLines = serviceTableLines(services, tick, centerRows);
  } else if (page === "services") {
    centerLines = serviceTableLines(services, tick, centerRows);
  } else if (page === "deployments") {
    centerLines = deploymentLines(tick, centerRows);
  } else if (page === "incidents") {
    centerLines = incidentLines(tick, centerRows);
  } else if (page === "logs") {
    centerLines = logLines(tick, centerRows);
  } else {
    centerLines = commandLines(services, tick, centerRows);
  }

  return {
    rows,
    cols,
    header: `terminal-strict-ui-navigation page=${page} tick=${tick} local=${tick % dwell}/${dwell - 1}`,
    leftTitle: "NAVIGATION",
    leftLines: fitLines(navLines(page, tick), leftRows),
    centerTitle: page.toUpperCase(),
    centerLines: fitLines(centerLines, centerRows),
    rightTitle: "DETAILS",
    rightLines: fitLines(rightPanelLines(page, tick, rightRows), rightRows),
    status: `route=${page} navLatency=${1 + ((tick * 7) % 9)}ms commit=${(tick * 97) % 10000} pending=${(tick * 13) % 33}`,
    footer: "flow: [tab] next-page  [shift+tab] prev-page  [enter] open  [esc] close",
  };
}

export function buildStrictSections(
  tick: number,
  params: StrictWorkloadParams,
  variant: StrictVariant,
): StrictSections {
  return variant === "navigation"
    ? buildNavigationSections(tick, params)
    : buildDashboardSections(tick, params);
}

function strictPaneWidths(cols: number): Readonly<{ left: number; center: number; right: number }> {
  const left = 24;
  const right = 32;
  const center = Math.max(28, cols - left - right - 6);
  return { left, center, right };
}

function paneLine(
  cols: number,
  widths: Readonly<{ left: number; center: number; right: number }>,
  left: string,
  center: string,
  right: string,
): string {
  return clipPad(
    `${clipPad(left, widths.left)} | ${clipPad(center, widths.center)} | ${clipPad(right, widths.right)}`,
    cols,
  );
}

export function buildStrictPaneLines(
  tick: number,
  params: StrictWorkloadParams,
  variant: StrictVariant,
): readonly string[] {
  const sections = buildStrictSections(tick, params, variant);
  const rows = sections.rows;
  const cols = sections.cols;
  const widths = strictPaneWidths(cols);
  const bodyRows = Math.max(1, rows - 4);
  const lines: string[] = [];

  lines.push(clipPad(sections.header, cols));
  lines.push(paneLine(cols, widths, sections.leftTitle, sections.centerTitle, sections.rightTitle));

  for (let i = 0; i < bodyRows; i++) {
    lines.push(
      paneLine(
        cols,
        widths,
        sections.leftLines[i] ?? "",
        sections.centerLines[i] ?? "",
        sections.rightLines[i] ?? "",
      ),
    );
  }

  lines.push(clipPad(sections.status, cols));
  lines.push(clipPad(sections.footer, cols));
  return lines.slice(0, rows);
}

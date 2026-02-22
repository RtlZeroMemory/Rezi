use std::fs;
use std::io::{self, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use ratatui::backend::{CrosstermBackend, TestBackend};
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Text};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Terminal;
use serde::Serialize;

#[derive(Clone)]
struct ByteCounter(Arc<AtomicU64>);

impl ByteCounter {
    fn new() -> Self {
        Self(Arc::new(AtomicU64::new(0)))
    }
    fn add(&self, n: usize) {
        self.0.fetch_add(n as u64, Ordering::Relaxed);
    }
    fn get(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

struct CountingWriter<W: Write> {
    inner: W,
    counter: ByteCounter,
}

impl<W: Write> CountingWriter<W> {
    fn new(inner: W, counter: ByteCounter) -> Self {
        Self { inner, counter }
    }
}

impl<W: Write> Write for CountingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.counter.add(n);
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultData {
    samples_ms: Vec<f64>,
    total_wall_ms: f64,
    cpu_user_ms: f64,
    cpu_sys_ms: f64,
    rss_before_kb: u64,
    rss_after_kb: u64,
    rss_peak_kb: u64,
    bytes_written: u64,
    frames: u64,
}

#[derive(Serialize)]
#[serde(untagged)]
enum ResultFile {
    Ok { ok: bool, data: ResultData },
    Err { ok: bool, error: String },
}

fn now_rusage() -> libc::rusage {
    let mut ru: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe {
        libc::getrusage(libc::RUSAGE_SELF, &mut ru as *mut libc::rusage);
    }
    ru
}

fn tv_to_ms(tv: libc::timeval) -> f64 {
    (tv.tv_sec as f64) * 1000.0 + (tv.tv_usec as f64) / 1000.0
}

fn cpu_ms_delta(before: libc::rusage, after: libc::rusage) -> (f64, f64) {
    let u = tv_to_ms(after.ru_utime) - tv_to_ms(before.ru_utime);
    let s = tv_to_ms(after.ru_stime) - tv_to_ms(before.ru_stime);
    (u, s)
}

fn page_size_kb() -> u64 {
    let ps = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    if ps <= 0 {
        4
    } else {
        (ps as u64) / 1024
    }
}

fn rss_current_kb_linux() -> Option<u64> {
    let statm = fs::read_to_string("/proc/self/statm").ok()?;
    let mut it = statm.split_whitespace();
    let _size_pages = it.next()?;
    let rss_pages = it.next()?;
    let rss_pages: u64 = rss_pages.parse().ok()?;
    Some(rss_pages * page_size_kb())
}

fn rss_current_kb() -> u64 {
    if cfg!(target_os = "linux") {
        rss_current_kb_linux().unwrap_or(0)
    } else {
        0
    }
}

fn rss_peak_kb_from_rusage(ru: libc::rusage) -> u64 {
    // ru_maxrss units:
    // - Linux: KB
    // - macOS: bytes
    #[cfg(target_os = "macos")]
    {
        (ru.ru_maxrss as u64) / 1024
    }
    #[cfg(not(target_os = "macos"))]
    {
        ru.ru_maxrss as u64
    }
}

fn parse_args() -> Result<std::collections::HashMap<String, String>, String> {
    let mut out = std::collections::HashMap::new();
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if !a.starts_with("--") {
            return Err(format!("unexpected arg: {a}"));
        }
        let key = a.trim_start_matches("--").to_string();
        let val = args
            .next()
            .ok_or_else(|| format!("missing value for --{key}"))?;
        out.insert(key, val);
    }
    Ok(out)
}

fn get_u64(m: &std::collections::HashMap<String, String>, k: &str) -> Result<u64, String> {
    m.get(k)
        .ok_or_else(|| format!("missing --{k}"))?
        .parse::<u64>()
        .map_err(|_| format!("invalid --{k}"))
}

fn get_str<'a>(
    m: &'a std::collections::HashMap<String, String>,
    k: &str,
) -> Result<&'a str, String> {
    m.get(k)
        .map(|s| s.as_str())
        .ok_or_else(|| format!("missing --{k}"))
}

fn frame_fill_lines(rows: u64, cols: u64, dirty_lines: u64, tick: u64) -> Vec<String> {
    let mut out = Vec::with_capacity(rows as usize);
    for r in 0..rows {
        let s = if r < dirty_lines {
            let v = (tick.wrapping_mul(1_103_515_245) ^ r.wrapping_mul(12_345)) as u32;
            format!("row={:02} tick={} v={:08x}", r, tick, v)
        } else {
            format!("row={:02} static", r)
        };
        if s.len() >= cols as usize {
            out.push(s[..cols as usize].to_string());
        } else {
            out.push(format!("{s: <width$}", width = cols as usize));
        }
    }
    out
}

fn virtual_list_lines(items: u64, viewport: u64, tick: u64) -> Vec<String> {
    let offset = tick % (items - viewport);
    let active = tick % viewport;
    let mut out = Vec::with_capacity((viewport + 2) as usize);
    out.push("terminal-virtual-list".to_string());
    out.push(format!(
        "total={items} viewport={viewport} offset={offset} tick={tick}"
    ));
    for r in 0..viewport {
        let i = offset + r;
        let v = (tick + i * 97) % 1000;
        let mark = if r == active { " <" } else { "" };
        out.push(format!("{:>6} • Item {} v={v}{mark}", i, i));
    }
    out
}

fn table_lines(rows: u64, cols: u64, tick: u64) -> Vec<String> {
    let hot_row = tick % rows;
    let hot_col = tick % cols;
    let mut out = Vec::with_capacity((rows + 2) as usize);
    let mut header = String::new();
    for c in 0..cols {
        header.push_str(&format!("{: <10}", format!("C{c}")));
    }
    header.truncate(120);
    out.push(header.clone());
    out.push("-".repeat(header.len().min(120)));
    for r in 0..rows {
        let mut line = String::new();
        for c in 0..cols {
            let v = if r == hot_row && c == hot_col {
                format!("v={tick}")
            } else {
                format!("r{r}c{c}")
            };
            line.push_str(&format!("{: <10}", v));
        }
        line.truncate(120);
        out.push(line);
    }
    out
}

fn clip_pad(s: String, cols: usize) -> String {
    if s.len() >= cols {
        s[..cols].to_string()
    } else {
        format!("{s: <width$}", width = cols)
    }
}

fn bar(value: f64, width: usize) -> String {
    let filled = (value * (width as f64)).round() as isize;
    let filled = filled.clamp(0, width as isize) as usize;
    format!("{}{}", "#".repeat(filled), "-".repeat(width - filled))
}

fn screen_transition_lines(rows: u64, cols: u64, tick: u64) -> Vec<String> {
    let rows = rows as usize;
    let cols = cols as usize;
    let mode = tick % 3;
    let mut out = Vec::with_capacity(rows);

    if mode == 0 {
        out.push(clip_pad(
            "terminal-screen-transition [dashboard]".to_string(),
            cols,
        ));
        for i in 0..rows.saturating_sub(1) {
            let v = (((tick as usize) * 37 + i * 97) % 1000) as f64 / 1000.0;
            out.push(clip_pad(
                format!("svc-{i:02} {} {:.1}%", bar(v, 24), v * 100.0),
                cols,
            ));
        }
        return out;
    }

    if mode == 1 {
        out.push(clip_pad(
            "terminal-screen-transition [table]".to_string(),
            cols,
        ));
        out.push(clip_pad(
            "ID        NAME                 STATE     LAT(ms)   ERR".to_string(),
            cols,
        ));
        for i in 0..rows.saturating_sub(2) {
            let id = format!("node-{:03}", ((tick as usize) + i) % 512);
            let state = if ((tick as usize) + i) % 7 == 0 {
                "degraded"
            } else {
                "healthy "
            };
            let lat = 10 + (((tick as usize) * 13 + i * 7) % 190);
            let err = if ((tick as usize) + i * 3) % 53 == 0 {
                "yes"
            } else {
                "no "
            };
            out.push(clip_pad(
                format!("{id}   backend-{i:02}        {state}     {lat:>3}      {err}"),
                cols,
            ));
        }
        return out;
    }

    out.push(clip_pad(
        "terminal-screen-transition [logs]".to_string(),
        cols,
    ));
    for i in 0..rows.saturating_sub(1) {
        let seq = (tick as usize) * rows + i;
        let lvl = if seq % 11 == 0 {
            "WARN"
        } else if seq % 23 == 0 {
            "ERROR"
        } else {
            "INFO "
        };
        out.push(clip_pad(
            format!(
                "{lvl} ts={} service={} msg=transition-{seq}",
                1_700_000_000_000u64 + seq as u64 * 17,
                seq % 17
            ),
            cols,
        ));
    }
    out
}

fn fps_stream_lines(rows: u64, cols: u64, channels: u64, tick: u64) -> Vec<String> {
    let rows = rows as usize;
    let cols = cols as usize;
    let channels = channels.max(1) as usize;
    let mut out = Vec::with_capacity(rows);

    out.push(clip_pad(
        format!("terminal-fps-stream tick={tick} target=60fps channels={channels}"),
        cols,
    ));
    out.push(clip_pad("Channel  Value      Trend".to_string(), cols));

    let body_rows = rows.saturating_sub(2).max(1);
    for i in 0..body_rows {
        let ch = i % channels;
        let v = (((tick as usize) * (17 + ch) + i * 31) % 1000) as f64 / 1000.0;
        let trend_seed = ((tick as usize) + i * 13 + ch * 11) % 16;
        let mut trend = String::with_capacity(16 * 3);
        for j in 0..16 {
            let level = ((trend_seed + j * 3) % 16) as f64 / 15.0;
            if level < v {
                trend.push('▮');
            } else {
                trend.push('▯');
            }
        }
        out.push(clip_pad(
            format!("ch-{ch:02}    {:>6.2}%    {trend}", v * 100.0),
            cols,
        ));
    }

    out
}

fn input_latency_lines(rows: u64, cols: u64, tick: u64) -> Vec<String> {
    let rows = rows as usize;
    let cols = cols as usize;
    let mut out = Vec::with_capacity(rows);
    out.push(clip_pad(
        "terminal-input-latency synthetic-key-event -> frame".to_string(),
        cols,
    ));
    out.push(clip_pad(
        format!(
            "tick={tick} active={} token={:x}",
            tick % 16,
            ((tick as u32).wrapping_mul(1_103_515_245))
        ),
        cols,
    ));
    let body_rows = rows.saturating_sub(2);
    for i in 0..body_rows {
        let active = i == (tick as usize) % body_rows.max(1);
        out.push(clip_pad(
            format!(
                "{} command-{i:02}  value={}",
                if active { ">" } else { " " },
                ((tick as usize) + i * 9) % 10_000
            ),
            cols,
        ));
    }
    out
}

fn memory_soak_lines(rows: u64, cols: u64, tick: u64) -> Vec<String> {
    let rows = rows as usize;
    let cols = cols as usize;
    let mut out = Vec::with_capacity(rows);
    out.push(clip_pad(format!("terminal-memory-soak tick={tick}"), cols));
    for i in 0..rows.saturating_sub(1) {
        let id = ((tick as usize) * 7 + i * 19) % 100_000;
        let payload = format!(
            "{id:05} {} {}",
            "x".repeat((i % 7) + 8),
            ((tick as usize) + i) % 997
        );
        out.push(clip_pad(payload, cols));
    }
    out
}

fn full_ui_pane_widths(cols: usize) -> (usize, usize, usize) {
    let left = 22usize.max(((cols as f64) * 0.24).floor() as usize);
    let right = 24usize.max(((cols as f64) * 0.28).floor() as usize);
    let center = 24usize.max(cols.saturating_sub(left + right + 6));
    (left, center, right)
}

fn pane_line(
    cols: usize,
    left_w: usize,
    center_w: usize,
    right_w: usize,
    left: &str,
    center: &str,
    right: &str,
) -> String {
    clip_pad(
        format!(
            "{} │ {} │ {}",
            clip_pad(left.to_string(), left_w),
            clip_pad(center.to_string(), center_w),
            clip_pad(right.to_string(), right_w)
        ),
        cols,
    )
}

fn spark(seed: u64, width: usize) -> String {
    let mut out = String::with_capacity(width);
    for i in 0..width {
        if (((seed as usize) + i * 3) % 7) > 2 {
            out.push('#');
        } else {
            out.push('.');
        }
    }
    out
}

fn full_ui_lines(rows: u64, cols: u64, services: u64, tick: u64) -> Vec<String> {
    let rows = (rows as usize).max(12);
    let cols = (cols as usize).max(80);
    let services = (services as usize).max(12);
    let (left_w, center_w, right_w) = full_ui_pane_widths(cols);

    let modes = ["overview", "services", "deploy", "incidents"];
    let mode = modes[(tick as usize) % modes.len()];
    let nav_items = [
        "Dashboard",
        "Services",
        "Deployments",
        "Incidents",
        "Queues",
        "Logs",
        "Audit",
        "Settings",
    ];

    let mut lines = Vec::with_capacity(rows);
    lines.push(clip_pad(
        format!("terminal-full-ui mode={mode} tick={tick}"),
        cols,
    ));
    lines.push(clip_pad(
        format!(
            "cluster=prod-us-east budget=16.6ms cpu={}% mem={}% qps={}",
            35 + ((tick as usize * 7) % 40),
            42 + ((tick as usize * 11) % 49),
            900 + ((tick as usize * 29) % 1500)
        ),
        cols,
    ));

    let body_rows = rows.saturating_sub(4).max(1);
    let active_nav = (tick as usize) % nav_items.len();
    let visible_table_rows = body_rows.saturating_sub(6).min(18).max(6);
    let viewport_den = services
        .saturating_sub(visible_table_rows)
        .saturating_add(1)
        .max(1);
    let viewport_offset = (tick as usize) % viewport_den;
    let active_svc = (tick as usize) % services;

    for r in 0..body_rows {
        let left = if r == 0 {
            "NAV".to_string()
        } else if r <= nav_items.len() {
            let idx = r - 1;
            format!(
                "{} {}",
                if idx == active_nav { ">" } else { " " },
                nav_items[idx]
            )
        } else if r == nav_items.len() + 1 {
            let envs = ["prod", "stage", "dev"];
            let regions = ["use1", "usw2", "euw1"];
            format!(
                "env={} region={}",
                envs[(tick as usize) % envs.len()],
                regions[(tick as usize) % regions.len()]
            )
        } else if r == nav_items.len() + 2 {
            format!(
                "focus=svc-{active_svc:03} alerts={}",
                ((tick as usize) * 3) % 19
            )
        } else {
            format!(
                "saved-view-{:02} {}",
                ((tick as usize) + r) % 12,
                spark(tick + r as u64, 10)
            )
        };

        let center = if r == 0 {
            "SERVICES".to_string()
        } else if r == 1 {
            "id      state      lat   rps   err".to_string()
        } else if r >= 2 && r < 2 + visible_table_rows {
            let svc = (viewport_offset + (r - 2)) % services;
            let degraded = ((tick as usize) + svc * 5) % 17 == 0;
            let lat = 12 + (((tick as usize) * 13 + svc * 7) % 180);
            let rps = 100 + (((tick as usize) * 19 + svc * 37) % 2500);
            let err = (((tick as usize) + svc * 11) % 70) as f64 / 10.0;
            format!(
                "{} svc-{svc:03} {} {lat:>3}ms {rps:>4} {err:.1}%",
                if svc == active_svc { ">" } else { " " },
                if degraded { "degraded" } else { "healthy " }
            )
        } else if r == 2 + visible_table_rows {
            let cpu = (((tick as usize) * 17) % 1000) as f64 / 1000.0;
            format!(
                "cpu {} {:.1}%  io {:>2}%",
                bar(cpu, 20),
                cpu * 100.0,
                45 + (((tick as usize) * 23) % 50)
            )
        } else if r == 3 + visible_table_rows {
            let mem = (((tick as usize) * 31 + 211) % 1000) as f64 / 1000.0;
            format!(
                "mem {} {:.1}%  gc {}ms",
                bar(mem, 20),
                mem * 100.0,
                ((tick as usize) * 97) % 999
            )
        } else if r == 4 + visible_table_rows {
            format!(
                "queue depth={} retries={} dropped={}",
                ((tick as usize) * 7) % 180,
                ((tick as usize) * 11) % 37,
                ((tick as usize) * 13) % 9
            )
        } else {
            format!(
                "timeline {}",
                spark(tick * 3 + r as u64, center_w.saturating_sub(10).max(16))
            )
        };

        let right = if r == 0 {
            "INSPECTOR".to_string()
        } else if r == 1 {
            format!("service=svc-{active_svc:03} owner=team-{}", active_svc % 7)
        } else if r == 2 {
            format!(
                "slo p95<120ms  now={}ms",
                45 + (((tick as usize) * 5 + active_svc * 3) % 110)
            )
        } else if r == 3 {
            format!(
                "deploy={} zone=az-{}",
                if (((tick as usize) * 3 + active_svc) % 2) == 0 {
                    "green"
                } else {
                    "canary"
                },
                (active_svc % 3) + 1
            )
        } else {
            let seq = (tick as usize) * body_rows + r;
            let level = if seq % 19 == 0 {
                "ERROR"
            } else if seq % 11 == 0 {
                "WARN "
            } else {
                "INFO "
            };
            format!(
                "{level} t+{seq:05} op={:02} msg=event-{seq}",
                (seq * 7) % 97
            )
        };

        lines.push(pane_line(
            cols, left_w, center_w, right_w, &left, &center, &right,
        ));
    }

    lines.push(clip_pad(
        format!(
            "status=online conn={} sync={} pending={} diff={}",
            1200 + (((tick as usize) * 17) % 800),
            ((tick as usize) * 29) % 9999,
            ((tick as usize) * 5) % 48,
            ((tick as usize) * 7) % 21
        ),
        cols,
    ));
    lines.push(clip_pad(
        "hotkeys: [1]overview [2]services [3]deploy [4]incidents [/]filter [enter]open [q]quit"
            .to_string(),
        cols,
    ));

    lines.truncate(rows);
    lines
}

fn full_ui_navigation_lines(
    rows: u64,
    cols: u64,
    services: u64,
    dwell: u64,
    tick: u64,
) -> Vec<String> {
    let rows = (rows as usize).max(12);
    let cols = (cols as usize).max(80);
    let services = (services as usize).max(10);
    let dwell = (dwell as usize).max(2);
    let pages = [
        "overview",
        "services",
        "deployments",
        "incidents",
        "logs",
        "command",
    ];
    let page_index = ((tick as usize) / dwell) % pages.len();
    let page = pages[page_index];
    let local_tick = (tick as usize) % dwell;

    let mut lines = Vec::with_capacity(rows);
    lines.push(clip_pad(
        format!(
            "terminal-full-ui-navigation page={page} tick={tick} local={local_tick}/{}",
            dwell - 1
        ),
        cols,
    ));
    let tabs = pages
        .iter()
        .enumerate()
        .map(|(i, p)| {
            if i == page_index {
                format!("[{p}]")
            } else {
                (*p).to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" | ");
    lines.push(clip_pad(format!("tabs: {tabs}"), cols));

    let body_rows = rows.saturating_sub(4).max(1);
    for i in 0..body_rows {
        let line = match page {
            "overview" => {
                if i == 0 {
                    "overview: global health + throughput + alerts".to_string()
                } else if i <= 8 {
                    let svc = i - 1;
                    let healthy = ((tick as usize) + svc * 5) % 9 != 0;
                    let v = (((tick as usize) * 23 + svc * 41) % 1000) as f64 / 1000.0;
                    format!(
                        "card svc-{svc:02} {} {} {:.1}%",
                        if healthy { "healthy " } else { "degraded" },
                        bar(v, 24),
                        v * 100.0
                    )
                } else if i == 9 {
                    format!(
                        "alerts open={} acked={} muted={}",
                        ((tick as usize) * 3) % 11,
                        ((tick as usize) * 7) % 17,
                        ((tick as usize) * 5) % 5
                    )
                } else {
                    format!(
                        "trend {}",
                        spark(tick + (i as u64) * 3, cols.saturating_sub(10).max(16))
                    )
                }
            }
            "services" => {
                if i == 0 {
                    "services: inventory + selection + per-row telemetry".to_string()
                } else if i == 1 {
                    "id      state      lat   rps   err".to_string()
                } else {
                    let row = i - 2;
                    let svc = ((tick as usize) + row) % services;
                    let selected = row == ((tick as usize) % body_rows.saturating_sub(2).max(1));
                    let degraded = ((tick as usize) + svc * 3) % 15 == 0;
                    let lat = 10 + (((tick as usize) * 13 + svc * 9) % 220);
                    let rps = 80 + (((tick as usize) * 17 + svc * 31) % 3000);
                    let err = (((tick as usize) + svc * 7) % 80) as f64 / 10.0;
                    format!(
                        "{} svc-{svc:03} {} {lat:>3}ms {rps:>4} {err:.1}%",
                        if selected { ">" } else { " " },
                        if degraded { "degraded" } else { "healthy " }
                    )
                }
            }
            "deployments" => {
                if i == 0 {
                    "deployments: staged rollout + promotion gates".to_string()
                } else {
                    let step = i % 12;
                    let pct = (((tick as usize) * 7 + i * 9) % 101) as usize;
                    let gate = if ((tick as usize) + step) % 5 == 0 {
                        "blocked"
                    } else {
                        "ready  "
                    };
                    let canary = if ((tick as usize) + step) % 2 == 0 {
                        "on"
                    } else {
                        "off"
                    };
                    format!(
                        "pipeline-{step:02} {gate} {} {pct:>3}% canary={canary}",
                        bar((pct as f64) / 100.0, 18)
                    )
                }
            }
            "incidents" => {
                if i == 0 {
                    "incidents: queue + assignee + response status".to_string()
                } else {
                    let incident = (tick as usize) * body_rows + i;
                    let sev = if incident % 13 == 0 {
                        "sev1"
                    } else if incident % 7 == 0 {
                        "sev2"
                    } else {
                        "sev3"
                    };
                    let state = if incident % 5 == 0 {
                        "mitigating"
                    } else if incident % 3 == 0 {
                        "triaging  "
                    } else {
                        "open      "
                    };
                    format!(
                        "{sev} inc-{:04} {state} owner=oncall-{} age={}m",
                        incident % 10000,
                        incident % 9,
                        (incident * 3) % 180
                    )
                }
            }
            "logs" => {
                let seq = (tick as usize) * body_rows + i;
                let level = if seq % 17 == 0 {
                    "ERROR"
                } else if seq % 9 == 0 {
                    "WARN "
                } else {
                    "INFO "
                };
                format!(
                    "{level} trace={:05} shard={} msg=stream-{seq}",
                    (seq * 19) % 100000,
                    seq % 12
                )
            }
            _ => {
                if i < 2 {
                    "command palette: type to filter actions".to_string()
                } else if i < 10 {
                    let cmd = i - 2;
                    let selected = cmd == (tick as usize) % 8;
                    let preview = if ((tick as usize) + cmd) % 2 == 0 {
                        "safe"
                    } else {
                        "risky"
                    };
                    format!(
                        "{} /command-{cmd:02} target=svc-{:03} preview={preview}",
                        if selected { ">" } else { " " },
                        ((tick as usize) + cmd) % services
                    )
                } else {
                    format!(
                        "preview: {}",
                        spark(tick * 5 + i as u64, cols.saturating_sub(10).max(16))
                    )
                }
            }
        };

        lines.push(clip_pad(line, cols));
    }

    lines.push(clip_pad(
        format!(
            "route={page} navLatency={}ms commit={} pending={}",
            1 + (((tick as usize) * 7) % 9),
            ((tick as usize) * 97) % 10000,
            ((tick as usize) * 13) % 33
        ),
        cols,
    ));
    lines.push(clip_pad(
        "flow: [tab]next-page [shift+tab]prev-page [enter]open [esc]close [/]command [ctrl+c]quit"
            .to_string(),
        cols,
    ));

    lines.truncate(rows);
    lines
}

fn to_text(lines: Vec<String>) -> Text<'static> {
    let v: Vec<Line<'static>> = lines.into_iter().map(|s| Line::from(s)).collect();
    Text::from(v)
}

#[derive(Clone)]
struct StrictSections {
    header: String,
    left_title: String,
    left_lines: Vec<String>,
    center_title: String,
    center_lines: Vec<String>,
    right_title: String,
    right_lines: Vec<String>,
    status: String,
    footer: String,
}

fn strict_pages() -> [&'static str; 6] {
    [
        "dashboard",
        "services",
        "deployments",
        "incidents",
        "logs",
        "commands",
    ]
}

fn strict_nav_lines(page: &str, tick: u64) -> Vec<String> {
    let tabs = [
        "dashboard",
        "services",
        "deploy",
        "incidents",
        "logs",
        "settings",
    ];
    let mut active = 0usize;
    for (i, tab) in tabs.iter().enumerate() {
        if page.starts_with(tab) || page == *tab {
            active = i;
            break;
        }
    }

    let mut lines = Vec::with_capacity(tabs.len() + 2);
    for (i, tab) in tabs.iter().enumerate() {
        lines.push(format!("{} {tab}", if i == active { ">" } else { " " }));
    }
    lines.push(format!(
        "env={} region={}",
        ["prod", "stage", "dev"][(tick as usize) % 3],
        ["use1", "usw2", "euw1"][(tick as usize) % 3]
    ));
    lines.push(format!(
        "window={}m filter={}",
        15 + ((tick as usize * 7) % 30),
        if (tick as usize).is_multiple_of(2) {
            "on"
        } else {
            "off"
        }
    ));
    lines
}

fn strict_service_lines(services: usize, tick: u64, row_budget: usize) -> Vec<String> {
    let mut lines = vec!["id      state      lat   rps   err".to_string()];
    let viewport_rows = row_budget.saturating_sub(4).max(4);
    let offset = (tick as usize)
        % services
            .saturating_sub(viewport_rows)
            .saturating_add(1)
            .max(1);
    let active = (tick as usize) % services.max(1);

    for r in 0..viewport_rows {
        let svc = offset + r;
        let degraded = ((tick as usize) + svc * 5).is_multiple_of(17);
        let lat = 10 + (((tick as usize) * 13 + svc * 7) % 220);
        let rps = 80 + (((tick as usize) * 19 + svc * 37) % 3000);
        let err = (((tick as usize) + svc * 11) % 90) as f64 / 10.0;
        lines.push(format!(
            "{} svc-{svc:03} {} {lat:>3}ms {rps:>4} {err:.1}%",
            if svc == active { ">" } else { " " },
            if degraded { "degraded" } else { "healthy " }
        ));
    }

    let cpu = (((tick as usize) * 17) % 1000) as f64 / 1000.0;
    let mem = (((tick as usize) * 31 + 211) % 1000) as f64 / 1000.0;
    lines.push(format!(
        "cpu {} {:.1}% io {:>2}%",
        bar(cpu, 18),
        cpu * 100.0,
        30 + (((tick as usize) * 11) % 60)
    ));
    lines.push(format!(
        "mem {} {:.1}% gc {}ms",
        bar(mem, 18),
        mem * 100.0,
        ((tick as usize) * 97) % 999
    ));
    lines.push(format!(
        "queue={} retry={} drop={}",
        ((tick as usize) * 7) % 200,
        ((tick as usize) * 11) % 40,
        ((tick as usize) * 13) % 9
    ));
    lines
}

fn strict_deployment_lines(tick: u64, row_budget: usize) -> Vec<String> {
    let mut lines = vec!["pipeline rollout and gate state".to_string()];
    for i in 1..row_budget {
        let step = i % 12;
        let pct = (((tick as usize) * 7 + i * 9) % 101) as f64;
        let gate = if ((tick as usize) + step).is_multiple_of(5) {
            "blocked"
        } else {
            "ready  "
        };
        let canary = if ((tick as usize) + step).is_multiple_of(2) {
            "on"
        } else {
            "off"
        };
        lines.push(format!(
            "pipe-{step:02} {gate} {} {:>3}% canary={canary}",
            bar(pct / 100.0, 16),
            pct as usize
        ));
    }
    lines
}

fn strict_incident_lines(tick: u64, row_budget: usize) -> Vec<String> {
    let mut lines = vec!["incident queue and ownership".to_string()];
    for i in 1..row_budget {
        let seq = (tick as usize) * row_budget + i;
        let sev = if seq.is_multiple_of(13) {
            "sev1"
        } else if seq.is_multiple_of(7) {
            "sev2"
        } else {
            "sev3"
        };
        let state = if seq.is_multiple_of(5) {
            "mitigating"
        } else if seq.is_multiple_of(3) {
            "triaging  "
        } else {
            "open      "
        };
        lines.push(format!(
            "{sev} inc-{:04} {state} owner=oncall-{} age={}m",
            seq % 10000,
            seq % 9,
            (seq * 3) % 180
        ));
    }
    lines
}

fn strict_log_lines(tick: u64, row_budget: usize) -> Vec<String> {
    let mut lines = vec!["streamed logs".to_string()];
    for i in 1..row_budget {
        let seq = (tick as usize) * row_budget + i;
        let lvl = if seq.is_multiple_of(17) {
            "ERROR"
        } else if seq.is_multiple_of(9) {
            "WARN "
        } else {
            "INFO "
        };
        lines.push(format!(
            "{lvl} trace={:05} shard={} msg=event-{seq}",
            (seq * 19) % 100000,
            seq % 12
        ));
    }
    lines
}

fn strict_command_lines(services: usize, tick: u64, row_budget: usize) -> Vec<String> {
    let mut lines = vec!["command palette actions".to_string()];
    for i in 1..row_budget {
        let cmd = i - 1;
        let selected = cmd == (tick as usize) % row_budget.saturating_sub(1).max(1);
        let preview = if ((tick as usize) + cmd).is_multiple_of(2) {
            "safe"
        } else {
            "risky"
        };
        lines.push(format!(
            "{} /command-{cmd:02} target=svc-{:03} preview={preview}",
            if selected { ">" } else { " " },
            ((tick as usize) + cmd) % services.max(1)
        ));
    }
    lines
}

fn strict_right_lines(page: &str, tick: u64, row_budget: usize) -> Vec<String> {
    let mut lines = vec![
        format!("page={page} focus=svc-{:03}", ((tick as usize) * 3) % 24),
        format!("slo p95<120ms now={}ms", 40 + ((tick as usize) * 5) % 120),
        format!(
            "deploy={} zone=az-{}",
            if (tick as usize).is_multiple_of(2) {
                "green"
            } else {
                "canary"
            },
            ((tick as usize) % 3) + 1
        ),
    ];
    for i in 3..row_budget {
        let seq = (tick as usize) * row_budget + i;
        let lvl = if seq.is_multiple_of(19) {
            "ERROR"
        } else if seq.is_multiple_of(11) {
            "WARN "
        } else {
            "INFO "
        };
        lines.push(format!(
            "{lvl} t+{seq:05} op={:02} note={}",
            (seq * 7) % 97,
            spark(seq as u64, 10)
        ));
    }
    lines
}

fn strict_fit_lines(mut lines: Vec<String>, target: usize) -> Vec<String> {
    if target == 0 {
        return Vec::new();
    }
    lines.truncate(target);
    while lines.len() < target {
        lines.push(String::new());
    }
    lines
}

fn strict_sections(
    navigation: bool,
    rows: u64,
    cols: u64,
    services: u64,
    dwell: u64,
    tick: u64,
) -> StrictSections {
    let rows = (rows as usize).max(16);
    let _cols = (cols as usize).max(100);
    let services = (services as usize).max(12);
    let dwell = (dwell as usize).max(2);
    let pages = strict_pages();
    let page = if navigation {
        pages[((tick as usize) / dwell) % pages.len()]
    } else {
        "dashboard"
    };

    let body_rows = rows.saturating_sub(5).max(1);
    let left_rows = body_rows.saturating_sub(1).max(1);
    let center_rows = body_rows.saturating_sub(1).max(1);
    let right_rows = body_rows.saturating_sub(1).max(1);

    let center = if !navigation || page == "dashboard" || page == "services" {
        strict_service_lines(services, tick, center_rows)
    } else if page == "deployments" {
        strict_deployment_lines(tick, center_rows)
    } else if page == "incidents" {
        strict_incident_lines(tick, center_rows)
    } else if page == "logs" {
        strict_log_lines(tick, center_rows)
    } else {
        strict_command_lines(services, tick, center_rows)
    };

    let header = if navigation {
        format!(
            "terminal-strict-ui-navigation page={page} tick={tick} local={}/{}",
            (tick as usize) % dwell,
            dwell - 1
        )
    } else {
        format!(
            "terminal-strict-ui page={page} tick={tick} cpu={}% mem={}% qps={}",
            35 + ((tick as usize) * 7) % 40,
            42 + ((tick as usize) * 11) % 49,
            900 + ((tick as usize) * 29) % 1500
        )
    };

    let status = if navigation {
        format!(
            "route={page} navLatency={}ms commit={} pending={}",
            1 + ((tick as usize) * 7) % 9,
            ((tick as usize) * 97) % 10000,
            ((tick as usize) * 13) % 33
        )
    } else {
        format!(
            "status=online conn={} sync={} pending={}",
            1200 + ((tick as usize) * 17) % 800,
            ((tick as usize) * 29) % 9999,
            ((tick as usize) * 5) % 48
        )
    };

    StrictSections {
        header,
        left_title: if navigation {
            "NAVIGATION".to_string()
        } else {
            "NAV".to_string()
        },
        left_lines: strict_fit_lines(strict_nav_lines(page, tick), left_rows),
        center_title: if navigation {
            page.to_uppercase()
        } else {
            "SERVICES".to_string()
        },
        center_lines: strict_fit_lines(center, center_rows),
        right_title: if navigation {
            "DETAILS".to_string()
        } else {
            "INSPECTOR".to_string()
        },
        right_lines: strict_fit_lines(strict_right_lines(page, tick, right_rows), right_rows),
        status,
        footer: if navigation {
            "flow: [tab] next-page [shift+tab] prev-page [enter] open [esc] close".to_string()
        } else {
            "keys: [tab] move [enter] open [/] command [q] quit".to_string()
        },
    }
}

fn panel_text(title: &str, lines: &[String]) -> Text<'static> {
    let mut all = Vec::with_capacity(lines.len() + 1);
    all.push(title.to_string());
    all.extend(lines.iter().cloned());
    to_text(all)
}

fn draw_strict_sections(f: &mut ratatui::Frame<'_>, sections: &StrictSections) {
    let area = f.size();

    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(1),
            Constraint::Length(2),
        ])
        .split(area);

    let header_block = Block::default().borders(Borders::ALL);
    let header_inner = header_block.inner(vertical[0]);
    f.render_widget(header_block, vertical[0]);
    f.render_widget(Paragraph::new(sections.header.clone()), header_inner);

    let horizontal = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(24),
            Constraint::Min(28),
            Constraint::Length(32),
        ])
        .split(vertical[1]);

    let left_block = Block::default().borders(Borders::ALL);
    let left_inner = left_block.inner(horizontal[0]);
    f.render_widget(left_block, horizontal[0]);
    f.render_widget(
        Paragraph::new(panel_text(&sections.left_title, &sections.left_lines)),
        left_inner,
    );

    let center_block = Block::default().borders(Borders::ALL);
    let center_inner = center_block.inner(horizontal[1]);
    f.render_widget(center_block, horizontal[1]);
    f.render_widget(
        Paragraph::new(panel_text(&sections.center_title, &sections.center_lines)),
        center_inner,
    );

    let right_block = Block::default().borders(Borders::ALL);
    let right_inner = right_block.inner(horizontal[2]);
    f.render_widget(right_block, horizontal[2]);
    f.render_widget(
        Paragraph::new(panel_text(&sections.right_title, &sections.right_lines)),
        right_inner,
    );

    let footer_block = Block::default().borders(Borders::ALL);
    let footer_inner = footer_block.inner(vertical[2]);
    f.render_widget(footer_block, vertical[2]);
    f.render_widget(
        Paragraph::new(to_text(vec![
            sections.status.clone(),
            sections.footer.clone(),
        ])),
        footer_inner,
    );
}

enum ScenarioSpec {
    TerminalRerender,
    TerminalFrameFill {
        rows: u64,
        cols: u64,
        dirty_lines: u64,
    },
    TerminalVirtualList {
        items: u64,
        viewport: u64,
    },
    TerminalTable {
        rows: u64,
        cols: u64,
    },
    TerminalScreenTransition {
        rows: u64,
        cols: u64,
    },
    TerminalFpsStream {
        rows: u64,
        cols: u64,
        channels: u64,
    },
    TerminalInputLatency {
        rows: u64,
        cols: u64,
    },
    TerminalMemorySoak {
        rows: u64,
        cols: u64,
    },
    TerminalFullUi {
        rows: u64,
        cols: u64,
        services: u64,
    },
    TerminalFullUiNavigation {
        rows: u64,
        cols: u64,
        services: u64,
        dwell: u64,
    },
    TerminalStrictUi {
        rows: u64,
        cols: u64,
        services: u64,
    },
    TerminalStrictUiNavigation {
        rows: u64,
        cols: u64,
        services: u64,
        dwell: u64,
    },
}

fn scenario_spec(
    scenario: &str,
    params: &std::collections::HashMap<String, String>,
) -> Result<ScenarioSpec, String> {
    match scenario {
        "terminal-rerender" => Ok(ScenarioSpec::TerminalRerender),
        "terminal-frame-fill" => Ok(ScenarioSpec::TerminalFrameFill {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
            dirty_lines: get_u64(params, "dirtyLines")?,
        }),
        "terminal-virtual-list" => Ok(ScenarioSpec::TerminalVirtualList {
            items: get_u64(params, "items")?,
            viewport: get_u64(params, "viewport")?,
        }),
        "terminal-table" => Ok(ScenarioSpec::TerminalTable {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
        }),
        "terminal-screen-transition" => Ok(ScenarioSpec::TerminalScreenTransition {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
        }),
        "terminal-fps-stream" => Ok(ScenarioSpec::TerminalFpsStream {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
            channels: get_u64(params, "channels")?,
        }),
        "terminal-input-latency" => Ok(ScenarioSpec::TerminalInputLatency {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
        }),
        "terminal-memory-soak" => Ok(ScenarioSpec::TerminalMemorySoak {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
        }),
        "terminal-full-ui" => Ok(ScenarioSpec::TerminalFullUi {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
            services: get_u64(params, "services")?,
        }),
        "terminal-full-ui-navigation" => Ok(ScenarioSpec::TerminalFullUiNavigation {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
            services: get_u64(params, "services")?,
            dwell: get_u64(params, "dwell")?,
        }),
        "terminal-strict-ui" => Ok(ScenarioSpec::TerminalStrictUi {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
            services: get_u64(params, "services")?,
        }),
        "terminal-strict-ui-navigation" => Ok(ScenarioSpec::TerminalStrictUiNavigation {
            rows: get_u64(params, "rows")?,
            cols: get_u64(params, "cols")?,
            services: get_u64(params, "services")?,
            dwell: get_u64(params, "dwell")?,
        }),
        _ => Err(format!("unknown scenario: {scenario}")),
    }
}

fn draw_spec_frame(f: &mut ratatui::Frame<'_>, spec: &ScenarioSpec, tick: u64) {
    let area = f.size();
    match spec {
        ScenarioSpec::TerminalStrictUi {
            rows,
            cols,
            services,
        } => {
            let sections = strict_sections(false, *rows, *cols, *services, 8, tick);
            draw_strict_sections(f, &sections);
        }
        ScenarioSpec::TerminalStrictUiNavigation {
            rows,
            cols,
            services,
            dwell,
        } => {
            let sections = strict_sections(true, *rows, *cols, *services, *dwell, tick);
            draw_strict_sections(f, &sections);
        }
        _ => {
            let text = match spec {
                ScenarioSpec::TerminalRerender => to_text(vec![
                    "terminal-rerender".to_string(),
                    format!("tick={tick}"),
                ]),
                ScenarioSpec::TerminalFrameFill {
                    rows,
                    cols,
                    dirty_lines,
                } => to_text(frame_fill_lines(*rows, *cols, *dirty_lines, tick)),
                ScenarioSpec::TerminalVirtualList { items, viewport } => {
                    to_text(virtual_list_lines(*items, *viewport, tick))
                }
                ScenarioSpec::TerminalTable { rows, cols } => {
                    to_text(table_lines(*rows, *cols, tick))
                }
                ScenarioSpec::TerminalScreenTransition { rows, cols } => {
                    to_text(screen_transition_lines(*rows, *cols, tick))
                }
                ScenarioSpec::TerminalFpsStream {
                    rows,
                    cols,
                    channels,
                } => to_text(fps_stream_lines(*rows, *cols, *channels, tick)),
                ScenarioSpec::TerminalInputLatency { rows, cols } => {
                    to_text(input_latency_lines(*rows, *cols, tick))
                }
                ScenarioSpec::TerminalMemorySoak { rows, cols } => {
                    to_text(memory_soak_lines(*rows, *cols, tick))
                }
                ScenarioSpec::TerminalFullUi {
                    rows,
                    cols,
                    services,
                } => to_text(full_ui_lines(*rows, *cols, *services, tick)),
                ScenarioSpec::TerminalFullUiNavigation {
                    rows,
                    cols,
                    services,
                    dwell,
                } => to_text(full_ui_navigation_lines(
                    *rows, *cols, *services, *dwell, tick,
                )),
                ScenarioSpec::TerminalStrictUi { .. }
                | ScenarioSpec::TerminalStrictUiNavigation { .. } => unreachable!(),
            };
            f.render_widget(Paragraph::new(text), area);
        }
    }
}

fn run_stub(
    scenario: &str,
    warmup: u64,
    iterations: u64,
    params: &std::collections::HashMap<String, String>,
) -> Result<(Vec<f64>, f64), String> {
    let spec = scenario_spec(scenario, params)?;
    let backend = TestBackend::new(120, 40);
    let mut terminal = Terminal::new(backend).map_err(|e| e.to_string())?;

    let mut render = |tick: u64| -> Result<(), String> {
        terminal
            .draw(|f| draw_spec_frame(f, &spec, tick))
            .map(|_| ())
            .map_err(|e| e.to_string())
    };

    for i in 0..warmup {
        render(i)?;
    }

    let mut samples = Vec::with_capacity(iterations as usize);
    let t0 = Instant::now();
    for i in 0..iterations {
        let ts = Instant::now();
        render(warmup + i)?;
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
    }
    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;
    Ok((samples, total_wall_ms))
}

fn run_pty(
    scenario: &str,
    warmup: u64,
    iterations: u64,
    params: &std::collections::HashMap<String, String>,
    counter: ByteCounter,
) -> Result<(Vec<f64>, f64), String> {
    let spec = scenario_spec(scenario, params)?;
    let stdout = io::stdout();
    let writer = CountingWriter::new(stdout, counter);
    let backend = CrosstermBackend::new(writer);
    let mut terminal = Terminal::new(backend).map_err(|e| e.to_string())?;

    let mut render = |tick: u64| -> Result<(), String> {
        terminal
            .draw(|f| draw_spec_frame(f, &spec, tick))
            .map(|_| ())
            .map_err(|e| e.to_string())
    };

    for i in 0..warmup {
        render(i)?;
    }

    let mut samples = Vec::with_capacity(iterations as usize);
    let t0 = Instant::now();
    for i in 0..iterations {
        let ts = Instant::now();
        render(warmup + i)?;
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
    }
    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;
    Ok((samples, total_wall_ms))
}

fn main() {
    let args = match parse_args() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };

    let scenario = match get_str(&args, "scenario") {
        Ok(s) => s.to_string(),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };
    let warmup = get_u64(&args, "warmup").unwrap_or(0);
    let iterations = get_u64(&args, "iterations").unwrap_or(0);
    let io_mode = get_str(&args, "io").unwrap_or("stub");
    let result_path = get_str(&args, "result-path").unwrap_or("result.json");

    let ru_before = now_rusage();
    let rss_before = rss_current_kb();

    let counter = ByteCounter::new();
    let run = if io_mode == "pty" {
        run_pty(&scenario, warmup, iterations, &args, counter.clone())
    } else {
        run_stub(&scenario, warmup, iterations, &args)
    };

    let ru_after = now_rusage();
    let (cpu_user, cpu_sys) = cpu_ms_delta(ru_before, ru_after);
    let rss_after = rss_current_kb();
    let rss_peak = rss_peak_kb_from_rusage(ru_after)
        .max(rss_before)
        .max(rss_after);

    let payload = match run {
        Ok((samples, total_wall_ms)) => ResultFile::Ok {
            ok: true,
            data: ResultData {
                samples_ms: samples,
                total_wall_ms,
                cpu_user_ms: cpu_user,
                cpu_sys_ms: cpu_sys,
                rss_before_kb: rss_before,
                rss_after_kb: rss_after,
                rss_peak_kb: rss_peak,
                bytes_written: counter.get(),
                frames: iterations,
            },
        },
        Err(e) => ResultFile::Err {
            ok: false,
            error: e,
        },
    };

    let json = serde_json::to_string_pretty(&payload)
        .unwrap_or_else(|e| format!(r#"{{"ok":false,"error":"serde_json: {e}"}}"#));
    if let Err(e) = fs::write(result_path, json) {
        eprintln!("write result failed: {e}");
        std::process::exit(1);
    }
}

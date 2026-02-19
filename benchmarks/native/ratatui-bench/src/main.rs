use std::fs;
use std::io::{self, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use ratatui::backend::{CrosstermBackend, TestBackend};
use ratatui::text::{Line, Text};
use ratatui::widgets::Paragraph;
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

fn get_str<'a>(m: &'a std::collections::HashMap<String, String>, k: &str) -> Result<&'a str, String> {
  m.get(k).map(|s| s.as_str()).ok_or_else(|| format!("missing --{k}"))
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
    out.push(clip_pad("terminal-screen-transition [dashboard]".to_string(), cols));
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
    out.push(clip_pad("terminal-screen-transition [table]".to_string(), cols));
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

  out.push(clip_pad("terminal-screen-transition [logs]".to_string(), cols));
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
      format!("{lvl} ts={} service={} msg=transition-{seq}", 1_700_000_000_000u64 + seq as u64 * 17, seq % 17),
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
    let payload = format!("{id:05} {} {}", "x".repeat((i % 7) + 8), ((tick as usize) + i) % 997);
    out.push(clip_pad(payload, cols));
  }
  out
}

fn to_text(lines: Vec<String>) -> Text<'static> {
  let v: Vec<Line<'static>> = lines.into_iter().map(|s| Line::from(s)).collect();
  Text::from(v)
}

enum ScenarioSpec {
  TerminalRerender,
  TerminalFrameFill { rows: u64, cols: u64, dirty_lines: u64 },
  TerminalVirtualList { items: u64, viewport: u64 },
  TerminalTable { rows: u64, cols: u64 },
  TerminalScreenTransition { rows: u64, cols: u64 },
  TerminalFpsStream { rows: u64, cols: u64, channels: u64 },
  TerminalInputLatency { rows: u64, cols: u64 },
  TerminalMemorySoak { rows: u64, cols: u64 },
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
    _ => Err(format!("unknown scenario: {scenario}")),
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
      .draw(|f| {
        let area = f.size();
        let text = match spec {
          ScenarioSpec::TerminalRerender => to_text(vec![
            "terminal-rerender".to_string(),
            format!("tick={tick}"),
          ]),
          ScenarioSpec::TerminalFrameFill {
            rows,
            cols,
            dirty_lines,
          } => to_text(frame_fill_lines(rows, cols, dirty_lines, tick)),
          ScenarioSpec::TerminalVirtualList { items, viewport } => {
            to_text(virtual_list_lines(items, viewport, tick))
          }
          ScenarioSpec::TerminalTable { rows, cols } => to_text(table_lines(rows, cols, tick)),
          ScenarioSpec::TerminalScreenTransition { rows, cols } => {
            to_text(screen_transition_lines(rows, cols, tick))
          }
          ScenarioSpec::TerminalFpsStream {
            rows,
            cols,
            channels,
          } => to_text(fps_stream_lines(rows, cols, channels, tick)),
          ScenarioSpec::TerminalInputLatency { rows, cols } => {
            to_text(input_latency_lines(rows, cols, tick))
          }
          ScenarioSpec::TerminalMemorySoak { rows, cols } => {
            to_text(memory_soak_lines(rows, cols, tick))
          }
        };
        f.render_widget(Paragraph::new(text), area);
      })
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
      .draw(|f| {
        let area = f.size();
        let text = match spec {
          ScenarioSpec::TerminalRerender => to_text(vec![
            "terminal-rerender".to_string(),
            format!("tick={tick}"),
          ]),
          ScenarioSpec::TerminalFrameFill {
            rows,
            cols,
            dirty_lines,
          } => to_text(frame_fill_lines(rows, cols, dirty_lines, tick)),
          ScenarioSpec::TerminalVirtualList { items, viewport } => {
            to_text(virtual_list_lines(items, viewport, tick))
          }
          ScenarioSpec::TerminalTable { rows, cols } => to_text(table_lines(rows, cols, tick)),
          ScenarioSpec::TerminalScreenTransition { rows, cols } => {
            to_text(screen_transition_lines(rows, cols, tick))
          }
          ScenarioSpec::TerminalFpsStream {
            rows,
            cols,
            channels,
          } => to_text(fps_stream_lines(rows, cols, channels, tick)),
          ScenarioSpec::TerminalInputLatency { rows, cols } => {
            to_text(input_latency_lines(rows, cols, tick))
          }
          ScenarioSpec::TerminalMemorySoak { rows, cols } => {
            to_text(memory_soak_lines(rows, cols, tick))
          }
        };
        f.render_widget(Paragraph::new(text), area);
      })
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
  let rss_peak = rss_peak_kb_from_rusage(ru_after).max(rss_before).max(rss_after);

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
    Err(e) => ResultFile::Err { ok: false, error: e },
  };

  let json = serde_json::to_string_pretty(&payload).unwrap_or_else(|e| {
    format!(r#"{{"ok":false,"error":"serde_json: {e}"}}"#)
  });
  if let Err(e) = fs::write(result_path, json) {
    eprintln!("write result failed: {e}");
    std::process::exit(1);
  }
}

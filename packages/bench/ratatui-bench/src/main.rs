//! Ratatui benchmark harness.
//!
//! Runs the same scenarios as the Node.js bench suite and outputs
//! JSON metrics that the TS runner can consume.
//!
//! Usage:
//!   ratatui-bench --scenario <name> --iterations <n> --warmup <n> [--items <n>]
//!
//! Scenarios: construction, rerender, content-update, memory-profile, startup

use ratatui::{
    backend::TestBackend,
    layout::{Constraint, Direction, Layout},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{List, ListItem, Paragraph},
    Terminal,
};
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
struct TimingStats {
    mean: f64,
    median: f64,
    p95: f64,
    p99: f64,
    min: f64,
    max: f64,
    stddev: f64,
    cv: f64,
}

#[derive(Serialize)]
struct BenchOutput {
    timing: TimingStats,
    iterations: usize,
    total_wall_ms: f64,
    ops_per_sec: f64,
    peak_rss_kb: u64,
}

fn compute_stats(samples: &mut Vec<f64>) -> TimingStats {
    if samples.is_empty() {
        return TimingStats {
            mean: 0.0, median: 0.0, p95: 0.0, p99: 0.0,
            min: 0.0, max: 0.0, stddev: 0.0, cv: 0.0,
        };
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = samples.len();
    let sum: f64 = samples.iter().sum();
    let mean = sum / n as f64;

    let median = if n % 2 == 0 {
        (samples[n / 2 - 1] + samples[n / 2]) / 2.0
    } else {
        samples[n / 2]
    };

    let p95 = samples[(n as f64 * 0.95).ceil() as usize - 1];
    let p99 = samples[((n as f64 * 0.99).ceil() as usize - 1).min(n - 1)];
    let min = samples[0];
    let max = samples[n - 1];

    let variance: f64 = samples.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n as f64;
    let stddev = variance.sqrt();
    let cv = if mean > 0.0 { stddev / mean } else { 0.0 };

    TimingStats { mean, median, p95, p99, min, max, stddev, cv }
}

fn get_peak_rss_kb() -> u64 {
    // Read from /proc/self/status on Linux
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("VmHWM:") {
                if let Some(val) = line.split_whitespace().nth(1) {
                    return val.parse().unwrap_or(0);
                }
            }
        }
    }
    0
}

/// Build the same tree structure as the Node.js benchmarks:
/// Title (bold), summary row, then N item rows with dim index + text + italic details
fn render_list(terminal: &mut Terminal<TestBackend>, n: usize, seed: usize) {
    terminal.draw(|frame| {
        let area = frame.area();

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1), // title
                Constraint::Length(1), // summary
                Constraint::Min(0),    // items
            ])
            .split(area);

        // Title
        let title = Paragraph::new(Line::from(Span::styled(
            format!("Benchmark: {} items (#{})", n, seed),
            Style::default().add_modifier(Modifier::BOLD),
        )));
        frame.render_widget(title, chunks[0]);

        // Summary
        let summary = Paragraph::new(Line::from(vec![
            Span::raw(format!("Total: {}", n)),
            Span::raw("  "),
            Span::raw("Page 1"),
        ]));
        frame.render_widget(summary, chunks[1]);

        // Item list
        let items: Vec<ListItem> = (0..n)
            .map(|i| {
                ListItem::new(Line::from(vec![
                    Span::styled(format!("{}.", i), Style::default().add_modifier(Modifier::DIM)),
                    Span::raw(" "),
                    Span::raw(format!("Item {}", i)),
                    Span::raw(" "),
                    Span::styled("details", Style::default().add_modifier(Modifier::ITALIC)),
                ]))
            })
            .collect();
        let list = List::new(items);
        frame.render_widget(list, chunks[2]);
    }).unwrap();
}

/// Counter app (same as rerender scenario)
fn render_counter(terminal: &mut Terminal<TestBackend>, count: usize) {
    terminal.draw(|frame| {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Min(0),
            ])
            .split(area);

        frame.render_widget(
            Paragraph::new(Span::styled("Counter Benchmark", Style::default().add_modifier(Modifier::BOLD))),
            chunks[0],
        );
        frame.render_widget(
            Paragraph::new(Line::from(vec![
                Span::raw(format!("Count: {}", count)),
                Span::raw("  [+1]  [-1]"),
            ])),
            chunks[1],
        );
        frame.render_widget(
            Paragraph::new(Span::styled(
                format!("Last updated: iteration {}", count),
                Style::default().add_modifier(Modifier::DIM),
            )),
            chunks[3],
        );
    }).unwrap();
}

/// 500-row list with movable selection (content-update scenario)
fn render_content_update(terminal: &mut Terminal<TestBackend>, selected: usize) {
    let list_size = 500;
    terminal.draw(|frame| {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Min(0),
            ])
            .split(area);

        frame.render_widget(
            Paragraph::new(Line::from(vec![
                Span::styled("Files", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(format!("  {} items", list_size)),
                Span::styled(format!("  Selected: {}", selected), Style::default().add_modifier(Modifier::DIM)),
            ])),
            chunks[0],
        );

        let items: Vec<ListItem> = (0..list_size)
            .map(|i| {
                let is_sel = i == selected;
                let marker = if is_sel { "> " } else { "  " };
                let idx_style = if is_sel {
                    Style::default().add_modifier(Modifier::BOLD)
                } else {
                    Style::default().add_modifier(Modifier::DIM)
                };
                let name_style = if is_sel {
                    Style::default().add_modifier(Modifier::BOLD | Modifier::REVERSED)
                } else {
                    Style::default()
                };

                ListItem::new(Line::from(vec![
                    Span::styled(marker, idx_style),
                    Span::styled(format!("{:>3}.", i), idx_style),
                    Span::raw(" "),
                    Span::styled(format!("entry-{}.log", i), name_style),
                    Span::raw("  "),
                    Span::styled(format!("{} B", i * 1024 + 512), Style::default().add_modifier(Modifier::DIM)),
                ]))
            })
            .collect();
        let list = List::new(items);
        frame.render_widget(list, chunks[1]);
    }).unwrap();
}

/// Memory-profile tree: progress bar + 20 lines
fn render_memory_tree(terminal: &mut Terminal<TestBackend>, iter: usize) {
    terminal.draw(|frame| {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Min(0),
            ])
            .split(area);

        frame.render_widget(
            Paragraph::new(Span::styled(
                format!("Iteration {}", iter),
                Style::default().add_modifier(Modifier::BOLD),
            )),
            chunks[0],
        );

        let pct = iter % 100;
        let filled = pct / 5;
        let bar = format!("[{}{}] {}%", "#".repeat(filled), ".".repeat(20 - filled), pct);
        frame.render_widget(Paragraph::new(bar), chunks[1]);

        let items: Vec<ListItem> = (0..20)
            .map(|j| {
                let style = if j % 2 == 0 {
                    Style::default().add_modifier(Modifier::DIM)
                } else {
                    Style::default()
                };
                ListItem::new(Span::styled(
                    format!("  Line {}: value={}", j, iter * 20 + j),
                    style,
                ))
            })
            .collect();
        let list = List::new(items);
        frame.render_widget(list, chunks[2]);
    }).unwrap();
}

fn run_scenario(scenario: &str, warmup: usize, iterations: usize, items: usize) -> BenchOutput {
    match scenario {
        "construction" => run_construction(warmup, iterations, items),
        "rerender" => run_rerender(warmup, iterations),
        "content-update" => run_content_update(warmup, iterations),
        "memory-profile" => run_memory_profile(warmup, iterations),
        "startup" => run_startup(warmup, iterations),
        _ => panic!("Unknown scenario: {}", scenario),
    }
}

fn run_construction(warmup: usize, iterations: usize, n: usize) -> BenchOutput {
    let mut terminal = Terminal::new(TestBackend::new(120, 540.max(n as u16 + 5))).unwrap();

    for i in 0..warmup {
        render_list(&mut terminal, n, i);
    }

    let mut samples = Vec::with_capacity(iterations);
    let t0 = Instant::now();

    for i in 0..iterations {
        let ts = Instant::now();
        render_list(&mut terminal, n, warmup + i);
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
    }

    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let ops_per_sec = iterations as f64 / (total_wall_ms / 1000.0);

    BenchOutput {
        timing: compute_stats(&mut samples),
        iterations,
        total_wall_ms,
        ops_per_sec,
        peak_rss_kb: get_peak_rss_kb(),
    }
}

fn run_rerender(warmup: usize, iterations: usize) -> BenchOutput {
    let mut terminal = Terminal::new(TestBackend::new(120, 40)).unwrap();

    for i in 0..warmup {
        render_counter(&mut terminal, i);
    }

    let mut samples = Vec::with_capacity(iterations);
    let t0 = Instant::now();

    for i in 0..iterations {
        let ts = Instant::now();
        render_counter(&mut terminal, warmup + i);
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
    }

    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;

    BenchOutput {
        timing: compute_stats(&mut samples),
        iterations,
        total_wall_ms,
        ops_per_sec: iterations as f64 / (total_wall_ms / 1000.0),
        peak_rss_kb: get_peak_rss_kb(),
    }
}

fn run_content_update(warmup: usize, iterations: usize) -> BenchOutput {
    let mut terminal = Terminal::new(TestBackend::new(120, 540)).unwrap();
    let list_size = 500;
    let mut selected: usize = 0;

    for _ in 0..warmup {
        selected = (selected + 1) % list_size;
        render_content_update(&mut terminal, selected);
    }

    let mut samples = Vec::with_capacity(iterations);
    let t0 = Instant::now();

    for _ in 0..iterations {
        selected = (selected + 1) % list_size;
        let ts = Instant::now();
        render_content_update(&mut terminal, selected);
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
    }

    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;

    BenchOutput {
        timing: compute_stats(&mut samples),
        iterations,
        total_wall_ms,
        ops_per_sec: iterations as f64 / (total_wall_ms / 1000.0),
        peak_rss_kb: get_peak_rss_kb(),
    }
}

fn run_memory_profile(warmup: usize, iterations: usize) -> BenchOutput {
    let mut terminal = Terminal::new(TestBackend::new(120, 40)).unwrap();

    for i in 0..warmup {
        render_memory_tree(&mut terminal, i);
    }

    let mut samples = Vec::with_capacity(iterations);
    let t0 = Instant::now();

    for i in 0..iterations {
        let ts = Instant::now();
        render_memory_tree(&mut terminal, warmup + i);
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
    }

    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;

    BenchOutput {
        timing: compute_stats(&mut samples),
        iterations,
        total_wall_ms,
        ops_per_sec: iterations as f64 / (total_wall_ms / 1000.0),
        peak_rss_kb: get_peak_rss_kb(),
    }
}

fn run_startup(warmup: usize, iterations: usize) -> BenchOutput {
    let n = 50;

    for i in 0..warmup {
        let mut terminal = Terminal::new(TestBackend::new(120, 60)).unwrap();
        render_list(&mut terminal, n, i);
        drop(terminal);
    }

    let mut samples = Vec::with_capacity(iterations);
    let t0 = Instant::now();

    for i in 0..iterations {
        let ts = Instant::now();
        let mut terminal = Terminal::new(TestBackend::new(120, 60)).unwrap();
        render_list(&mut terminal, n, warmup + i);
        samples.push(ts.elapsed().as_secs_f64() * 1000.0);
        drop(terminal);
    }

    let total_wall_ms = t0.elapsed().as_secs_f64() * 1000.0;

    BenchOutput {
        timing: compute_stats(&mut samples),
        iterations,
        total_wall_ms,
        ops_per_sec: iterations as f64 / (total_wall_ms / 1000.0),
        peak_rss_kb: get_peak_rss_kb(),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut scenario = "construction";
    let mut warmup = 50;
    let mut iterations = 500;
    let mut items = 1000;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--scenario" => { i += 1; scenario = args.get(i).map(|s| s.as_str()).unwrap_or(scenario); }
            "--warmup" => { i += 1; warmup = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(warmup); }
            "--iterations" => { i += 1; iterations = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(iterations); }
            "--items" => { i += 1; items = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(items); }
            _ => {}
        }
        i += 1;
    }

    let output = run_scenario(scenario, warmup, iterations, items);
    println!("{}", serde_json::to_string(&output).unwrap());
}

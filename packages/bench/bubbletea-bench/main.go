package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

const (
	startupTreeSize       = 50
	contentUpdateListSize = 500
)

type cliArgs struct {
	scenario   string
	warmup     int
	iterations int
	ioMode     string
	resultPath string
	params     map[string]string
}

type cpuUsage struct {
	userMs   float64
	systemMs float64
}

type memorySnapshot struct {
	rssKb      int64
	heapUsedKb int64
}

type benchResultData struct {
	SamplesMs   []float64 `json:"samplesMs"`
	TotalWallMs float64   `json:"totalWallMs"`
	CPUUserMs   float64   `json:"cpuUserMs"`
	CPUSysMs    float64   `json:"cpuSysMs"`
	RSSBeforeKb int64     `json:"rssBeforeKb"`
	RSSAfterKb  int64     `json:"rssAfterKb"`
	RSSPeakKb   int64     `json:"rssPeakKb"`
	HeapBeforeKb int64    `json:"heapBeforeKb"`
	HeapAfterKb  int64    `json:"heapAfterKb"`
	HeapPeakKb   int64    `json:"heapPeakKb"`
	BytesWritten int64    `json:"bytesWritten"`
	Frames       int      `json:"frames"`
}

type benchResultFile struct {
	OK    bool             `json:"ok"`
	Data  *benchResultData `json:"data,omitempty"`
	Error string           `json:"error,omitempty"`
}

func parseArgs(argv []string) (cliArgs, error) {
	out := cliArgs{
		scenario:   "",
		warmup:     100,
		iterations: 1000,
		ioMode:     "pty",
		resultPath: "",
		params:     map[string]string{},
	}

	for i := 1; i < len(argv); i++ {
		arg := argv[i]
		if !strings.HasPrefix(arg, "--") {
			continue
		}
		key := strings.TrimPrefix(arg, "--")
		if i+1 >= len(argv) {
			return out, fmt.Errorf("missing value for %s", arg)
		}
		value := argv[i+1]
		i++

		switch key {
		case "scenario":
			out.scenario = value
		case "warmup":
			n, err := strconv.Atoi(value)
			if err != nil {
				return out, fmt.Errorf("invalid --warmup: %w", err)
			}
			out.warmup = n
		case "iterations":
			n, err := strconv.Atoi(value)
			if err != nil {
				return out, fmt.Errorf("invalid --iterations: %w", err)
			}
			out.iterations = n
		case "io":
			if value == "stub" {
				out.ioMode = "stub"
			} else {
				out.ioMode = "pty"
			}
		case "result-path":
			out.resultPath = value
		default:
			out.params[key] = value
		}
	}

	if out.scenario == "" {
		return out, errors.New("missing --scenario")
	}
	if out.iterations <= 0 {
		return out, errors.New("--iterations must be > 0")
	}
	if out.warmup < 0 {
		return out, errors.New("--warmup must be >= 0")
	}

	return out, nil
}

func takeCPU() cpuUsage {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return cpuUsage{}
	}
	return cpuUsage{
		userMs:   float64(ru.Utime.Sec)*1000 + float64(ru.Utime.Usec)/1000,
		systemMs: float64(ru.Stime.Sec)*1000 + float64(ru.Stime.Usec)/1000,
	}
}

func diffCPU(before, after cpuUsage) cpuUsage {
	return cpuUsage{
		userMs:   after.userMs - before.userMs,
		systemMs: after.systemMs - before.systemMs,
	}
}

func readRSSKb() int64 {
	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.HasPrefix(line, "VmRSS:") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			return 0
		}
		n, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			return 0
		}
		return n
	}
	return 0
}

func takeMemory() memorySnapshot {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return memorySnapshot{
		rssKb:      readRSSKb(),
		heapUsedKb: int64(ms.HeapAlloc / 1024),
	}
}

func peakMemory(a, b memorySnapshot) memorySnapshot {
	out := a
	if b.rssKb > out.rssKb {
		out.rssKb = b.rssKb
	}
	if b.heapUsedKb > out.heapUsedKb {
		out.heapUsedKb = b.heapUsedKb
	}
	return out
}

func tryGC() {
	runtime.GC()
}

func msSince(start time.Time) float64 {
	return float64(time.Since(start).Microseconds()) / 1000.0
}

type measuringWriter struct {
	out ioWriter

	mu         sync.Mutex
	totalBytes int64
	writeCount int64
}

type ioWriter interface {
	Write(p []byte) (n int, err error)
}

func newMeasuringWriter(out ioWriter) *measuringWriter {
	if out == nil {
		out = discardWriter{}
	}
	return &measuringWriter{out: out}
}

type discardWriter struct{}

func (discardWriter) Write(p []byte) (int, error) {
	return len(p), nil
}

func (w *measuringWriter) Write(p []byte) (int, error) {
	n, err := w.out.Write(p)
	w.mu.Lock()
	if n > 0 {
		w.totalBytes += int64(n)
		w.writeCount++
	}
	w.mu.Unlock()
	return n, err
}

func (w *measuringWriter) snapshot() (int64, int64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.totalBytes, w.writeCount
}

func (w *measuringWriter) waitWriteAfter(baseWriteCount int64, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for {
		_, writes := w.snapshot()
		if writes > baseWriteCount {
			return
		}
		if time.Now().After(deadline) {
			return
		}
		time.Sleep(200 * time.Microsecond)
	}
}

type readyMsg struct{}

type benchTickMsg struct {
	tick int
	ack  chan struct{}
}

type benchModel struct {
	scenario string
	params   map[string]string
	cols     int
	lines    []string

	pendingAck chan struct{}
	ready      chan struct{}
}

func (m *benchModel) Init() tea.Cmd {
	return func() tea.Msg {
		return readyMsg{}
	}
}

func (m *benchModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch v := msg.(type) {
	case readyMsg:
		if m.ready != nil {
			close(m.ready)
			m.ready = nil
		}
	case tea.WindowSizeMsg:
		if v.Width > 0 {
			m.cols = v.Width
		}
	case benchTickMsg:
		m.lines = scenarioLines(m.scenario, m.params, v.tick, m.cols)
		m.pendingAck = v.ack
	}
	return m, nil
}

func (m *benchModel) View() string {
	if m.pendingAck != nil {
		close(m.pendingAck)
		m.pendingAck = nil
	}
	return strings.Join(m.lines, "\n")
}

type benchSession struct {
	program *tea.Program
	writer  *measuringWriter
	done    chan error
}

func startBenchSession(
	scenario string,
	params map[string]string,
	rows int,
	cols int,
	writer *measuringWriter,
) (*benchSession, error) {
	ready := make(chan struct{})
	model := &benchModel{
		scenario: scenario,
		params:   params,
		cols:     cols,
		lines:    []string{},
		ready:    ready,
	}

	program := tea.NewProgram(
		model,
		tea.WithInput(nil),
		tea.WithOutput(writer),
		tea.WithFPS(1000),
		tea.WithAltScreen(),
		tea.WithoutSignalHandler(),
	)

	done := make(chan error, 1)
	go func() {
		_, err := program.Run()
		done <- err
	}()

	select {
	case <-ready:
		program.Send(tea.WindowSizeMsg{Width: cols, Height: rows})
		return &benchSession{program: program, writer: writer, done: done}, nil
	case err := <-done:
		if err == nil {
			err = errors.New("bubbletea exited before initialization")
		}
		return nil, err
	case <-time.After(3 * time.Second):
		return nil, errors.New("timeout waiting for bubbletea startup")
	}
}

func (s *benchSession) renderTick(tick int, eventLoop bool) error {
	ack := make(chan struct{})
	_, writeBase := s.writer.snapshot()

	send := func() {
		s.program.Send(benchTickMsg{tick: tick, ack: ack})
	}
	if eventLoop {
		go send()
	} else {
		send()
	}

	select {
	case <-ack:
		s.writer.waitWriteAfter(writeBase, 10*time.Millisecond)
		return nil
	case <-time.After(3 * time.Second):
		return fmt.Errorf("timeout waiting for bubbletea render tick=%d", tick)
	}
}

func (s *benchSession) close() error {
	s.program.Send(tea.Quit())
	select {
	case err := <-s.done:
		return err
	case <-time.After(3 * time.Second):
		return errors.New("timeout shutting down bubbletea")
	}
}

func padTo(s string, width int) string {
	runes := []rune(s)
	if len(runes) >= width {
		return string(runes[:width])
	}
	return s + strings.Repeat(" ", width-len(runes))
}

func clipPad(s string, cols int) string {
	runes := []rune(s)
	if len(runes) >= cols {
		return string(runes[:cols])
	}
	return s + strings.Repeat(" ", cols-len(runes))
}

func bar(value float64, width int) string {
	filled := int(math.Round(value * float64(width)))
	if filled < 0 {
		filled = 0
	}
	if filled > width {
		filled = width
	}
	return strings.Repeat("#", filled) + strings.Repeat("-", width-filled)
}

func safeMod(value int, denom int) int {
	if denom <= 0 {
		return 0
	}
	return value % denom
}

func intParam(params map[string]string, key string, fallback int) int {
	raw, ok := params[key]
	if !ok {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func formatWithCommas(v int) string {
	s := strconv.Itoa(v)
	if len(s) <= 3 {
		return s
	}
	n := len(s)
	first := n % 3
	if first == 0 {
		first = 3
	}
	var b strings.Builder
	b.WriteString(s[:first])
	for i := first; i < n; i += 3 {
		b.WriteByte(',')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

func makeLineContent(row int, tick int, cols int) string {
	v := uint32(tick*1103515245 + row*12345)
	return padTo(fmt.Sprintf("row=%02d tick=%d v=%x", row, tick, v), cols)
}

func makeStaticLine(row int, cols int) string {
	return padTo(fmt.Sprintf("row=%02d static", row), cols)
}

func cellValue(row int, col int, tick int, hotRow int, hotCol int) string {
	if row == hotRow && col == hotCol {
		return fmt.Sprintf("v=%d", tick)
	}
	return fmt.Sprintf("r%dc%d", row, col)
}

func tableLines(rows int, cols int, tick int) []string {
	hotRow := safeMod(tick, rows)
	hotCol := safeMod(tick, cols)
	lines := make([]string, 0, rows+2)

	headerCells := make([]string, 0, cols)
	for c := 0; c < cols; c++ {
		headerCells = append(headerCells, fmt.Sprintf("%-10s", fmt.Sprintf("C%d", c)))
	}
	header := strings.Join(headerCells, "")
	lines = append(lines, header)
	lines = append(lines, strings.Repeat("-", minInt(120, len([]rune(header)))))

	for r := 0; r < rows; r++ {
		cells := make([]string, 0, cols)
		for c := 0; c < cols; c++ {
			cells = append(cells, fmt.Sprintf("%-10s", cellValue(r, c, tick, hotRow, hotCol)))
		}
		line := strings.Join(cells, "")
		r := []rune(line)
		if len(r) > 120 {
			line = string(r[:120])
		}
		lines = append(lines, line)
	}
	return lines
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func tableUpdateCellValue(r int, c int, tick int) string {
	v := safeMod(tick+r*131+c*17, 10_000)
	wide := safeMod(tick+r+c, 13) == 0
	if wide {
		return fmt.Sprintf("val=%04d (row=%d)", v, r)
	}
	return strconv.Itoa(v)
}

func terminalScreenTransitionLines(tick int, params map[string]string) []string {
	rows := intParam(params, "rows", 40)
	cols := intParam(params, "cols", 120)
	mode := safeMod(tick, 3)
	lines := make([]string, 0, rows)

	if mode == 0 {
		lines = append(lines, clipPad("terminal-screen-transition [dashboard]", cols))
		for i := 0; i < rows-1; i++ {
			v := float64(safeMod(tick*37+i*97, 1000)) / 1000.0
			lines = append(lines, clipPad(fmt.Sprintf("svc-%02d %s %.1f%%", i, bar(v, 24), v*100.0), cols))
		}
		return lines
	}

	if mode == 1 {
		lines = append(lines, clipPad("terminal-screen-transition [table]", cols))
		lines = append(lines, clipPad("ID        NAME                 STATE     LAT(ms)   ERR", cols))
		for i := 0; i < rows-2; i++ {
			id := fmt.Sprintf("node-%03d", safeMod(tick+i, 512))
			state := "healthy "
			if safeMod(tick+i, 7) == 0 {
				state = "degraded"
			}
			lat := 10 + safeMod(tick*13+i*7, 190)
			errText := "no "
			if safeMod(tick+i*3, 53) == 0 {
				errText = "yes"
			}
			lines = append(lines, clipPad(fmt.Sprintf("%-8s service-%03d        %-8s %7d   %s", id, i, state, lat, errText), cols))
		}
		return lines
	}

	lines = append(lines, clipPad("terminal-screen-transition [logs]", cols))
	for i := 0; i < rows-1; i++ {
		level := []string{"INFO", "WARN", "ERROR"}[safeMod(tick+i, 3)]
		code := safeMod(tick*97+i*31, 10_000)
		lines = append(lines, clipPad(fmt.Sprintf("%s t=%d i=%d code=%04d message=frame-transition", level, tick, i, code), cols))
	}
	return lines
}

func terminalFpsStreamLines(tick int, params map[string]string) []string {
	rows := intParam(params, "rows", 40)
	cols := intParam(params, "cols", 120)
	channels := intParam(params, "channels", 12)
	lines := make([]string, 0, rows)

	lines = append(lines, clipPad(fmt.Sprintf("terminal-fps-stream tick=%d target=60fps channels=%d", tick, channels), cols))
	for i := 0; i < channels && len(lines) < rows; i++ {
		base := 0.5 + 0.45*math.Sin(float64(tick+i*7)/8.0)
		spike := 0.0
		if safeMod(tick+i*17, 23) == 0 {
			spike = 0.4
		}
		value := math.Min(1.0, base+spike)
		lines = append(lines, clipPad(fmt.Sprintf("ch-%02d %s %5.1f%%", i, bar(value, 24), value*100.0), cols))
	}

	for len(lines) < rows {
		spark := make([]string, 0, 16)
		for j := 0; j < 16; j++ {
			v := safeMod(tick*3+len(lines)*7+j*11, 10)
			spark = append(spark, strconv.Itoa(v))
		}
		lines = append(lines, clipPad(strings.Join(spark, ""), cols))
	}
	return lines
}

func terminalInputLatencyLines(tick int, params map[string]string) []string {
	rows := intParam(params, "rows", 40)
	cols := intParam(params, "cols", 120)
	lines := make([]string, 0, rows)

	lines = append(lines, clipPad("terminal-input-latency synthetic-key-event -> frame", cols))
	for i := 0; i < rows-1; i++ {
		latencyMs := 1 + safeMod(tick*19+i*13, 20)
		queueDepth := safeMod(tick+i*5, 9)
		focus := "blurred"
		if safeMod(tick+i, 4) == 0 {
			focus = "focused"
		}
		lines = append(lines, clipPad(fmt.Sprintf("evt=%04d key=%s latency=%2dms queue=%d", tick*rows+i, focus, latencyMs, queueDepth), cols))
	}
	return lines
}

func terminalMemorySoakLines(tick int, params map[string]string) []string {
	rows := intParam(params, "rows", 40)
	cols := intParam(params, "cols", 120)
	lines := make([]string, 0, rows)

	lines = append(lines, clipPad(fmt.Sprintf("terminal-memory-soak tick=%d", tick), cols))
	for i := 0; i < rows-1; i++ {
		size := 32 + safeMod(tick*11+i*29, 512)
		ref := safeMod(tick*17+i*7, 97)
		lines = append(lines, clipPad(fmt.Sprintf("pool[%02d] size=%4dKiB refs=%2d checksum=%08x", i, size, ref, tick*rows+i), cols))
	}
	return lines
}

func benchmarkLines(items int, seed int, cols int) []string {
	lines := make([]string, 0, items+2)
	lines = append(lines, clipPad(fmt.Sprintf("Benchmark: %d items (#%d)", items, seed), cols))
	lines = append(lines, clipPad(fmt.Sprintf("Total: %d  Page 1", items), cols))
	for i := 0; i < items; i++ {
		lines = append(lines, clipPad(fmt.Sprintf("%d. Item %d details", i, i), cols))
	}
	return lines
}

func rerenderLines(count int, cols int) []string {
	return []string{
		clipPad("Counter Benchmark", cols),
		clipPad(fmt.Sprintf("Count: %d  [+1]  [-1]", count), cols),
		clipPad(fmt.Sprintf("Last updated: iteration %d", count), cols),
	}
}

func contentUpdateLines(selected int, cols int) []string {
	lines := make([]string, 0, contentUpdateListSize+1)
	lines = append(lines, clipPad(fmt.Sprintf("Files  %d items  Selected: %d", contentUpdateListSize, selected), cols))
	for i := 0; i < contentUpdateListSize; i++ {
		marker := " "
		if i == selected {
			marker = ">"
		}
		lines = append(lines, clipPad(fmt.Sprintf("%s %3d. entry-%d.log %s B", marker, i, i, formatWithCommas(i*1024+512)), cols))
	}
	return lines
}

func layoutStressLines(rows int, cols int, tick int, termCols int) []string {
	lines := []string{clipPad("Layout stress", termCols), clipPad(fmt.Sprintf("tick=%d", tick), termCols)}
	for r := 0; r < rows; r++ {
		labels := make([]string, 0, cols)
		values := make([]string, 0, cols)
		for c := 0; c < cols; c++ {
			v := safeMod(tick+r*31+c*17, 1000)
			wide := safeMod(tick+r+c, 7) == 0
			value := fmt.Sprintf("v=%d", v)
			if wide {
				value = fmt.Sprintf("value=%d (%04d)", v, v)
			}
			labels = append(labels, fmt.Sprintf("C%d", c))
			values = append(values, value)
		}
		lines = append(lines, clipPad(strings.Join(labels, " | "), termCols))
		lines = append(lines, clipPad(strings.Join(values, " | "), termCols))
	}
	return lines
}

func scrollStressLines(items int, active int, tick int, cols int) []string {
	lines := []string{
		clipPad("Scroll stress (non-virtualized)", cols),
		clipPad(fmt.Sprintf("items=%d active=%d tick=%d", items, active, tick), cols),
	}
	for i := 0; i < items; i++ {
		marker := " "
		if i == active {
			marker = "▶"
		}
		lines = append(lines, clipPad(fmt.Sprintf("%5d %s Item %d v=%d", i, marker, i, safeMod(tick+i*17, 1000)), cols))
	}
	return lines
}

func virtualListLines(totalItems int, viewport int, tick int, cols int) []string {
	offset := safeMod(tick, totalItems-viewport)
	end := minInt(totalItems, offset+viewport)
	lines := []string{
		clipPad("Virtual list", cols),
		clipPad(fmt.Sprintf("total=%d viewport=%d offset=%d tick=%d", totalItems, viewport, offset, tick), cols),
	}
	for i := offset; i < end; i++ {
		lines = append(lines, clipPad(fmt.Sprintf("%6d • Item %d v=%d", i, i, safeMod(tick+i*97, 1000)), cols))
	}
	return lines
}

func tablesLines(rows int, cols int, tick int, termCols int) []string {
	lines := []string{
		clipPad("Table update", termCols),
		clipPad(fmt.Sprintf("rows=%d cols=%d tick=%d", rows, cols, tick), termCols),
	}
	header := make([]string, 0, cols+1)
	header = append(header, "row")
	for c := 0; c < cols; c++ {
		header = append(header, fmt.Sprintf("Col %d", c))
	}
	lines = append(lines, clipPad(strings.Join(header, "  "), termCols))

	for r := 0; r < rows; r++ {
		cells := make([]string, 0, cols)
		for c := 0; c < cols; c++ {
			cells = append(cells, tableUpdateCellValue(r, c, tick))
		}
		lines = append(lines, clipPad(fmt.Sprintf("%4d  %s", r, strings.Join(cells, "  ")), termCols))
	}
	return lines
}

func memoryProfileLines(tick int, cols int) []string {
	pct := safeMod(tick, 100)
	filled := pct / 5
	barText := fmt.Sprintf("[%s%s] %d%%", strings.Repeat("#", filled), strings.Repeat(".", 20-filled), pct)
	lines := []string{clipPad(fmt.Sprintf("Iteration %d", tick), cols), clipPad(barText, cols)}
	for j := 0; j < 20; j++ {
		lines = append(lines, clipPad(fmt.Sprintf("  Line %d: value=%d", j, tick*20+j), cols))
	}
	return lines
}

func terminalRerenderLines(tick int, cols int) []string {
	return []string{
		clipPad("terminal-rerender", cols),
		clipPad(fmt.Sprintf("tick=%d", tick), cols),
	}
}

func terminalVirtualListLines(totalItems int, viewport int, tick int, cols int) []string {
	offset := safeMod(tick, totalItems-viewport)
	end := minInt(totalItems, offset+viewport)
	lines := []string{
		clipPad("terminal-virtual-list", cols),
		clipPad(fmt.Sprintf("total=%d viewport=%d offset=%d tick=%d", totalItems, viewport, offset, tick), cols),
	}
	for i := offset; i < end; i++ {
		active := i == offset+safeMod(tick, viewport)
		suffix := ""
		if active {
			suffix = " <"
		}
		lines = append(lines, clipPad(fmt.Sprintf("%6d • Item %d v=%d%s", i, i, safeMod(tick+i*97, 1000), suffix), cols))
	}
	return lines
}

func scenarioLines(
	scenario string,
	params map[string]string,
	tick int,
	cols int,
) []string {
	switch scenario {
	case "startup":
		return benchmarkLines(startupTreeSize, tick, cols)
	case "tree-construction":
		return benchmarkLines(intParam(params, "items", 100), tick, cols)
	case "rerender":
		return rerenderLines(tick, cols)
	case "content-update":
		return contentUpdateLines(safeMod(tick, contentUpdateListSize), cols)
	case "layout-stress":
		return layoutStressLines(intParam(params, "rows", 40), intParam(params, "cols", 4), tick, cols)
	case "scroll-stress":
		items := intParam(params, "items", 2000)
		return scrollStressLines(items, safeMod(tick, items), tick, cols)
	case "virtual-list":
		return virtualListLines(intParam(params, "items", 100000), intParam(params, "viewport", 40), tick, cols)
	case "tables":
		return tablesLines(intParam(params, "rows", 100), intParam(params, "cols", 8), tick, cols)
	case "memory-profile":
		return memoryProfileLines(tick, cols)
	case "terminal-rerender":
		return terminalRerenderLines(tick, cols)
	case "terminal-frame-fill":
		rows := intParam(params, "rows", 40)
		dirtyLines := intParam(params, "dirtyLines", 1)
		lines := make([]string, 0, rows)
		for r := 0; r < rows; r++ {
			if r < dirtyLines {
				lines = append(lines, makeLineContent(r, tick, cols))
			} else {
				lines = append(lines, makeStaticLine(r, cols))
			}
		}
		return lines
	case "terminal-virtual-list":
		return terminalVirtualListLines(intParam(params, "items", 100000), intParam(params, "viewport", 40), tick, cols)
	case "terminal-table":
		base := tableLines(intParam(params, "rows", 40), intParam(params, "cols", 8), tick)
		lines := make([]string, 0, len(base))
		for _, ln := range base {
			lines = append(lines, clipPad(ln, cols))
		}
		return lines
	case "terminal-screen-transition":
		return terminalScreenTransitionLines(tick, params)
	case "terminal-fps-stream":
		return terminalFpsStreamLines(tick, params)
	case "terminal-input-latency":
		return terminalInputLatencyLines(tick, params)
	case "terminal-memory-soak":
		return terminalMemorySoakLines(tick, params)
	default:
		return []string{clipPad(fmt.Sprintf("unsupported Bubble Tea scenario: %s", scenario), cols)}
	}
}

func scenarioViewportRows(scenario string, params map[string]string) int {
	switch scenario {
	case "startup":
		return maxInt(40, startupTreeSize+5)
	case "tree-construction":
		return maxInt(40, intParam(params, "items", 100)+5)
	case "content-update":
		return 540
	default:
		return 40
	}
}

func scenarioViewportCols() int {
	return 120
}

func usesEventLoopScheduling(scenario string) bool {
	return scenario == "terminal-input-latency"
}

func runStartupBench(args cliArgs) (benchResultData, error) {
	rows := scenarioViewportRows(args.scenario, args.params)
	cols := scenarioViewportCols()

	runIteration := func(seed int) (float64, int64, error) {
		writer := newMeasuringWriter(os.Stdout)
		session, err := startBenchSession(args.scenario, args.params, rows, cols, writer)
		if err != nil {
			return 0, 0, err
		}

		start := time.Now()
		err = session.renderTick(seed, false)
		elapsed := msSince(start)
		bytesWritten, _ := writer.snapshot()
		closeErr := session.close()

		if err != nil {
			return 0, 0, err
		}
		if closeErr != nil {
			return 0, 0, closeErr
		}
		return elapsed, bytesWritten, nil
	}

	for i := 0; i < args.warmup; i++ {
		if _, _, err := runIteration(i + 1); err != nil {
			return benchResultData{}, err
		}
	}

	tryGC()
	memBefore := takeMemory()
	cpuBefore := takeCPU()
	memPeak := memBefore

	samples := make([]float64, 0, args.iterations)
	var bytesWritten int64
	start := time.Now()

	for i := 0; i < args.iterations; i++ {
		elapsed, bytesNow, err := runIteration(args.warmup + i + 1)
		if err != nil {
			return benchResultData{}, err
		}
		samples = append(samples, elapsed)
		bytesWritten += bytesNow

		if i%50 == 49 {
			memPeak = peakMemory(memPeak, takeMemory())
		}
	}

	totalWallMs := msSince(start)
	cpuAfter := takeCPU()
	memAfter := takeMemory()
	memPeak = peakMemory(memPeak, memAfter)
	cpu := diffCPU(cpuBefore, cpuAfter)

	return benchResultData{
		SamplesMs:    samples,
		TotalWallMs:  totalWallMs,
		CPUUserMs:    cpu.userMs,
		CPUSysMs:     cpu.systemMs,
		RSSBeforeKb:  memBefore.rssKb,
		RSSAfterKb:   memAfter.rssKb,
		RSSPeakKb:    memPeak.rssKb,
		HeapBeforeKb: memBefore.heapUsedKb,
		HeapAfterKb:  memAfter.heapUsedKb,
		HeapPeakKb:   memPeak.heapUsedKb,
		BytesWritten: bytesWritten,
		Frames:       args.iterations,
	}, nil
}

func runSteadyStateBench(args cliArgs) (benchResultData, error) {
	rows := scenarioViewportRows(args.scenario, args.params)
	cols := scenarioViewportCols()
	writer := newMeasuringWriter(os.Stdout)

	session, err := startBenchSession(args.scenario, args.params, rows, cols, writer)
	if err != nil {
		return benchResultData{}, err
	}
	closed := false
	defer func() {
		if !closed {
			_ = session.close()
		}
	}()

	renderTickDirect := func(tick int) error {
		return session.renderTick(tick, false)
	}
	renderTick := func(tick int) error {
		if usesEventLoopScheduling(args.scenario) {
			return session.renderTick(tick, true)
		}
		return renderTickDirect(tick)
	}

	if err := renderTickDirect(0); err != nil {
		return benchResultData{}, err
	}
	for i := 0; i < args.warmup; i++ {
		if err := renderTick(i + 1); err != nil {
			return benchResultData{}, err
		}
	}

	tryGC()
	memBefore := takeMemory()
	cpuBefore := takeCPU()
	memPeak := memBefore

	bytesBase, _ := writer.snapshot()
	samples := make([]float64, 0, args.iterations)
	start := time.Now()

	for i := 0; i < args.iterations; i++ {
		ts := time.Now()
		if err := renderTick(args.warmup + i + 1); err != nil {
			return benchResultData{}, err
		}
		samples = append(samples, msSince(ts))
		if i%100 == 99 {
			memPeak = peakMemory(memPeak, takeMemory())
		}
	}

	totalWallMs := msSince(start)
	cpuAfter := takeCPU()
	memAfter := takeMemory()
	memPeak = peakMemory(memPeak, memAfter)
	cpu := diffCPU(cpuBefore, cpuAfter)
	bytesAfter, _ := writer.snapshot()

	if err := session.close(); err != nil {
		return benchResultData{}, err
	}
	closed = true

	return benchResultData{
		SamplesMs:    samples,
		TotalWallMs:  totalWallMs,
		CPUUserMs:    cpu.userMs,
		CPUSysMs:     cpu.systemMs,
		RSSBeforeKb:  memBefore.rssKb,
		RSSAfterKb:   memAfter.rssKb,
		RSSPeakKb:    memPeak.rssKb,
		HeapBeforeKb: memBefore.heapUsedKb,
		HeapAfterKb:  memAfter.heapUsedKb,
		HeapPeakKb:   memPeak.heapUsedKb,
		BytesWritten: bytesAfter - bytesBase,
		Frames:       args.iterations,
	}, nil
}

func runBench(args cliArgs) (benchResultData, error) {
	if args.ioMode != "pty" {
		return benchResultData{}, errors.New("Bubble Tea benchmarks require --io pty")
	}
	if args.scenario == "startup" {
		return runStartupBench(args)
	}
	return runSteadyStateBench(args)
}

func emit(resultPath string, payload benchResultFile) {
	serialized, _ := json.Marshal(payload)
	if resultPath != "" {
		_ = os.WriteFile(resultPath, serialized, 0o644)
		return
	}
	_, _ = os.Stdout.Write(append(serialized, '\n'))
}

func main() {
	args, err := parseArgs(os.Args)
	if err != nil {
		emit("", benchResultFile{OK: false, Error: err.Error()})
		os.Exit(1)
	}

	data, err := runBench(args)
	if err != nil {
		emit(args.resultPath, benchResultFile{OK: false, Error: err.Error()})
		os.Exit(1)
	}

	emit(args.resultPath, benchResultFile{OK: true, Data: &data})
}

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
	"github.com/charmbracelet/lipgloss"
)

const (
	startupTreeSize       = 50
	contentUpdateListSize = 500
)

type cliArgs struct {
	scenario   string
	warmup     int
	iterations int
	fps        int
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
	SamplesMs    []float64 `json:"samplesMs"`
	TotalWallMs  float64   `json:"totalWallMs"`
	CPUUserMs    float64   `json:"cpuUserMs"`
	CPUSysMs     float64   `json:"cpuSysMs"`
	RSSBeforeKb  int64     `json:"rssBeforeKb"`
	RSSAfterKb   int64     `json:"rssAfterKb"`
	RSSPeakKb    int64     `json:"rssPeakKb"`
	HeapBeforeKb int64     `json:"heapBeforeKb"`
	HeapAfterKb  int64     `json:"heapAfterKb"`
	HeapPeakKb   int64     `json:"heapPeakKb"`
	BytesWritten int64     `json:"bytesWritten"`
	Frames       int       `json:"frames"`
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
		fps:        1000,
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
		case "fps":
			n, err := strconv.Atoi(value)
			if err != nil {
				return out, fmt.Errorf("invalid --fps: %w", err)
			}
			out.fps = n
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
	if out.fps <= 0 {
		return out, errors.New("--fps must be > 0")
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
	fps int,
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
		tea.WithFPS(fps),
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

func fullUiPaneWidths(cols int) (int, int, int) {
	left := maxInt(22, int(float64(cols)*0.24))
	right := maxInt(24, int(float64(cols)*0.28))
	center := maxInt(24, cols-left-right-6)
	return left, center, right
}

func paneLine(cols int, leftW int, centerW int, rightW int, left string, center string, right string) string {
	return clipPad(fmt.Sprintf("%s │ %s │ %s", clipPad(left, leftW), clipPad(center, centerW), clipPad(right, rightW)), cols)
}

func spark(seed int, width int) string {
	if width <= 0 {
		return ""
	}
	var b strings.Builder
	b.Grow(width)
	for i := 0; i < width; i++ {
		if safeMod(seed+i*3, 7) > 2 {
			b.WriteByte('#')
		} else {
			b.WriteByte('.')
		}
	}
	return b.String()
}

func terminalFullUiLines(tick int, params map[string]string) []string {
	rows := maxInt(12, intParam(params, "rows", 40))
	cols := maxInt(80, intParam(params, "cols", 120))
	services := maxInt(12, intParam(params, "services", 24))
	leftW, centerW, rightW := fullUiPaneWidths(cols)
	modes := []string{"overview", "services", "deploy", "incidents"}
	mode := modes[safeMod(tick, len(modes))]
	navItems := []string{"Dashboard", "Services", "Deployments", "Incidents", "Queues", "Logs", "Audit", "Settings"}

	lines := make([]string, 0, rows)
	lines = append(lines, clipPad(fmt.Sprintf("terminal-full-ui mode=%s tick=%d", mode, tick), cols))
	lines = append(lines, clipPad(fmt.Sprintf("cluster=prod-us-east budget=16.6ms cpu=%d%% mem=%d%% qps=%d", 35+safeMod(tick*7, 40), 42+safeMod(tick*11, 49), 900+safeMod(tick*29, 1500)), cols))

	bodyRows := maxInt(1, rows-4)
	activeNav := safeMod(tick, len(navItems))
	visibleTableRows := maxInt(6, minInt(18, bodyRows-6))
	viewportOffset := safeMod(tick, maxInt(1, services-visibleTableRows+1))
	activeSvc := safeMod(tick, services)

	for r := 0; r < bodyRows; r++ {
		left := ""
		center := ""
		right := ""

		if r == 0 {
			left = "NAV"
		} else if r <= len(navItems) {
			idx := r - 1
			if idx == activeNav {
				left = fmt.Sprintf("> %s", navItems[idx])
			} else {
				left = fmt.Sprintf("  %s", navItems[idx])
			}
		} else if r == len(navItems)+1 {
			envs := []string{"prod", "stage", "dev"}
			regions := []string{"use1", "usw2", "euw1"}
			left = fmt.Sprintf("env=%s region=%s", envs[safeMod(tick, len(envs))], regions[safeMod(tick, len(regions))])
		} else if r == len(navItems)+2 {
			left = fmt.Sprintf("focus=svc-%03d alerts=%d", activeSvc, safeMod(tick*3, 19))
		} else {
			left = fmt.Sprintf("saved-view-%02d %s", safeMod(tick+r, 12), spark(tick+r, 10))
		}

		if r == 0 {
			center = "SERVICES"
		} else if r == 1 {
			center = "id      state      lat   rps   err"
		} else if r >= 2 && r < 2+visibleTableRows {
			svc := viewportOffset + (r - 2)
			degraded := safeMod(tick+svc*5, 17) == 0
			lat := 12 + safeMod(tick*13+svc*7, 180)
			rps := 100 + safeMod(tick*19+svc*37, 2500)
			errPct := float64(safeMod(tick+svc*11, 70)) / 10.0
			state := "healthy "
			if degraded {
				state = "degraded"
			}
			marker := " "
			if svc == activeSvc {
				marker = ">"
			}
			center = fmt.Sprintf("%s svc-%03d %s %3dms %4d %.1f%%", marker, svc, state, lat, rps, errPct)
		} else if r == 2+visibleTableRows {
			cpu := float64(safeMod(tick*17, 1000)) / 1000.0
			center = fmt.Sprintf("cpu %s %.1f%%  io %2d%%", bar(cpu, 20), cpu*100.0, 45+safeMod(tick*23, 50))
		} else if r == 3+visibleTableRows {
			mem := float64(safeMod(tick*31+211, 1000)) / 1000.0
			center = fmt.Sprintf("mem %s %.1f%%  gc %dms", bar(mem, 20), mem*100.0, safeMod(tick*97, 999))
		} else if r == 4+visibleTableRows {
			center = fmt.Sprintf("queue depth=%d retries=%d dropped=%d", safeMod(tick*7, 180), safeMod(tick*11, 37), safeMod(tick*13, 9))
		} else {
			center = fmt.Sprintf("timeline %s", spark(tick*3+r, maxInt(16, centerW-10)))
		}

		if r == 0 {
			right = "INSPECTOR"
		} else if r == 1 {
			right = fmt.Sprintf("service=svc-%03d owner=team-%d", activeSvc, safeMod(activeSvc, 7))
		} else if r == 2 {
			right = fmt.Sprintf("slo p95<120ms  now=%dms", 45+safeMod(tick*5+activeSvc*3, 110))
		} else if r == 3 {
			deploy := "canary"
			if safeMod(tick*3+activeSvc, 2) == 0 {
				deploy = "green"
			}
			right = fmt.Sprintf("deploy=%s zone=az-%d", deploy, safeMod(activeSvc, 3)+1)
		} else {
			seq := tick*bodyRows + r
			level := "INFO "
			if safeMod(seq, 19) == 0 {
				level = "ERROR"
			} else if safeMod(seq, 11) == 0 {
				level = "WARN "
			}
			right = fmt.Sprintf("%s t+%05d op=%02d msg=event-%d", level, seq, safeMod(seq*7, 97), seq)
		}

		lines = append(lines, paneLine(cols, leftW, centerW, rightW, left, center, right))
	}

	lines = append(lines, clipPad(fmt.Sprintf("status=online conn=%d sync=%d pending=%d diff=%d", 1200+safeMod(tick*17, 800), safeMod(tick*29, 9999), safeMod(tick*5, 48), safeMod(tick*7, 21)), cols))
	lines = append(lines, clipPad("hotkeys: [1]overview [2]services [3]deploy [4]incidents [/]filter [enter]open [q]quit", cols))
	if len(lines) > rows {
		return lines[:rows]
	}
	return lines
}

func terminalFullUiNavigationLines(tick int, params map[string]string) []string {
	rows := maxInt(12, intParam(params, "rows", 40))
	cols := maxInt(80, intParam(params, "cols", 120))
	services := maxInt(10, intParam(params, "services", 24))
	dwell := maxInt(2, intParam(params, "dwell", 8))
	pages := []string{"overview", "services", "deployments", "incidents", "logs", "command"}
	pageIndex := safeMod(tick/dwell, len(pages))
	page := pages[pageIndex]
	localTick := safeMod(tick, dwell)

	lines := make([]string, 0, rows)
	lines = append(lines, clipPad(fmt.Sprintf("terminal-full-ui-navigation page=%s tick=%d local=%d/%d", page, tick, localTick, dwell-1), cols))
	tabParts := make([]string, 0, len(pages))
	for i, p := range pages {
		if i == pageIndex {
			tabParts = append(tabParts, fmt.Sprintf("[%s]", p))
		} else {
			tabParts = append(tabParts, p)
		}
	}
	lines = append(lines, clipPad(fmt.Sprintf("tabs: %s", strings.Join(tabParts, " | ")), cols))

	bodyRows := maxInt(1, rows-4)
	for i := 0; i < bodyRows; i++ {
		line := ""

		switch page {
		case "overview":
			if i == 0 {
				line = "overview: global health + throughput + alerts"
			} else if i <= 8 {
				svc := i - 1
				healthy := safeMod(tick+svc*5, 9) != 0
				v := float64(safeMod(tick*23+svc*41, 1000)) / 1000.0
				state := "degraded"
				if healthy {
					state = "healthy "
				}
				line = fmt.Sprintf("card svc-%02d %s %s %.1f%%", svc, state, bar(v, 24), v*100.0)
			} else if i == 9 {
				line = fmt.Sprintf("alerts open=%d acked=%d muted=%d", safeMod(tick*3, 11), safeMod(tick*7, 17), safeMod(tick*5, 5))
			} else {
				line = fmt.Sprintf("trend %s", spark(tick+i*3, maxInt(16, cols-10)))
			}
		case "services":
			if i == 0 {
				line = "services: inventory + selection + per-row telemetry"
			} else if i == 1 {
				line = "id      state      lat   rps   err"
			} else {
				row := i - 2
				svc := safeMod(tick+row, services)
				selected := row == safeMod(tick, maxInt(1, bodyRows-2))
				degraded := safeMod(tick+svc*3, 15) == 0
				lat := 10 + safeMod(tick*13+svc*9, 220)
				rps := 80 + safeMod(tick*17+svc*31, 3000)
				errPct := float64(safeMod(tick+svc*7, 80)) / 10.0
				state := "healthy "
				if degraded {
					state = "degraded"
				}
				marker := " "
				if selected {
					marker = ">"
				}
				line = fmt.Sprintf("%s svc-%03d %s %3dms %4d %.1f%%", marker, svc, state, lat, rps, errPct)
			}
		case "deployments":
			if i == 0 {
				line = "deployments: staged rollout + promotion gates"
			} else {
				step := safeMod(i, 12)
				pct := safeMod(tick*7+i*9, 101)
				gate := "ready  "
				if safeMod(tick+step, 5) == 0 {
					gate = "blocked"
				}
				canary := "off"
				if safeMod(tick+step, 2) == 0 {
					canary = "on"
				}
				line = fmt.Sprintf("pipeline-%02d %s %s %3d%% canary=%s", step, gate, bar(float64(pct)/100.0, 18), pct, canary)
			}
		case "incidents":
			if i == 0 {
				line = "incidents: queue + assignee + response status"
			} else {
				incident := tick*bodyRows + i
				sev := "sev3"
				if safeMod(incident, 13) == 0 {
					sev = "sev1"
				} else if safeMod(incident, 7) == 0 {
					sev = "sev2"
				}
				state := "open      "
				if safeMod(incident, 5) == 0 {
					state = "mitigating"
				} else if safeMod(incident, 3) == 0 {
					state = "triaging  "
				}
				line = fmt.Sprintf("%s inc-%04d %s owner=oncall-%d age=%dm", sev, safeMod(incident, 10000), state, safeMod(incident, 9), safeMod(incident*3, 180))
			}
		case "logs":
			seq := tick*bodyRows + i
			level := "INFO "
			if safeMod(seq, 17) == 0 {
				level = "ERROR"
			} else if safeMod(seq, 9) == 0 {
				level = "WARN "
			}
			line = fmt.Sprintf("%s trace=%05d shard=%d msg=stream-%d", level, safeMod(seq*19, 100000), safeMod(seq, 12), seq)
		default:
			if i < 2 {
				line = "command palette: type to filter actions"
			} else if i < 10 {
				cmd := i - 2
				selected := cmd == safeMod(tick, 8)
				marker := " "
				if selected {
					marker = ">"
				}
				preview := "risky"
				if safeMod(tick+cmd, 2) == 0 {
					preview = "safe"
				}
				line = fmt.Sprintf("%s /command-%02d target=svc-%03d preview=%s", marker, cmd, safeMod(tick+cmd, services), preview)
			} else {
				line = fmt.Sprintf("preview: %s", spark(tick*5+i, maxInt(16, cols-10)))
			}
		}

		lines = append(lines, clipPad(line, cols))
	}

	lines = append(lines, clipPad(fmt.Sprintf("route=%s navLatency=%dms commit=%d pending=%d", page, 1+safeMod(tick*7, 9), safeMod(tick*97, 10000), safeMod(tick*13, 33)), cols))
	lines = append(lines, clipPad("flow: [tab]next-page [shift+tab]prev-page [enter]open [esc]close [/]command [ctrl+c]quit", cols))
	if len(lines) > rows {
		return lines[:rows]
	}
	return lines
}

func strictPaneWidths(cols int) (int, int, int) {
	left := 24
	right := 32
	center := maxInt(28, cols-left-right-6)
	return left, center, right
}

func strictPaneLine(cols int, leftW int, centerW int, rightW int, left string, center string, right string) string {
	return clipPad(fmt.Sprintf("%s | %s | %s", clipPad(left, leftW), clipPad(center, centerW), clipPad(right, rightW)), cols)
}

func strictNavLines(page string, tick int) []string {
	tabs := []string{"dashboard", "services", "deploy", "incidents", "logs", "settings"}
	active := 0
	for i, tab := range tabs {
		if strings.HasPrefix(page, tab) || page == tab {
			active = i
			break
		}
	}
	lines := make([]string, 0, len(tabs)+2)
	for i, tab := range tabs {
		marker := " "
		if i == active {
			marker = ">"
		}
		lines = append(lines, fmt.Sprintf("%s %s", marker, tab))
	}
	lines = append(lines, fmt.Sprintf("env=%s region=%s", []string{"prod", "stage", "dev"}[safeMod(tick, 3)], []string{"use1", "usw2", "euw1"}[safeMod(tick, 3)]))
	lines = append(lines, fmt.Sprintf("window=%dm filter=%s", 15+safeMod(tick*7, 30), map[bool]string{true: "on", false: "off"}[safeMod(tick, 2) == 0]))
	return lines
}

func strictServiceLines(services int, tick int, rowBudget int) []string {
	lines := []string{"id      state      lat   rps   err"}
	viewportRows := maxInt(4, rowBudget-4)
	offset := safeMod(tick, maxInt(1, services-viewportRows+1))
	active := safeMod(tick, services)
	for r := 0; r < viewportRows; r++ {
		svc := offset + r
		degraded := safeMod(tick+svc*5, 17) == 0
		lat := 10 + safeMod(tick*13+svc*7, 220)
		rps := 80 + safeMod(tick*19+svc*37, 3000)
		errPct := float64(safeMod(tick+svc*11, 90)) / 10.0
		state := "healthy "
		if degraded {
			state = "degraded"
		}
		marker := " "
		if svc == active {
			marker = ">"
		}
		lines = append(lines, fmt.Sprintf("%s svc-%03d %s %3dms %4d %.1f%%", marker, svc, state, lat, rps, errPct))
	}
	cpu := float64(safeMod(tick*17, 1000)) / 1000.0
	mem := float64(safeMod(tick*31+211, 1000)) / 1000.0
	lines = append(lines, fmt.Sprintf("cpu %s %.1f%% io %2d%%", bar(cpu, 18), cpu*100.0, 30+safeMod(tick*11, 60)))
	lines = append(lines, fmt.Sprintf("mem %s %.1f%% gc %dms", bar(mem, 18), mem*100.0, safeMod(tick*97, 999)))
	lines = append(lines, fmt.Sprintf("queue=%d retry=%d drop=%d", safeMod(tick*7, 200), safeMod(tick*11, 40), safeMod(tick*13, 9)))
	return lines
}

func strictDeploymentLines(tick int, rowBudget int) []string {
	lines := []string{"pipeline rollout and gate state"}
	for i := 1; i < rowBudget; i++ {
		step := safeMod(i, 12)
		pct := safeMod(tick*7+i*9, 101)
		gate := "ready  "
		if safeMod(tick+step, 5) == 0 {
			gate = "blocked"
		}
		canary := "off"
		if safeMod(tick+step, 2) == 0 {
			canary = "on"
		}
		lines = append(lines, fmt.Sprintf("pipe-%02d %s %s %3d%% canary=%s", step, gate, bar(float64(pct)/100.0, 16), pct, canary))
	}
	return lines
}

func strictIncidentLines(tick int, rowBudget int) []string {
	lines := []string{"incident queue and ownership"}
	for i := 1; i < rowBudget; i++ {
		seq := tick*rowBudget + i
		sev := "sev3"
		if safeMod(seq, 13) == 0 {
			sev = "sev1"
		} else if safeMod(seq, 7) == 0 {
			sev = "sev2"
		}
		state := "open      "
		if safeMod(seq, 5) == 0 {
			state = "mitigating"
		} else if safeMod(seq, 3) == 0 {
			state = "triaging  "
		}
		lines = append(lines, fmt.Sprintf("%s inc-%04d %s owner=oncall-%d age=%dm", sev, safeMod(seq, 10000), state, safeMod(seq, 9), safeMod(seq*3, 180)))
	}
	return lines
}

func strictLogLines(tick int, rowBudget int) []string {
	lines := []string{"streamed logs"}
	for i := 1; i < rowBudget; i++ {
		seq := tick*rowBudget + i
		level := "INFO "
		if safeMod(seq, 17) == 0 {
			level = "ERROR"
		} else if safeMod(seq, 9) == 0 {
			level = "WARN "
		}
		lines = append(lines, fmt.Sprintf("%s trace=%05d shard=%d msg=event-%d", level, safeMod(seq*19, 100000), safeMod(seq, 12), seq))
	}
	return lines
}

func strictCommandLines(services int, tick int, rowBudget int) []string {
	lines := []string{"command palette actions"}
	for i := 1; i < rowBudget; i++ {
		cmd := i - 1
		selected := cmd == safeMod(tick, maxInt(1, rowBudget-1))
		preview := "risky"
		if safeMod(tick+cmd, 2) == 0 {
			preview = "safe"
		}
		marker := " "
		if selected {
			marker = ">"
		}
		lines = append(lines, fmt.Sprintf("%s /command-%02d target=svc-%03d preview=%s", marker, cmd, safeMod(tick+cmd, services), preview))
	}
	return lines
}

func strictRightLines(page string, tick int, rowBudget int) []string {
	lines := []string{
		fmt.Sprintf("page=%s focus=svc-%03d", page, safeMod(tick*3, 24)),
		fmt.Sprintf("slo p95<120ms now=%dms", 40+safeMod(tick*5, 120)),
		fmt.Sprintf("deploy=%s zone=az-%d", map[bool]string{true: "green", false: "canary"}[safeMod(tick, 2) == 0], safeMod(tick, 3)+1),
	}
	for i := 3; i < rowBudget; i++ {
		seq := tick*rowBudget + i
		level := "INFO "
		if safeMod(seq, 19) == 0 {
			level = "ERROR"
		} else if safeMod(seq, 11) == 0 {
			level = "WARN "
		}
		lines = append(lines, fmt.Sprintf("%s t+%05d op=%02d note=%s", level, seq, safeMod(seq*7, 97), spark(seq, 10)))
	}
	return lines
}

func strictFitLines(lines []string, target int) []string {
	if target <= 0 {
		return []string{}
	}
	if len(lines) >= target {
		return lines[:target]
	}
	for len(lines) < target {
		lines = append(lines, "")
	}
	return lines
}

func atOrEmpty(lines []string, idx int) string {
	if idx < 0 || idx >= len(lines) {
		return ""
	}
	return lines[idx]
}

type strictSections struct {
	rows       int
	cols       int
	header     string
	leftTitle  string
	leftLines  []string
	centerTitle string
	centerLines []string
	rightTitle string
	rightLines []string
	status     string
	footer     string
}

func buildStrictSections(tick int, params map[string]string, navigation bool) strictSections {
	rows := maxInt(16, intParam(params, "rows", 40))
	cols := maxInt(100, intParam(params, "cols", 120))
	services := maxInt(12, intParam(params, "services", 24))
	dwell := maxInt(2, intParam(params, "dwell", 8))
	pages := []string{"dashboard", "services", "deployments", "incidents", "logs", "commands"}
	page := "dashboard"
	if navigation {
		page = pages[safeMod(tick/dwell, len(pages))]
	}
	bodyRows := maxInt(4, rows-5)
	leftRows := maxInt(1, bodyRows-1)
	centerRows := maxInt(1, bodyRows-1)
	rightRows := maxInt(1, bodyRows-1)

	center := strictServiceLines(services, tick, centerRows)
	if navigation {
		switch page {
		case "deployments":
			center = strictDeploymentLines(tick, centerRows)
		case "incidents":
			center = strictIncidentLines(tick, centerRows)
		case "logs":
			center = strictLogLines(tick, centerRows)
		case "commands":
			center = strictCommandLines(services, tick, centerRows)
		default:
			center = strictServiceLines(services, tick, centerRows)
		}
	}

	header := fmt.Sprintf("terminal-strict-ui%s page=%s tick=%d", map[bool]string{true: "-navigation", false: ""}[navigation], page, tick)
	if !navigation {
		header = fmt.Sprintf("%s cpu=%d%% mem=%d%% qps=%d", header, 35+safeMod(tick*7, 40), 42+safeMod(tick*11, 49), 900+safeMod(tick*29, 1500))
	} else {
		header = fmt.Sprintf("%s local=%d/%d", header, safeMod(tick, dwell), dwell-1)
	}
	status := fmt.Sprintf("status=online conn=%d sync=%d pending=%d", 1200+safeMod(tick*17, 800), safeMod(tick*29, 9999), safeMod(tick*5, 48))
	if navigation {
		status = fmt.Sprintf("route=%s navLatency=%dms commit=%d pending=%d", page, 1+safeMod(tick*7, 9), safeMod(tick*97, 10000), safeMod(tick*13, 33))
	}
	footer := "keys: [tab] move [enter] open [/] command [q] quit"
	if navigation {
		footer = "flow: [tab] next-page [shift+tab] prev-page [enter] open [esc] close"
	}

	leftTitle := "NAV"
	if navigation {
		leftTitle = "NAVIGATION"
	}
	centerTitle := "SERVICES"
	if navigation {
		centerTitle = strings.ToUpper(page)
	}

	left := strictFitLines(strictNavLines(page, tick), leftRows)
	center = strictFitLines(center, centerRows)
	right := strictFitLines(strictRightLines(page, tick, rightRows), rightRows)

	return strictSections{
		rows:        rows,
		cols:        cols,
		header:      header,
		leftTitle:   leftTitle,
		leftLines:   left,
		centerTitle: centerTitle,
		centerLines: center,
		rightTitle:  "DETAILS",
		rightLines:  right,
		status:      status,
		footer:      footer,
	}
}

func strictPanelBlock(title string, lines []string, width int, height int) string {
	innerRows := maxInt(1, height-2)
	content := make([]string, 0, innerRows)
	content = append(content, lipgloss.NewStyle().Bold(true).Render(clipPad(title, maxInt(1, width-2))))
	content = append(content, lines...)
	content = strictFitLines(content, innerRows)
	if len(content) > innerRows {
		content = content[:innerRows]
	}
	return lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		Width(width).
		Height(height).
		Render(strings.Join(content, "\n"))
}

func strictFrameLines(sections strictSections) []string {
	headerHeight := 3
	footerHeight := 4
	bodyHeight := maxInt(3, sections.rows-headerHeight-footerHeight)
	leftWidth := 24
	rightWidth := 32
	centerWidth := maxInt(28, sections.cols-leftWidth-rightWidth)
	totalWidth := leftWidth + centerWidth + rightWidth
	if totalWidth != sections.cols {
		centerWidth += sections.cols - totalWidth
		if centerWidth < 12 {
			centerWidth = 12
		}
	}

	headerBox := lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		Width(sections.cols).
		Height(headerHeight).
		Render(clipPad(sections.header, maxInt(1, sections.cols-2)))

	leftPanel := strictPanelBlock(sections.leftTitle, sections.leftLines, leftWidth, bodyHeight)
	centerPanel := strictPanelBlock(sections.centerTitle, sections.centerLines, centerWidth, bodyHeight)
	rightPanel := strictPanelBlock(sections.rightTitle, sections.rightLines, rightWidth, bodyHeight)
	body := lipgloss.JoinHorizontal(lipgloss.Top, leftPanel, centerPanel, rightPanel)

	footerContent := strings.Join(
		[]string{
			clipPad(sections.status, maxInt(1, sections.cols-2)),
			clipPad(sections.footer, maxInt(1, sections.cols-2)),
		},
		"\n",
	)
	footerBox := lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		Width(sections.cols).
		Height(footerHeight).
		Render(footerContent)

	joined := lipgloss.JoinVertical(lipgloss.Left, headerBox, body, footerBox)
	rawLines := strings.Split(joined, "\n")
	lines := make([]string, 0, sections.rows)
	for i := 0; i < sections.rows; i++ {
		if i < len(rawLines) {
			lines = append(lines, clipPad(rawLines[i], sections.cols))
		} else {
			lines = append(lines, strings.Repeat(" ", sections.cols))
		}
	}
	return lines
}

func terminalStrictPaneLines(tick int, params map[string]string, navigation bool) []string {
	sections := buildStrictSections(tick, params, navigation)
	return strictFrameLines(sections)
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
	case "terminal-full-ui":
		return terminalFullUiLines(tick, params)
	case "terminal-full-ui-navigation":
		return terminalFullUiNavigationLines(tick, params)
	case "terminal-strict-ui":
		return terminalStrictPaneLines(tick, params, false)
	case "terminal-strict-ui-navigation":
		return terminalStrictPaneLines(tick, params, true)
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
		session, err := startBenchSession(args.scenario, args.params, rows, cols, args.fps, writer)
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

	session, err := startBenchSession(args.scenario, args.params, rows, cols, args.fps, writer)
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

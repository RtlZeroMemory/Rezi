function emit(line: string): void {
  process.stdout.write(`${line}\n`);
}

let buffer = "";
process.stdin.setEncoding("utf8");

emit(`size:${String(process.stdout.columns ?? 0)}x${String(process.stdout.rows ?? 0)}`);

process.on("SIGWINCH", () => {
  emit(`size:${String(process.stdout.columns ?? 0)}x${String(process.stdout.rows ?? 0)}`);
});

process.stdin.on("data", (chunk: string) => {
  buffer += chunk.replace(/\r/g, "\n");
  for (;;) {
    const idx = buffer.indexOf("\n");
    if (idx < 0) break;
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    emit(`input:${line}`);
    if (line === "quit") {
      process.exit(0);
    }
  }
});

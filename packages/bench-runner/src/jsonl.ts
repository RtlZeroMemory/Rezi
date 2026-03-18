import { readFileSync } from "node:fs";

export type JsonRecord = Readonly<Record<string, unknown>>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecordNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeReadJsonl(pathname: string): readonly JsonRecord[] {
  try {
    const text = readFileSync(pathname, "utf8");
    const records: JsonRecord[] = [];
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (isJsonRecord(parsed)) records.push(parsed);
      } catch {
        // Ignore malformed rows and keep scanning the rest of the file.
      }
    }
    return records;
  } catch {
    return [];
  }
}

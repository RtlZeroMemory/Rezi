import { readFileSync } from "node:fs";

export type JsonRecord = Readonly<Record<string, unknown>>;

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
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JsonRecord);
  } catch {
    return [];
  }
}

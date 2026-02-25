export type ReziBorderStyle = "none" | "single" | "double" | "rounded" | "heavy" | "dashed";

export function mapBorderStyle(
  inkStyle: string | Record<string, string> | undefined,
): ReziBorderStyle | undefined {
  if (!inkStyle) return undefined;
  if (typeof inkStyle === "object") return "single";

  const map: Record<string, ReziBorderStyle> = {
    single: "single",
    double: "double",
    round: "rounded",
    bold: "heavy",
    heavy: "heavy",
    singleDouble: "single",
    doubleSingle: "double",
    classic: "single",
    arrow: "single",
    dashed: "dashed",
    none: "none",
  };

  return map[inkStyle] ?? "single";
}

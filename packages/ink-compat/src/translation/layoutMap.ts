/**
 * Translate Ink's alignItems/justifyContent values to Rezi's names.
 */
export function mapAlign(
  value: string | undefined,
): "start" | "center" | "end" | "stretch" | undefined {
  if (!value) return undefined;

  const map: Record<string, "start" | "center" | "end" | "stretch"> = {
    "flex-start": "start",
    "flex-end": "end",
    center: "center",
    stretch: "stretch",
  };

  return map[value];
}

export function mapJustify(
  value: string | undefined,
): "start" | "end" | "center" | "between" | "around" | "evenly" | undefined {
  if (!value) return undefined;

  const map: Record<string, "start" | "end" | "center" | "between" | "around" | "evenly"> = {
    "flex-start": "start",
    "flex-end": "end",
    center: "center",
    "space-between": "between",
    "space-around": "around",
    "space-evenly": "evenly",
  };

  return map[value];
}

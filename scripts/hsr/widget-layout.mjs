const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MIN_COLS = 20;
const MIN_ROWS = 8;
const TINY_MAX_COLS = 63;
const TINY_MAX_ROWS = 17;
const FULL_MIN_COLS = 112;
const FULL_MIN_ROWS = 30;

function normalizeDimension(value, fallback, minimum) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  return rounded >= minimum ? rounded : minimum;
}

export function normalizeViewport(viewport) {
  const source = typeof viewport === "object" && viewport !== null ? viewport : {};
  const cols = normalizeDimension(source.cols, DEFAULT_COLS, MIN_COLS);
  const rows = normalizeDimension(source.rows, DEFAULT_ROWS, MIN_ROWS);
  return Object.freeze({ cols, rows });
}

export function resolveWidgetDemoLayout(viewport) {
  const normalized = normalizeViewport(viewport);
  const { cols, rows } = normalized;
  if (cols <= TINY_MAX_COLS || rows <= TINY_MAX_ROWS) return "tiny";
  if (cols < FULL_MIN_COLS || rows < FULL_MIN_ROWS) return "compact";
  return "full";
}

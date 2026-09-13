/**
 * Single source of truth for the project table grid.
 *
 * Header and rows share this template so the columns cannot drift apart; the
 * min width keeps the console readable on narrow screens by scrolling rather
 * than collapsing the data columns.
 */
export const PROJECT_GRID =
  "grid grid-cols-[4px_280px_160px_130px_190px_170px_180px_minmax(190px,1fr)] items-center";

export const PROJECT_GRID_MIN_WIDTH = "min-w-[1294px]";

export const PROJECT_CELL = "px-3.5 text-[13px]";

export const PROJECT_HEAD_CELL =
  "px-3.5 font-mono text-[10px] tracking-[0.09em] text-dim";

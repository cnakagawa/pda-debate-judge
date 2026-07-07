/**
 * PD Level 換算 — PDA提供の 内容（Matter）×表現（Manner）マトリクスの実装。
 *
 * PD Level は合計点では決まらず、内容・表現の2次元マトリクスで決まる
 * （例: 合計14点でも 7+7 は PD2、10+4 は PD5）。
 *
 * 領域定義（PDA提供マトリクスを正とする）:
 *   PD1: 内容≥9 かつ 表現≥9
 *   PD2: 内容≥7 かつ 表現≥7
 *   PD3: 内容≥6 かつ 表現≥6
 *   PD4: 内容≥5 かつ 表現≥5
 *   PD5: 内容≥3 かつ 表現≥3
 *   PD6: 内容1〜2 かつ 表現3〜5
 *   それ以外（表現≤2、内容0、内容1〜2かつ表現≥6）: 判定外（null）
 */

export type PdLevel = "PD1" | "PD2" | "PD3" | "PD4" | "PD5" | "PD6";

/** grid[manner][matter] → PD level or null. 11x11 (scores 0..10). */
export type PdLevelGrid = (PdLevel | null)[][];

function ruleBasedLevel(matter: number, manner: number): PdLevel | null {
  if (matter >= 9 && manner >= 9) return "PD1";
  if (matter >= 7 && manner >= 7) return "PD2";
  if (matter >= 6 && manner >= 6) return "PD3";
  if (matter >= 5 && manner >= 5) return "PD4";
  if (matter >= 3 && manner >= 3) return "PD5";
  if (matter >= 1 && matter <= 2 && manner >= 3 && manner <= 5) return "PD6";
  return null;
}

/** Build the full 11×11 grid (admin display / settings master default). */
export function buildDefaultPdLevelGrid(): PdLevelGrid {
  const grid: PdLevelGrid = [];
  for (let manner = 0; manner <= 10; manner++) {
    const row: (PdLevel | null)[] = [];
    for (let matter = 0; matter <= 10; matter++) {
      row.push(ruleBasedLevel(matter, manner));
    }
    grid.push(row);
  }
  return grid;
}

export const DEFAULT_PD_LEVEL_GRID: PdLevelGrid = buildDefaultPdLevelGrid();

/**
 * Look up the PD level. An explicit grid (from the settings master, admin-editable)
 * takes precedence; otherwise the default PDA matrix applies.
 */
export function pdLevelFor(
  matter: number,
  manner: number,
  grid?: PdLevelGrid,
): PdLevel | null {
  const m = Math.round(matter);
  const e = Math.round(manner);
  if (m < 0 || m > 10 || e < 0 || e > 10) return null;
  const g = grid ?? DEFAULT_PD_LEVEL_GRID;
  return g[e]?.[m] ?? null;
}

/** CEFR 対応（PDA提供の対応表、参考表示用） */
export const CEFR_REFERENCE: Record<PdLevel, string> = {
  PD1: "C1〜C2以上",
  PD2: "B2〜C2",
  PD3: "B1〜C1",
  PD4: "A2〜B1",
  PD5: "A1",
  PD6: "—",
};

export function cefrReferenceFor(level: PdLevel | null): string | null {
  if (!level) return null;
  return CEFR_REFERENCE[level];
}

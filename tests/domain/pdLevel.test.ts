import { describe, it, expect } from "vitest";
import {
  pdLevelFor,
  buildDefaultPdLevelGrid,
  cefrReferenceFor,
} from "@/src/domain/pdLevel";

describe("PD Level マトリクス（PDA提供の換算表）", () => {
  it("PD1: 内容≥9 かつ 表現≥9", () => {
    expect(pdLevelFor(9, 9)).toBe("PD1");
    expect(pdLevelFor(10, 10)).toBe("PD1");
    expect(pdLevelFor(10, 9)).toBe("PD1");
    expect(pdLevelFor(9, 8)).not.toBe("PD1");
  });

  it("PD2: 内容≥7 かつ 表現≥7（合計14でも7+7はPD2）", () => {
    expect(pdLevelFor(7, 7)).toBe("PD2");
    expect(pdLevelFor(8, 10)).toBe("PD2");
    expect(pdLevelFor(10, 8)).toBe("PD2");
  });

  it("PD3: 内容≥6 かつ 表現≥6", () => {
    expect(pdLevelFor(6, 6)).toBe("PD3");
    expect(pdLevelFor(6, 10)).toBe("PD3");
    expect(pdLevelFor(10, 6)).toBe("PD3");
  });

  it("PD4: 内容≥5 かつ 表現≥5", () => {
    expect(pdLevelFor(5, 5)).toBe("PD4");
    expect(pdLevelFor(5, 10)).toBe("PD4");
    expect(pdLevelFor(10, 5)).toBe("PD4");
  });

  it("PD5: 内容≥3 かつ 表現≥3（合計14でも10+4はPD5）", () => {
    expect(pdLevelFor(3, 3)).toBe("PD5");
    expect(pdLevelFor(10, 4)).toBe("PD5");
    expect(pdLevelFor(4, 10)).toBe("PD5");
    expect(pdLevelFor(10, 3)).toBe("PD5");
  });

  it("PD6: 内容1〜2 かつ 表現3〜5", () => {
    expect(pdLevelFor(1, 3)).toBe("PD6");
    expect(pdLevelFor(2, 5)).toBe("PD6");
    expect(pdLevelFor(2, 4)).toBe("PD6");
  });

  it("判定外（グレー領域）: 表現≤2 / 内容0 / 内容1〜2かつ表現≥6", () => {
    expect(pdLevelFor(10, 2)).toBeNull();
    expect(pdLevelFor(10, 0)).toBeNull();
    expect(pdLevelFor(0, 10)).toBeNull();
    expect(pdLevelFor(0, 0)).toBeNull();
    expect(pdLevelFor(2, 7)).toBeNull(); // マトリクスを正とする周辺領域
    expect(pdLevelFor(1, 10)).toBeNull();
  });

  it("マトリクス上の合計点表示と整合（対角の代表セル）", () => {
    // 添付マトリクスのセル値 = matter + manner を全域で確認
    const grid = buildDefaultPdLevelGrid();
    for (let manner = 0; manner <= 10; manner++) {
      for (let matter = 0; matter <= 10; matter++) {
        const level = grid[manner]![matter];
        if (level === "PD6") {
          expect(matter + manner).toBeGreaterThanOrEqual(4);
          expect(matter + manner).toBeLessThanOrEqual(7);
        }
        if (level === "PD1") {
          expect(matter + manner).toBeGreaterThanOrEqual(18);
        }
      }
    }
  });

  it("上位条件が優先される（9,9はPD2〜5の条件も満たすがPD1）", () => {
    expect(pdLevelFor(9, 9)).toBe("PD1");
    expect(pdLevelFor(7, 9)).toBe("PD2");
    expect(pdLevelFor(6, 7)).toBe("PD3");
  });

  it("範囲外入力はnull", () => {
    expect(pdLevelFor(-1, 5)).toBeNull();
    expect(pdLevelFor(5, 11)).toBeNull();
  });
});

describe("CEFR対応（参考）", () => {
  it("PD Level ごとの参考CEFR", () => {
    expect(cefrReferenceFor("PD1")).toBe("C1〜C2以上");
    expect(cefrReferenceFor("PD3")).toBe("B1〜C1");
    expect(cefrReferenceFor("PD5")).toBe("A1");
    expect(cefrReferenceFor(null)).toBeNull();
  });
});

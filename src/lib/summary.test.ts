import { describe, expect, it } from "vitest";
import { computeWeekSummary, UNCATEGORIZED_LABEL } from "./summary";
import type { Category, TimeEntry } from "../types";

function makeCategory(id: string, name: string, color = "#2564CF"): Category {
  return { id, name, color, archived: false, sortOrder: 0, createdAt: "2026-01-01T00:00:00" };
}

function makeEntry(
  id: string,
  categoryId: string | null,
  startAt: string,
  endAt: string,
): TimeEntry {
  return {
    id,
    title: `entry-${id}`,
    categoryId,
    startAt,
    endAt,
    memo: "",
    taskId: null,
    createdAt: startAt,
    updatedAt: startAt,
  };
}

describe("computeWeekSummary", () => {
  const dev = makeCategory("dev", "開発");
  const meeting = makeCategory("mtg", "会議", "#8764B8");

  it("カテゴリごとに合計し時間降順に並べる", () => {
    const entries = [
      makeEntry("1", "dev", "2026-07-02T09:00:00", "2026-07-02T10:00:00"),
      makeEntry("2", "mtg", "2026-07-02T10:00:00", "2026-07-02T13:00:00"),
      makeEntry("3", "dev", "2026-07-03T09:00:00", "2026-07-03T10:00:00"),
    ];
    const summary = computeWeekSummary(entries, [dev, meeting]);
    expect(summary.totalMinutes).toBe(300);
    expect(summary.byCategory[0].name).toBe("会議");
    expect(summary.byCategory[0].minutes).toBe(180);
    expect(summary.byCategory[1].minutes).toBe(120);
    expect(summary.byCategory[0].ratio).toBeCloseTo(0.6);
  });

  it("カテゴリなし・存在しないカテゴリは未分類に集計する", () => {
    const entries = [
      makeEntry("1", null, "2026-07-02T09:00:00", "2026-07-02T09:30:00"),
      makeEntry("2", "deleted-id", "2026-07-02T10:00:00", "2026-07-02T10:30:00"),
    ];
    const summary = computeWeekSummary(entries, [dev]);
    expect(summary.byCategory).toHaveLength(1);
    expect(summary.byCategory[0].name).toBe(UNCATEGORIZED_LABEL);
    expect(summary.byCategory[0].minutes).toBe(60);
  });

  it("エントリがなければ合計 0", () => {
    const summary = computeWeekSummary([], [dev]);
    expect(summary.totalMinutes).toBe(0);
    expect(summary.byCategory).toHaveLength(0);
  });

  it("開始 > 終了 の異常データは 0 分として扱う", () => {
    const entries = [makeEntry("1", "dev", "2026-07-02T10:00:00", "2026-07-02T09:00:00")];
    const summary = computeWeekSummary(entries, [dev]);
    expect(summary.totalMinutes).toBe(0);
  });
});

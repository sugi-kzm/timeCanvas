import { describe, expect, it } from "vitest";
import {
  buildCategoryHeatmaps,
  buildYearHeatmap,
  categoryEstimateFactors,
  compareEstimates,
  estimateAccuracy,
  heatmapLevel,
  minutesByDay,
  minutesByDayAndCategory,
} from "./analytics";
import type { Category, Task, TimeEntry } from "../types";

function makeEntry(
  id: string,
  startAt: string,
  endAt: string,
  categoryId: string | null = null,
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

function makeTask(
  id: string,
  estimateMinutes: number | null,
  status: Task["status"] = "todo",
  parentId: string | null = null,
  categoryId: string | null = null,
): Task {
  return {
    id,
    displayNo: 1,
    title: `task-${id}`,
    memo: "",
    categoryId,
    groupId: null,
    estimateMinutes,
    status,
    startDate: null,
    dueDate: null,
    parentId,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00",
    updatedAt: `2026-01-0${id.length}T00:00:00`,
    completedAt: null,
  };
}

describe("minutesByDay", () => {
  it("同じ日のエントリを合算する", () => {
    const map = minutesByDay([
      makeEntry("1", "2026-07-02T09:00:00", "2026-07-02T10:00:00"),
      makeEntry("2", "2026-07-02T13:00:00", "2026-07-02T13:30:00"),
      makeEntry("3", "2026-07-03T09:00:00", "2026-07-03T09:15:00"),
    ]);
    expect(map.get("2026-07-02")).toBe(90);
    expect(map.get("2026-07-03")).toBe(15);
  });
});

describe("heatmapLevel", () => {
  it("2時間刻みで 0-4 に段階分けする", () => {
    expect(heatmapLevel(0)).toBe(0);
    expect(heatmapLevel(60)).toBe(1);
    expect(heatmapLevel(120)).toBe(2);
    expect(heatmapLevel(300)).toBe(3);
    expect(heatmapLevel(360)).toBe(4);
  });
});

describe("buildYearHeatmap", () => {
  it("1/1 を含む週から 12/31 を含む週まで、各週7日で構成される", () => {
    const weeks = buildYearHeatmap(2026, new Map());
    // 2026-01-01 は木曜 → 最初の週は 2025-12-28(日) 始まり（既定は日曜始まり）
    expect(weeks[0][0].key).toBe("2025-12-28");
    expect(weeks[0][0].inYear).toBe(false);
    expect(weeks[0][4].key).toBe("2026-01-01");
    expect(weeks[0][4].inYear).toBe(true);
    for (const week of weeks) expect(week).toHaveLength(7);
    const last = weeks[weeks.length - 1];
    expect(last.some((c) => c.key === "2026-12-31")).toBe(true);
  });

  it("分数がレベルに反映される", () => {
    const weeks = buildYearHeatmap(2026, new Map([["2026-07-02", 400]]));
    const cell = weeks.flat().find((c) => c.key === "2026-07-02");
    expect(cell?.minutes).toBe(400);
    expect(cell?.level).toBe(4);
  });
});

describe("compareEstimates / estimateAccuracy", () => {
  it("チケット単位で子タスクの見積・実績をロールアップする", () => {
    const tasks = [
      makeTask("t1", null), // チケット自身に見積なし
      makeTask("c1", 60, "todo", "t1"),
      makeTask("c2", 60, "done", "t1"),
      makeTask("t2", null), // 見積なし → 除外
    ];
    const actual = new Map([
      ["t1", 30], // チケット直接の実績
      ["c1", 60],
      ["c2", 90],
    ]);
    const comparisons = compareEstimates(tasks, actual);
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].task.id).toBe("t1");
    expect(comparisons[0].isTicket).toBe(true);
    expect(comparisons[0].estimateMinutes).toBe(120);
    expect(comparisons[0].actualMinutes).toBe(180);
    expect(comparisons[0].ratio).toBeCloseTo(1.5);
  });

  it("estimateAccuracy は実績のある項目だけで全体比を出す", () => {
    const tasks = [makeTask("a", 120), makeTask("b", 60)];
    const comparisons = compareEstimates(tasks, new Map([["a", 120]]));
    const accuracy = estimateAccuracy(comparisons);
    expect(accuracy.taskCount).toBe(1);
    expect(accuracy.totalEstimate).toBe(120);
    expect(accuracy.overallRatio).toBeCloseTo(1.0);
  });

  it("実績ゼロのタスクは精度サマリーから除外する", () => {
    const comparisons = compareEstimates([makeTask("a", 120)], new Map());
    const accuracy = estimateAccuracy(comparisons);
    expect(accuracy.taskCount).toBe(0);
    expect(accuracy.overallRatio).toBeNull();
  });
});

describe("categoryEstimateFactors", () => {
  const dev: Category = {
    id: "dev",
    name: "開発",
    color: "#2564CF",
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00",
  };

  it("カテゴリごとに 実績合計/見積合計 の係数を出す", () => {
    const tasks = [
      makeTask("a", 60, "done", null, "dev"),
      makeTask("b", 120, "done", null, "dev"),
      makeTask("c", 60, "done", null, null), // 未分類
      makeTask("d", 60, "todo", null, "dev"), // 実績なし → 除外
    ];
    const actual = new Map([
      ["a", 90],
      ["b", 180],
      ["c", 30],
    ]);
    const factors = categoryEstimateFactors(tasks, actual, [dev]);
    expect(factors).toHaveLength(2);
    const devFactor = factors.find((f) => f.categoryId === "dev");
    expect(devFactor?.factor).toBeCloseTo(1.5); // (90+180)/(60+120)
    expect(devFactor?.itemCount).toBe(2);
    const none = factors.find((f) => f.categoryId === null);
    expect(none?.factor).toBeCloseTo(0.5);
  });

  it("対象がなければ空配列", () => {
    expect(categoryEstimateFactors([], new Map(), [dev])).toEqual([]);
  });
});

describe("minutesByDayAndCategory", () => {
  it("日付・カテゴリごとに分数を合算する", () => {
    const map = minutesByDayAndCategory([
      makeEntry("1", "2026-07-02T09:00:00", "2026-07-02T10:00:00", "dev"),
      makeEntry("2", "2026-07-02T13:00:00", "2026-07-02T13:30:00", "dev"),
      makeEntry("3", "2026-07-02T09:00:00", "2026-07-02T09:15:00", null),
    ]);
    const day = map.get("2026-07-02");
    expect(day?.get("dev")).toBe(90);
    expect(day?.get(null)).toBe(15);
  });
});

describe("buildCategoryHeatmaps", () => {
  const dev: Category = {
    id: "dev",
    name: "開発",
    color: "#2564CF",
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00",
  };

  it("使われているカテゴリごとにヒートマップを分けて作る", () => {
    const byDayCategory = minutesByDayAndCategory([
      makeEntry("1", "2026-07-02T09:00:00", "2026-07-02T10:00:00", "dev"),
      makeEntry("2", "2026-07-03T09:00:00", "2026-07-03T09:15:00", null),
    ]);
    const from = new Date(2026, 6, 1);
    const to = new Date(2026, 6, 8);
    const heatmaps = buildCategoryHeatmaps(from, to, byDayCategory, [dev]);
    expect(heatmaps.map((h) => h.categoryId).sort()).toEqual([null, "dev"].sort());
    const devHeatmap = heatmaps.find((h) => h.categoryId === "dev");
    const cell = devHeatmap?.weeks.flat().find((c) => c.key === "2026-07-02");
    expect(cell?.minutes).toBe(60);
    expect(cell?.level).toBe(1);
    const none = heatmaps.find((h) => h.categoryId === null);
    expect(none?.name).toBe("未分類");
  });

  it("記録がなければ空配列", () => {
    const from = new Date(2026, 6, 1);
    const to = new Date(2026, 6, 8);
    expect(buildCategoryHeatmaps(from, to, new Map(), [dev])).toEqual([]);
  });
});

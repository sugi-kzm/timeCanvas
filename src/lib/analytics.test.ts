import { describe, expect, it } from "vitest";
import {
  analyticsPeriodRange,
  buildCategoryHeatmaps,
  buildHourDowHeatmap,
  buildPeriodStackedBars,
  buildYearHeatmap,
  categoryEstimateFactors,
  compareEstimates,
  comparePeriods,
  estimateAccuracy,
  heatmapLevel,
  minutesByDay,
  minutesByDayAndCategory,
  previousPeriodAnchor,
  scaledHeatLevel,
} from "./analytics";
import type { Category, Task, TimeEntry } from "../types";

function makeCategory(id: string, name: string, color = "#123456"): Category {
  return {
    id,
    name,
    color,
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00",
  };
}

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

describe("analyticsPeriodRange / previousPeriodAnchor", () => {
  it("week は週の開始から7日間（to は排他的）", () => {
    const { from, to } = analyticsPeriodRange("week", new Date(2026, 6, 8), 0);
    expect(from).toEqual(new Date(2026, 6, 5)); // 日曜始まり
    expect(to).toEqual(new Date(2026, 6, 12));
  });

  it("month は月の1日から翌月1日まで（カレンダーの6週グリッドではない）", () => {
    const { from, to } = analyticsPeriodRange("month", new Date(2026, 6, 8), 0);
    expect(from).toEqual(new Date(2026, 6, 1));
    expect(to).toEqual(new Date(2026, 7, 1));
  });

  it("year は 1/1 から翌年 1/1 まで", () => {
    const { from, to } = analyticsPeriodRange("year", new Date(2026, 6, 8), 0);
    expect(from).toEqual(new Date(2026, 0, 1));
    expect(to).toEqual(new Date(2027, 0, 1));
  });

  it("previousPeriodAnchor: week は7日前、month は前月1日、year は前年1/1", () => {
    expect(previousPeriodAnchor("week", new Date(2026, 6, 8))).toEqual(new Date(2026, 6, 1));
    expect(previousPeriodAnchor("month", new Date(2026, 6, 8))).toEqual(new Date(2026, 5, 1));
    expect(previousPeriodAnchor("year", new Date(2026, 6, 8))).toEqual(new Date(2025, 0, 1));
  });
});

describe("buildPeriodStackedBars", () => {
  const cats = [makeCategory("c1", "開発", "#111111"), makeCategory("c2", "学習", "#222222")];

  it("week は週始まり順の7本で、カテゴリ別に積み上がる", () => {
    const bars = buildPeriodStackedBars(
      "week",
      new Date(2026, 6, 8),
      0,
      [
        makeEntry("1", "2026-07-06T09:00:00", "2026-07-06T10:00:00", "c1"),
        makeEntry("2", "2026-07-06T13:00:00", "2026-07-06T13:30:00", "c2"),
        makeEntry("3", "2026-07-07T09:00:00", "2026-07-07T11:00:00", "c1"),
      ],
      cats,
    );
    expect(bars).toHaveLength(7);
    expect(bars[0].key).toBe("2026-07-05");
    const monday = bars[1];
    expect(monday.totalMinutes).toBe(90);
    expect(monday.segments.map((s) => s.minutes)).toEqual([60, 30]); // 分の降順
    expect(monday.segments[0].name).toBe("開発");
    expect(bars[2].totalMinutes).toBe(120);
  });

  it("month はその月の日数分のバーになり、隣接月のエントリは含めない", () => {
    const bars = buildPeriodStackedBars(
      "month",
      new Date(2026, 6, 8),
      0,
      [
        makeEntry("1", "2026-07-01T09:00:00", "2026-07-01T10:00:00", "c1"),
        makeEntry("2", "2026-06-30T09:00:00", "2026-06-30T10:00:00", "c1"), // 前月 → 除外
      ],
      cats,
    );
    expect(bars).toHaveLength(31); // 2026年7月
    expect(bars[0].key).toBe("2026-07-01");
    expect(bars[0].totalMinutes).toBe(60);
    expect(bars.reduce((s, b) => s + b.totalMinutes, 0)).toBe(60);
  });

  it("year は12本の月集計になる", () => {
    const bars = buildPeriodStackedBars(
      "year",
      new Date(2026, 6, 8),
      0,
      [
        makeEntry("1", "2026-01-10T09:00:00", "2026-01-10T10:00:00", "c1"),
        makeEntry("2", "2026-01-20T09:00:00", "2026-01-20T10:00:00", "c1"),
        makeEntry("3", "2026-12-01T09:00:00", "2026-12-01T09:30:00", null),
      ],
      cats,
    );
    expect(bars).toHaveLength(12);
    expect(bars[0].totalMinutes).toBe(120);
    expect(bars[11].totalMinutes).toBe(30);
    expect(bars[11].segments[0].categoryId).toBeNull();
  });

  it("期間外のエントリは無視し、空入力なら全バー0", () => {
    const bars = buildPeriodStackedBars(
      "week",
      new Date(2026, 6, 8),
      0,
      [makeEntry("1", "2026-08-01T09:00:00", "2026-08-01T10:00:00", "c1")],
      cats,
    );
    expect(bars.every((b) => b.totalMinutes === 0)).toBe(true);
  });
});

describe("comparePeriods", () => {
  const cats = [makeCategory("c1", "開発", "#111111")];

  it("合計と増減、カテゴリ別の差分を返す", () => {
    const result = comparePeriods(
      [
        makeEntry("1", "2026-07-06T09:00:00", "2026-07-06T11:00:00", "c1"),
        makeEntry("2", "2026-07-07T09:00:00", "2026-07-07T09:30:00", null),
      ],
      [makeEntry("3", "2026-06-29T09:00:00", "2026-06-29T10:00:00", "c1")],
      cats,
    );
    expect(result.currentTotal).toBe(150);
    expect(result.previousTotal).toBe(60);
    expect(result.deltaMinutes).toBe(90);
    expect(result.deltaRatio).toBeCloseTo(1.5);
    const dev = result.byCategory.find((c) => c.categoryId === "c1");
    expect(dev?.deltaMinutes).toBe(60);
    const none = result.byCategory.find((c) => c.categoryId === null);
    expect(none?.previousMinutes).toBe(0);
    expect(none?.deltaMinutes).toBe(30);
  });

  it("前期間が0のとき deltaRatio は null", () => {
    const result = comparePeriods(
      [makeEntry("1", "2026-07-06T09:00:00", "2026-07-06T10:00:00", null)],
      [],
      cats,
    );
    expect(result.deltaRatio).toBeNull();
    expect(result.deltaMinutes).toBe(60);
  });
});

describe("buildHourDowHeatmap / scaledHeatLevel", () => {
  it("時間境界でエントリを分割して各セルに配分する", () => {
    // 2026-07-06 は月曜（dow=1）。9:30-11:15 → 9時台30分・10時台60分・11時台15分
    const { minutes, maxMinutes } = buildHourDowHeatmap([
      makeEntry("1", "2026-07-06T09:30:00", "2026-07-06T11:15:00", null),
    ]);
    expect(minutes[1][9]).toBe(30);
    expect(minutes[1][10]).toBe(60);
    expect(minutes[1][11]).toBe(15);
    expect(minutes[1][12]).toBe(0);
    expect(minutes[0][9]).toBe(0);
    expect(maxMinutes).toBe(60);
  });

  it("空入力なら全セル0で maxMinutes も0", () => {
    const { minutes, maxMinutes } = buildHourDowHeatmap([]);
    expect(minutes).toHaveLength(7);
    expect(minutes.every((row) => row.length === 24 && row.every((m) => m === 0))).toBe(true);
    expect(maxMinutes).toBe(0);
  });

  it("scaledHeatLevel は max に対する相対5段階", () => {
    expect(scaledHeatLevel(0, 100)).toBe(0);
    expect(scaledHeatLevel(1, 100)).toBe(1);
    expect(scaledHeatLevel(25, 100)).toBe(1);
    expect(scaledHeatLevel(50, 100)).toBe(2);
    expect(scaledHeatLevel(100, 100)).toBe(4);
    expect(scaledHeatLevel(10, 0)).toBe(0);
  });
});

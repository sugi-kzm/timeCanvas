import { describe, expect, it } from "vitest";
import {
  buildYearHeatmap,
  compareEstimates,
  estimateAccuracy,
  heatmapLevel,
  minutesByDay,
} from "./analytics";
import type { Task, TimeEntry } from "../types";

function makeEntry(id: string, startAt: string, endAt: string): TimeEntry {
  return {
    id,
    title: `entry-${id}`,
    categoryId: null,
    startAt,
    endAt,
    memo: "",
    taskId: null,
    createdAt: startAt,
    updatedAt: startAt,
  };
}

function makeTask(id: string, estimateMinutes: number | null, status: "open" | "done" = "open"): Task {
  return {
    id,
    title: `task-${id}`,
    memo: "",
    categoryId: null,
    estimateMinutes,
    status,
    dueDate: null,
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
    // 2026-01-01 は木曜 → 最初の週は 2025-12-29(月) 始まり
    expect(weeks[0][0].key).toBe("2025-12-29");
    expect(weeks[0][0].inYear).toBe(false);
    expect(weeks[0][3].key).toBe("2026-01-01");
    expect(weeks[0][3].inYear).toBe(true);
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
  it("見積のあるタスクだけを対象にし、実績と比を計算する", () => {
    const tasks = [makeTask("a", 120), makeTask("bb", null), makeTask("ccc", 60, "done")];
    const actual = new Map([
      ["a", 90],
      ["ccc", 90],
    ]);
    const comparisons = compareEstimates(tasks, actual);
    expect(comparisons).toHaveLength(2);
    expect(comparisons[0].task.id).toBe("a"); // open が先
    expect(comparisons[0].ratio).toBeCloseTo(0.75);
    expect(comparisons[1].ratio).toBeCloseTo(1.5);

    const accuracy = estimateAccuracy(comparisons);
    expect(accuracy.taskCount).toBe(2);
    expect(accuracy.totalEstimate).toBe(180);
    expect(accuracy.totalActual).toBe(180);
    expect(accuracy.overallRatio).toBeCloseTo(1.0);
  });

  it("実績ゼロのタスクは精度サマリーから除外する", () => {
    const comparisons = compareEstimates([makeTask("a", 120)], new Map());
    const accuracy = estimateAccuracy(comparisons);
    expect(accuracy.taskCount).toBe(0);
    expect(accuracy.overallRatio).toBeNull();
  });
});

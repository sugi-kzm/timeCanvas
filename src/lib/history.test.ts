import { describe, expect, it } from "vitest";
import {
  completedTasksInPeriod,
  periodForAnchor,
  periodLabel,
  shiftHistoryAnchor,
} from "./history";
import type { Task } from "../types";

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    displayNo: 1,
    title: `task-${id}`,
    memo: "",
    categoryId: null,
    groupId: null,
    estimateMinutes: null,
    status: "done",
    startDate: null,
    dueDate: null,
    parentId: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    completedAt: "2026-01-01T00:00:00",
    ...overrides,
  };
}

describe("periodForAnchor", () => {
  const anchor = new Date(2026, 6, 15); // 2026-07-15 (水)

  it("week: 週の開始〜終了(含まない)を返す", () => {
    const period = periodForAnchor("week", anchor, 0);
    expect(period.from.getDate()).toBe(12); // 直近の日曜
    expect(period.to.getTime() - period.from.getTime()).toBe(7 * 86_400_000);
  });

  it("month: 月初〜翌月初を返す", () => {
    const period = periodForAnchor("month", anchor);
    expect(period.from).toEqual(new Date(2026, 6, 1));
    expect(period.to).toEqual(new Date(2026, 7, 1));
  });

  it("year: 年始〜翌年始を返す", () => {
    const period = periodForAnchor("year", anchor);
    expect(period.from).toEqual(new Date(2026, 0, 1));
    expect(period.to).toEqual(new Date(2027, 0, 1));
  });
});

describe("shiftHistoryAnchor", () => {
  const anchor = new Date(2026, 6, 15);

  it("week: 7日単位で移動する", () => {
    expect(shiftHistoryAnchor("week", anchor, 1).getDate()).toBe(22);
    expect(shiftHistoryAnchor("week", anchor, -1).getDate()).toBe(8);
  });

  it("month: 月単位で移動する", () => {
    expect(shiftHistoryAnchor("month", anchor, 1)).toEqual(new Date(2026, 7, 1));
    expect(shiftHistoryAnchor("month", anchor, -1)).toEqual(new Date(2026, 5, 1));
  });

  it("year: 年単位で移動する", () => {
    expect(shiftHistoryAnchor("year", anchor, 1)).toEqual(new Date(2027, 6, 1));
    expect(shiftHistoryAnchor("year", anchor, -1)).toEqual(new Date(2025, 6, 1));
  });
});

describe("periodLabel", () => {
  const anchor = new Date(2026, 6, 15);

  it("year: '2026年'", () => {
    expect(periodLabel("year", anchor)).toBe("2026年");
  });

  it("month: '2026年7月'", () => {
    expect(periodLabel("month", anchor)).toBe("2026年7月");
  });

  it("week: 期間の開始〜終了を含むラベル", () => {
    expect(periodLabel("week", anchor)).toContain("月");
  });
});

describe("completedTasksInPeriod", () => {
  it("期間内に完了したタスクのみ返す", () => {
    const tasks = [
      makeTask("in", { completedAt: "2026-07-15T10:00:00" }),
      makeTask("before", { completedAt: "2026-06-30T23:59:59" }),
      makeTask("after", { completedAt: "2026-08-01T00:00:00" }),
      makeTask("notdone", { status: "todo", completedAt: null }),
    ];
    const period = periodForAnchor("month", new Date(2026, 6, 1));
    const result = completedTasksInPeriod(tasks, period);
    expect(result.map((t) => t.id)).toEqual(["in"]);
  });

  it("分類で絞り込める", () => {
    const tasks = [
      makeTask("a", { completedAt: "2026-07-01T00:00:00", groupId: "g1" }),
      makeTask("b", { completedAt: "2026-07-01T00:00:00", groupId: "g2" }),
    ];
    const period = periodForAnchor("month", new Date(2026, 6, 1));
    const result = completedTasksInPeriod(tasks, period, new Set(["g1"]));
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });
});

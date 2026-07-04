import { describe, expect, it } from "vitest";
import { groupCompletedByYearMonth, monthLabel } from "./history";
import type { Task } from "../types";

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
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

describe("groupCompletedByYearMonth", () => {
  it("完了日の年月でグルーピングし、新しい順に並べる", () => {
    const tasks = [
      makeTask("a", { completedAt: "2026-07-02T10:00:00" }),
      makeTask("b", { completedAt: "2026-07-15T10:00:00" }),
      makeTask("c", { completedAt: "2026-05-01T10:00:00" }),
      makeTask("d", { completedAt: "2025-12-31T10:00:00" }),
    ];
    const groups = groupCompletedByYearMonth(tasks, new Map());
    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[0].months.map((m) => m.month)).toEqual([7, 5]);
    expect(groups[0].months[0].items).toHaveLength(2);
    expect(groups[1].months[0].month).toBe(12);
  });

  it("未完了・completedAt なしのタスクは除外する", () => {
    const tasks = [
      makeTask("open", { status: "todo", completedAt: null }),
      makeTask("done1", { completedAt: "2026-07-01T00:00:00" }),
    ];
    const groups = groupCompletedByYearMonth(tasks, new Map());
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });

  it("実績時間を合算する", () => {
    const tasks = [
      makeTask("a", { completedAt: "2026-07-01T00:00:00" }),
      makeTask("b", { completedAt: "2026-07-05T00:00:00" }),
    ];
    const actual = new Map([
      ["a", 60],
      ["b", 90],
    ]);
    const groups = groupCompletedByYearMonth(tasks, actual);
    expect(groups[0].months[0].totalActualMinutes).toBe(150);
    expect(groups[0].totalActualMinutes).toBe(150);
  });

  it("分類で絞り込める", () => {
    const tasks = [
      makeTask("a", { completedAt: "2026-07-01T00:00:00", groupId: "g1" }),
      makeTask("b", { completedAt: "2026-07-01T00:00:00", groupId: "g2" }),
    ];
    const groups = groupCompletedByYearMonth(tasks, new Map(), "g1");
    expect(groups[0].count).toBe(1);
    expect(groups[0].months[0].items[0].id).toBe("a");
  });

  it("対象がなければ空配列", () => {
    expect(groupCompletedByYearMonth([], new Map())).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("1〜12月のラベルを返す", () => {
    expect(monthLabel(1)).toBe("1月");
    expect(monthLabel(12)).toBe("12月");
  });
});

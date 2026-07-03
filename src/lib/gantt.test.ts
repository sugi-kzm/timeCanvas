import { describe, expect, it } from "vitest";
import {
  computeGanttRange,
  dayDiff,
  monthSegments,
  spanToBar,
  taskSpan,
  todayOffset,
} from "./gantt";
import type { Task } from "../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "task",
    memo: "",
    categoryId: null,
    estimateMinutes: null,
    status: "todo",
    startDate: null,
    dueDate: null,
    parentId: null,
    sortOrder: 0,
    createdAt: "2026-07-01T00:00:00",
    updatedAt: "2026-07-01T00:00:00",
    completedAt: null,
    ...overrides,
  };
}

describe("taskSpan", () => {
  it("開始日と期限日があればそれを使う", () => {
    const span = taskSpan(makeTask({ startDate: "2026-07-01", dueDate: "2026-07-10" }), undefined);
    expect(span).toEqual({ start: "2026-07-01", end: "2026-07-10", derived: false });
  });

  it("未設定なら実績の期間から導出する", () => {
    const span = taskSpan(makeTask(), { from: "2026-07-02", to: "2026-07-05" });
    expect(span).toEqual({ start: "2026-07-02", end: "2026-07-05", derived: true });
  });

  it("期限だけ設定されていれば1日のバーになる", () => {
    const span = taskSpan(makeTask({ dueDate: "2026-07-10" }), undefined);
    expect(span).toEqual({ start: "2026-07-10", end: "2026-07-10", derived: false });
  });

  it("開始 > 期限 なら入れ替えて返す", () => {
    const span = taskSpan(makeTask({ startDate: "2026-07-10", dueDate: "2026-07-01" }), undefined);
    expect(span?.start).toBe("2026-07-01");
    expect(span?.end).toBe("2026-07-10");
  });

  it("何もなければ null", () => {
    expect(taskSpan(makeTask(), undefined)).toBeNull();
  });
});

describe("computeGanttRange", () => {
  const today = new Date(2026, 6, 3);

  it("バーの前後に余白を取り最低6週間を確保する", () => {
    const range = computeGanttRange([], today);
    expect(range.totalDays).toBeGreaterThanOrEqual(42);
    expect(range.from <= today).toBe(true);
  });

  it("全バーが範囲に収まる", () => {
    const range = computeGanttRange(
      [
        { start: "2026-06-01", end: "2026-06-10", derived: false },
        { start: "2026-08-01", end: "2026-08-20", derived: false },
      ],
      today,
    );
    expect(dayDiff(range.from, new Date(2026, 5, 1))).toBeGreaterThanOrEqual(0);
    expect(dayDiff(new Date(2026, 7, 20), range.to)).toBeGreaterThanOrEqual(0);
  });
});

describe("monthSegments / spanToBar / todayOffset", () => {
  const today = new Date(2026, 6, 3);
  const range = computeGanttRange([{ start: "2026-07-01", end: "2026-07-31", derived: false }], today);

  it("月セグメントの合計日数が範囲全体と一致する", () => {
    const segments = monthSegments(range);
    const total = segments.reduce((s, seg) => s + seg.days, 0);
    expect(total).toBe(range.totalDays);
    expect(segments[0].startOffset).toBe(0);
  });

  it("バーはオフセットと幅に変換される", () => {
    const bar = spanToBar({ start: "2026-07-01", end: "2026-07-03", derived: false }, range);
    expect(bar.widthDays).toBe(3);
    expect(bar.offsetDays).toBe(dayDiff(range.from, new Date(2026, 6, 1)));
  });

  it("範囲外にはみ出すバーはクリップされる", () => {
    const bar = spanToBar({ start: "2020-01-01", end: "2030-01-01", derived: false }, range);
    expect(bar.offsetDays).toBe(0);
    expect(bar.widthDays).toBe(range.totalDays);
  });

  it("今日が範囲内ならオフセットを返す", () => {
    const offset = todayOffset(range, today);
    expect(offset).not.toBeNull();
    expect(offset).toBe(dayDiff(range.from, today));
  });
});

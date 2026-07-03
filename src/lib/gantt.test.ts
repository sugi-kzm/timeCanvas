import { describe, expect, it } from "vitest";
import {
  computeGanttRange,
  dayCells,
  dayDiff,
  monthSegments,
  offsetToDate,
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

  it("開始は今日の startOffsetDays 日前（既定 3 日）", () => {
    const range = computeGanttRange([], today);
    expect(dayDiff(range.from, today)).toBe(3);
    const wide = computeGanttRange([], today, 7);
    expect(dayDiff(wide.from, today)).toBe(7);
  });

  it("バーがなくても今日から最低4週間先まで表示する", () => {
    const range = computeGanttRange([], today);
    expect(dayDiff(today, range.to)).toBeGreaterThanOrEqual(27);
  });

  it("終了はすべてのバーの終端 + 余白まで伸びる", () => {
    const range = computeGanttRange(
      [{ start: "2026-08-01", end: "2026-08-20", derived: false }],
      today,
    );
    expect(dayDiff(new Date(2026, 7, 20), range.to)).toBeGreaterThanOrEqual(0);
  });

  it("dayCells は範囲の全日を返し offsetToDate と往復できる", () => {
    const range = computeGanttRange([], today);
    const cells = dayCells(range);
    expect(cells).toHaveLength(range.totalDays);
    expect(offsetToDate(range, 3)).toBe("2026-07-03");
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

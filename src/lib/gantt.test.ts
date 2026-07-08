import { describe, expect, it } from "vitest";
import {
  actualFillRatio,
  computeGanttRange,
  dayCells,
  dayDiff,
  initialScrollOffsetDays,
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
    displayNo: 1,
    title: "task",
    memo: "",
    categoryId: null,
    groupId: null,
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

  it("過去に開始するバーがあれば範囲は過去へ広がる（開始 - 7日の余白）", () => {
    const range = computeGanttRange(
      [{ start: "2026-06-01", end: "2026-06-10", derived: false }],
      today,
    );
    expect(dayDiff(range.from, new Date(2026, 5, 1))).toBe(7);
  });

  it("複数の過去バーがあれば最も古い開始日を基準にする", () => {
    const range = computeGanttRange(
      [
        { start: "2026-06-15", end: "2026-06-20", derived: false },
        { start: "2026-05-01", end: "2026-05-03", derived: false },
      ],
      today,
    );
    expect(dayDiff(range.from, new Date(2026, 4, 1))).toBe(7);
  });

  it("過去バーがあっても spanToBar でクリップされない", () => {
    const span = { start: "2026-06-01", end: "2026-06-10", derived: false };
    const range = computeGanttRange([span], today);
    const bar = spanToBar(span, range);
    expect(bar.offsetDays).toBe(7);
    expect(bar.widthDays).toBe(10);
  });
});

describe("initialScrollOffsetDays", () => {
  const today = new Date(2026, 6, 3);

  it("過去バーがなければ 0（先頭 = 今日 - offset）", () => {
    const range = computeGanttRange([], today);
    expect(initialScrollOffsetDays(range, today)).toBe(0);
  });

  it("過去バーがあれば「今日 - offset」までのスクロール量を返す", () => {
    const range = computeGanttRange(
      [{ start: "2026-06-01", end: "2026-06-10", derived: false }],
      today,
    );
    // range.from = 5/25（6/1 - 7日）、今日 - 3日 = 6/30 → 36日分
    expect(initialScrollOffsetDays(range, today)).toBe(dayDiff(range.from, new Date(2026, 5, 30)));
  });

  it("startOffsetDays の指定を反映する", () => {
    const range = computeGanttRange(
      [{ start: "2026-06-01", end: "2026-06-10", derived: false }],
      today,
      7,
    );
    expect(initialScrollOffsetDays(range, today, 7)).toBe(
      dayDiff(range.from, new Date(2026, 5, 26)),
    );
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

describe("actualFillRatio", () => {
  it("見積が未設定なら null", () => {
    expect(actualFillRatio(60, null)).toBeNull();
  });

  it("見積が0以下なら null", () => {
    expect(actualFillRatio(60, 0)).toBeNull();
  });

  it("実績/見積の割合を返す", () => {
    expect(actualFillRatio(30, 60)).toBe(0.5);
  });

  it("実績が見積を超えても1でクリップする", () => {
    expect(actualFillRatio(120, 60)).toBe(1);
  });

  it("実績0なら0", () => {
    expect(actualFillRatio(0, 60)).toBe(0);
  });
});

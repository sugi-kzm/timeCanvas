import { describe, expect, it } from "vitest";
import {
  childProgress,
  groupTickets,
  rollupActualMinutes,
  rollupEstimateMinutes,
} from "./tickets";
import type { Task } from "../types";

function makeTask(
  id: string,
  parentId: string | null = null,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `item-${id}`,
    memo: "",
    categoryId: null,
    estimateMinutes: null,
    status: "todo",
    startDate: null,
    dueDate: null,
    parentId,
    sortOrder: 0,
    createdAt: `2026-01-01T00:00:0${id.length}`,
    updatedAt: "2026-01-01T00:00:00",
    completedAt: null,
    ...overrides,
  };
}

describe("groupTickets", () => {
  it("チケット（parent なし）ごとに子タスクをまとめる", () => {
    const tasks = [
      makeTask("t1"),
      makeTask("c1", "t1"),
      makeTask("c2", "t1"),
      makeTask("t2"),
    ];
    const groups = groupTickets(tasks);
    expect(groups).toHaveLength(2);
    expect(groups[0].ticket.id).toBe("t1");
    expect(groups[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(groups[1].children).toHaveLength(0);
  });

  it("完了チケットは未完了の後ろに並ぶ", () => {
    const tasks = [makeTask("done1", null, { status: "done" }), makeTask("open1")];
    const groups = groupTickets(tasks);
    expect(groups[0].ticket.id).toBe("open1");
    expect(groups[1].ticket.id).toBe("done1");
  });
});

describe("rollupActualMinutes", () => {
  it("チケット直接の実績と子タスクの実績を合算する", () => {
    const groups = groupTickets([makeTask("t1"), makeTask("c1", "t1"), makeTask("c2", "t1")]);
    const actual = new Map([
      ["t1", 30],
      ["c1", 60],
      ["c2", 45],
    ]);
    expect(rollupActualMinutes(groups[0], actual)).toBe(135);
  });

  it("実績がなければ 0", () => {
    const groups = groupTickets([makeTask("t1")]);
    expect(rollupActualMinutes(groups[0], new Map())).toBe(0);
  });
});

describe("rollupEstimateMinutes", () => {
  it("子タスクとチケット自身の見積を合算する", () => {
    const groups = groupTickets([
      makeTask("t1", null, { estimateMinutes: 60 }),
      makeTask("c1", "t1", { estimateMinutes: 120 }),
      makeTask("c2", "t1"),
    ]);
    expect(rollupEstimateMinutes(groups[0])).toBe(180);
  });

  it("どこにも見積がなければ null", () => {
    const groups = groupTickets([makeTask("t1"), makeTask("c1", "t1")]);
    expect(rollupEstimateMinutes(groups[0])).toBeNull();
  });
});

describe("childProgress", () => {
  it("完了した子タスク数を返す", () => {
    const groups = groupTickets([
      makeTask("t1"),
      makeTask("c1", "t1", { status: "done" }),
      makeTask("c2", "t1"),
    ]);
    expect(childProgress(groups[0])).toEqual({ done: 1, total: 2 });
  });

  it("子がなければ null", () => {
    const groups = groupTickets([makeTask("t1")]);
    expect(childProgress(groups[0])).toBeNull();
  });
});

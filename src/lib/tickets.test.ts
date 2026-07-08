import { describe, expect, it } from "vitest";
import {
  childProgress,
  groupTickets,
  rollupActualMinutes,
  rollupEstimateMinutes,
  taskDepth,
  totalEstimateMinutes,
} from "./tickets";
import type { Task } from "../types";

function makeTask(
  id: string,
  parentId: string | null = null,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    displayNo: 1,
    title: `item-${id}`,
    memo: "",
    categoryId: null,
    groupId: null,
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
    const groups = groupTickets(tasks, "due");
    expect(groups).toHaveLength(2);
    expect(groups[0].ticket.id).toBe("t1");
    expect(groups[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(groups[1].children).toHaveLength(0);
  });

  it("完了チケットは未完了の後ろに並ぶ", () => {
    const tasks = [makeTask("done1", null, { status: "done" }), makeTask("open1")];
    const groups = groupTickets(tasks, "due");
    expect(groups[0].ticket.id).toBe("open1");
    expect(groups[1].ticket.id).toBe("done1");
  });

  it("未完了チケットは期限日昇順、期限日未設定は末尾に並ぶ", () => {
    const tasks = [
      makeTask("noDate"),
      makeTask("late", null, { dueDate: "2026-03-01" }),
      makeTask("early", null, { dueDate: "2026-01-15" }),
    ];
    const groups = groupTickets(tasks, "due");
    expect(groups.map((g) => g.ticket.id)).toEqual(["early", "late", "noDate"]);
  });

  it("孫タスク（子タスクの子）を子タスクの children にネストする", () => {
    const tasks = [
      makeTask("t1"),
      makeTask("c1", "t1"),
      makeTask("g1", "c1"),
      makeTask("g2", "c1"),
    ];
    const groups = groupTickets(tasks, "due");
    expect(groups[0].children.map((c) => c.id)).toEqual(["c1"]);
    expect(groups[0].children[0].children.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("孫タスクはトップレベルのグループには現れない（深さ3は存在しない前提）", () => {
    const tasks = [makeTask("t1"), makeTask("c1", "t1"), makeTask("g1", "c1")];
    const groups = groupTickets(tasks, "due");
    expect(groups).toHaveLength(1);
  });

  it("manual モードでは sortOrder → createdAt 順に並ぶ（期限日・完了状態を無視する）", () => {
    const tasks = [
      makeTask("done1", null, { status: "done", sortOrder: 0 }),
      makeTask("late", null, { dueDate: "2026-03-01", sortOrder: 2 }),
      makeTask("early", null, { dueDate: "2026-01-15", sortOrder: 1 }),
    ];
    const groups = groupTickets(tasks, "manual");
    expect(groups.map((g) => g.ticket.id)).toEqual(["done1", "early", "late"]);
  });

  it("manual モードで sortOrder が同じ場合は createdAt で並ぶ", () => {
    const tasks = [
      makeTask("aa", null, { sortOrder: 0, createdAt: "2026-01-02T00:00:00" }),
      makeTask("b", null, { sortOrder: 0, createdAt: "2026-01-01T00:00:00" }),
    ];
    const groups = groupTickets(tasks, "manual");
    expect(groups.map((g) => g.ticket.id)).toEqual(["b", "aa"]);
  });

  it("manual モードでも子タスクは作成順のまま", () => {
    const tasks = [
      makeTask("t1", null, { sortOrder: 0 }),
      makeTask("c2", "t1", { sortOrder: 1 }),
      makeTask("c1", "t1", { sortOrder: 0 }),
    ];
    const groups = groupTickets(tasks, "manual");
    expect(groups[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("taskDepth", () => {
  it("チケット（parent なし）は深さ0", () => {
    const t1 = makeTask("t1");
    expect(taskDepth(t1, new Map([["t1", t1]]))).toBe(0);
  });

  it("直接の子は深さ1", () => {
    const t1 = makeTask("t1");
    const c1 = makeTask("c1", "t1");
    const byId = new Map([
      ["t1", t1],
      ["c1", c1],
    ]);
    expect(taskDepth(c1, byId)).toBe(1);
  });

  it("孫は深さ2", () => {
    const t1 = makeTask("t1");
    const c1 = makeTask("c1", "t1");
    const g1 = makeTask("g1", "c1");
    const byId = new Map([
      ["t1", t1],
      ["c1", c1],
      ["g1", g1],
    ]);
    expect(taskDepth(g1, byId)).toBe(2);
  });
});

describe("rollupActualMinutes", () => {
  it("チケット直接の実績と子タスクの実績を合算する", () => {
    const groups = groupTickets([makeTask("t1"), makeTask("c1", "t1"), makeTask("c2", "t1")], "due");
    const actual = new Map([
      ["t1", 30],
      ["c1", 60],
      ["c2", 45],
    ]);
    expect(rollupActualMinutes(groups[0], actual)).toBe(135);
  });

  it("実績がなければ 0", () => {
    const groups = groupTickets([makeTask("t1")], "due");
    expect(rollupActualMinutes(groups[0], new Map())).toBe(0);
  });

  it("孫タスクの実績も合算する", () => {
    const groups = groupTickets(
      [makeTask("t1"), makeTask("c1", "t1"), makeTask("g1", "c1")],
      "due",
    );
    const actual = new Map([
      ["t1", 10],
      ["c1", 20],
      ["g1", 30],
    ]);
    expect(rollupActualMinutes(groups[0], actual)).toBe(60);
  });
});

describe("rollupEstimateMinutes", () => {
  it("子タスクとチケット自身の見積を合算する", () => {
    const groups = groupTickets(
      [
        makeTask("t1", null, { estimateMinutes: 60 }),
        makeTask("c1", "t1", { estimateMinutes: 120 }),
        makeTask("c2", "t1"),
      ],
      "due",
    );
    expect(rollupEstimateMinutes(groups[0])).toBe(180);
  });

  it("どこにも見積がなければ null", () => {
    const groups = groupTickets([makeTask("t1"), makeTask("c1", "t1")], "due");
    expect(rollupEstimateMinutes(groups[0])).toBeNull();
  });

  it("孫タスクの見積も合算する", () => {
    const groups = groupTickets(
      [makeTask("t1"), makeTask("c1", "t1"), makeTask("g1", "c1", { estimateMinutes: 90 })],
      "due",
    );
    expect(rollupEstimateMinutes(groups[0])).toBe(90);
  });
});

describe("totalEstimateMinutes", () => {
  it("複数チケットの見積合計を返す", () => {
    const groups = groupTickets(
      [
        makeTask("t1", null, { estimateMinutes: 60 }),
        makeTask("t2", null, { estimateMinutes: 30 }),
      ],
      "due",
    );
    expect(totalEstimateMinutes(groups)).toBe(90);
  });

  it("見積未設定のチケットは0として扱う", () => {
    const groups = groupTickets(
      [makeTask("t1", null, { estimateMinutes: 60 }), makeTask("t2")],
      "due",
    );
    expect(totalEstimateMinutes(groups)).toBe(60);
  });

  it("グループが空なら0", () => {
    expect(totalEstimateMinutes([])).toBe(0);
  });
});

describe("childProgress", () => {
  it("完了した子タスク数を返す", () => {
    const groups = groupTickets(
      [makeTask("t1"), makeTask("c1", "t1", { status: "done" }), makeTask("c2", "t1")],
      "due",
    );
    expect(childProgress(groups[0])).toEqual({ done: 1, total: 2 });
  });

  it("子がなければ null", () => {
    const groups = groupTickets([makeTask("t1")], "due");
    expect(childProgress(groups[0])).toBeNull();
  });
});

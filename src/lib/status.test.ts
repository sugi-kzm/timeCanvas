import { describe, expect, it } from "vitest";
import { TASK_STATUSES, normalizeStatus, statusConfig } from "./status";

describe("TASK_STATUSES", () => {
  it("4段階のステータスを定義する", () => {
    expect(TASK_STATUSES.map((s) => s.key)).toEqual(["todo", "in_progress", "review", "done"]);
  });
});

describe("statusConfig", () => {
  it("キーに対応する設定を返す", () => {
    expect(statusConfig("done").label).toBe("完了");
    expect(statusConfig("review").label).toBe("レビュー中");
  });

  it("未知の値は todo にフォールバックする", () => {
    expect(statusConfig("unknown" as never).key).toBe("todo");
  });
});

describe("normalizeStatus", () => {
  it("既知の値はそのまま通す", () => {
    expect(normalizeStatus("in_progress")).toBe("in_progress");
    expect(normalizeStatus("review")).toBe("review");
    expect(normalizeStatus("done")).toBe("done");
  });

  it("旧 'open' や未知の値は todo にする", () => {
    expect(normalizeStatus("open")).toBe("todo");
    expect(normalizeStatus("garbage")).toBe("todo");
  });
});

import { describe, expect, it } from "vitest";
import { layoutOverlaps } from "./layout";

describe("layoutOverlaps", () => {
  it("重なりがなければ全て 1 列", () => {
    const result = layoutOverlaps([
      { id: "a", startMin: 0, endMin: 60 },
      { id: "b", startMin: 60, endMin: 120 },
    ]);
    expect(result.get("a")).toEqual({ column: 0, columns: 1 });
    expect(result.get("b")).toEqual({ column: 0, columns: 1 });
  });

  it("2 件が重なると 2 列に分かれる", () => {
    const result = layoutOverlaps([
      { id: "a", startMin: 0, endMin: 90 },
      { id: "b", startMin: 30, endMin: 120 },
    ]);
    expect(result.get("a")).toEqual({ column: 0, columns: 2 });
    expect(result.get("b")).toEqual({ column: 1, columns: 2 });
  });

  it("連鎖する重なりは同じクラスタとして扱う", () => {
    // a-b 重なり、b-c 重なり（a-c は重ならない）→ 3 件とも同じクラスタ
    const result = layoutOverlaps([
      { id: "a", startMin: 0, endMin: 60 },
      { id: "b", startMin: 30, endMin: 90 },
      { id: "c", startMin: 60, endMin: 120 },
    ]);
    // c は a の列（0列目）を再利用できるので 2 列で収まる
    expect(result.get("a")).toEqual({ column: 0, columns: 2 });
    expect(result.get("b")).toEqual({ column: 1, columns: 2 });
    expect(result.get("c")).toEqual({ column: 0, columns: 2 });
  });

  it("離れたクラスタは列数がリセットされる", () => {
    const result = layoutOverlaps([
      { id: "a", startMin: 0, endMin: 60 },
      { id: "b", startMin: 30, endMin: 60 },
      { id: "c", startMin: 120, endMin: 180 },
    ]);
    expect(result.get("a")?.columns).toBe(2);
    expect(result.get("c")).toEqual({ column: 0, columns: 1 });
  });

  it("包含関係も列が分かれる", () => {
    const result = layoutOverlaps([
      { id: "outer", startMin: 0, endMin: 240 },
      { id: "inner", startMin: 60, endMin: 120 },
    ]);
    expect(result.get("outer")).toEqual({ column: 0, columns: 2 });
    expect(result.get("inner")).toEqual({ column: 1, columns: 2 });
  });

  it("3 件同時の重なりは 3 列", () => {
    const result = layoutOverlaps([
      { id: "a", startMin: 0, endMin: 120 },
      { id: "b", startMin: 0, endMin: 120 },
      { id: "c", startMin: 0, endMin: 120 },
    ]);
    expect(result.get("a")?.columns).toBe(3);
    expect(new Set([result.get("a")?.column, result.get("b")?.column, result.get("c")?.column]).size).toBe(3);
  });

  it("空配列は空の結果", () => {
    expect(layoutOverlaps([]).size).toBe(0);
  });
});

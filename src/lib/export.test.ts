import { describe, expect, it } from "vitest";
import { entriesToCsv, entriesToJson, escapeCsvValue } from "./export";
import type { Category, TimeEntry } from "../types";

const category: Category = {
  id: "dev",
  name: "開発",
  color: "#2564CF",
  archived: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00",
};

const entry: TimeEntry = {
  id: "e1",
  title: "API実装",
  categoryId: "dev",
  startAt: "2026-07-02T09:00:00",
  endAt: "2026-07-02T10:30:00",
  memo: "認証まわり",
  taskId: null,
  createdAt: "2026-07-02T10:30:00",
  updatedAt: "2026-07-02T10:30:00",
};

describe("escapeCsvValue", () => {
  it("通常の値はそのまま", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
  });

  it("カンマ・改行・引用符を含む値はクォートする", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("entriesToCsv", () => {
  it("ヘッダとカテゴリ名を含む行を出力する", () => {
    const csv = entriesToCsv([entry], [category]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("start_at,end_at,title,category,memo");
    expect(lines[1]).toBe("2026-07-02T09:00:00,2026-07-02T10:30:00,API実装,開発,認証まわり");
  });

  it("カテゴリ未設定は空欄になる", () => {
    const csv = entriesToCsv([{ ...entry, categoryId: null }], [category]);
    expect(csv.split("\n")[1]).toContain(",,認証まわり");
  });
});

describe("entriesToJson", () => {
  it("スキーマバージョンとデータを含む", () => {
    const parsed = JSON.parse(entriesToJson([entry], [category]));
    expect(parsed.app).toBe("TimeCanvas");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.categories[0].name).toBe("開発");
  });
});

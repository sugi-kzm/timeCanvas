import { describe, expect, it } from "vitest";
import {
  buildSearchQuery,
  escapeLikePattern,
  splitSearchTerms,
  SEARCH_RESULT_LIMIT,
} from "./searchQuery";

describe("splitSearchTerms", () => {
  it("半角・全角スペースで分割する", () => {
    expect(splitSearchTerms("API 設計")).toEqual(["API", "設計"]);
    expect(splitSearchTerms("API　設計")).toEqual(["API", "設計"]);
  });

  it("空文字・空白のみは空配列", () => {
    expect(splitSearchTerms("")).toEqual([]);
    expect(splitSearchTerms("  　 ")).toEqual([]);
  });
});

describe("escapeLikePattern", () => {
  it("% _ \\ をエスケープする", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});

describe("buildSearchQuery", () => {
  it("キーワードごとに title/memo の AND 条件を作る", () => {
    const { sql, params } = buildSearchQuery({
      keyword: "API 設計",
      categoryIds: [],
      fromIso: null,
      toIso: null,
    });
    expect(sql).toContain("(title LIKE $1 ESCAPE '\\' OR memo LIKE $2 ESCAPE '\\')");
    expect(sql).toContain("(title LIKE $3 ESCAPE '\\' OR memo LIKE $4 ESCAPE '\\')");
    expect(sql).toContain(" AND ");
    expect(params).toEqual(["%API%", "%API%", "%設計%", "%設計%"]);
  });

  it("カテゴリと期間の条件を組み合わせる", () => {
    const { sql, params } = buildSearchQuery({
      keyword: "会議",
      categoryIds: ["c1", "c2"],
      fromIso: "2026-01-01T00:00:00",
      toIso: "2026-02-01T00:00:00",
    });
    expect(sql).toContain("category_id IN ($3, $4)");
    expect(sql).toContain("start_at >= $5");
    expect(sql).toContain("start_at < $6");
    expect(params).toEqual([
      "%会議%",
      "%会議%",
      "c1",
      "c2",
      "2026-01-01T00:00:00",
      "2026-02-01T00:00:00",
    ]);
  });

  it("条件なしなら WHERE を付けない", () => {
    const { sql, params } = buildSearchQuery({
      keyword: "",
      categoryIds: [],
      fromIso: null,
      toIso: null,
    });
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("新しい順で件数制限付き", () => {
    const { sql } = buildSearchQuery({
      keyword: "x",
      categoryIds: [],
      fromIso: null,
      toIso: null,
    });
    expect(sql).toContain("ORDER BY start_at DESC");
    expect(sql).toContain(`LIMIT ${SEARCH_RESULT_LIMIT}`);
  });

  it("LIKE のワイルドカードをエスケープする", () => {
    const { params } = buildSearchQuery({
      keyword: "100%",
      categoryIds: [],
      fromIso: null,
      toIso: null,
    });
    expect(params[0]).toBe("%100\\%%");
  });
});

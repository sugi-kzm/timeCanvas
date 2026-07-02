/**
 * エントリ検索の SQL を組み立てる純粋関数。
 * キーワードは空白（全角含む）区切りの AND 検索で、タイトルとメモを対象とする。
 */
export interface SearchParams {
  keyword: string;
  /** 空配列なら全カテゴリ対象 */
  categoryIds: readonly string[];
  /** null なら期間の下限なし */
  fromIso: string | null;
  /** null なら期間の上限なし */
  toIso: string | null;
  limit?: number;
}

export interface BuiltQuery {
  sql: string;
  params: (string | number)[];
}

export const SEARCH_RESULT_LIMIT = 500;

/** LIKE パターン用に % _ \ をエスケープする */
export function escapeLikePattern(term: string): string {
  return term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/** キーワードを検索語に分割（半角・全角空白区切り、空要素除去） */
export function splitSearchTerms(keyword: string): string[] {
  return keyword.split(/[\s　]+/).filter((t) => t.length > 0);
}

export function buildSearchQuery(p: SearchParams): BuiltQuery {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let index = 1;

  const next = () => `$${index++}`;

  for (const term of splitSearchTerms(p.keyword)) {
    const pattern = `%${escapeLikePattern(term)}%`;
    const a = next();
    const b = next();
    conditions.push(`(title LIKE ${a} ESCAPE '\\' OR memo LIKE ${b} ESCAPE '\\')`);
    params.push(pattern, pattern);
  }

  if (p.categoryIds.length > 0) {
    const placeholders = p.categoryIds.map(() => next()).join(", ");
    conditions.push(`category_id IN (${placeholders})`);
    params.push(...p.categoryIds);
  }

  if (p.fromIso !== null) {
    conditions.push(`start_at >= ${next()}`);
    params.push(p.fromIso);
  }
  if (p.toIso !== null) {
    conditions.push(`start_at < ${next()}`);
    params.push(p.toIso);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = p.limit ?? SEARCH_RESULT_LIMIT;
  const sql =
    `SELECT * FROM time_entries ${where} ORDER BY start_at DESC LIMIT ${limit}`.replace(
      /\s+/g,
      " ",
    );
  return { sql, params };
}

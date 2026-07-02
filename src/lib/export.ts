import type { Category, TimeEntry } from "../types";

/** CSV の値エスケープ（カンマ・引用符・改行を含む場合はクォート） */
export function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function entriesToCsv(
  entries: readonly TimeEntry[],
  categories: readonly Category[],
): string {
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  const header = "start_at,end_at,title,category,memo";
  const lines = entries.map((e) =>
    [
      e.startAt,
      e.endAt,
      escapeCsvValue(e.title),
      escapeCsvValue(e.categoryId !== null ? (byId.get(e.categoryId) ?? "") : ""),
      escapeCsvValue(e.memo),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

export function entriesToJson(
  entries: readonly TimeEntry[],
  categories: readonly Category[],
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "TimeCanvas",
      schemaVersion: 1,
      categories,
      entries,
    },
    null,
    2,
  );
}

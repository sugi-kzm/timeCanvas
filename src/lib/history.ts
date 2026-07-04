import type { Task } from "../types";

export interface HistoryMonthGroup {
  year: number;
  /** 1-12 */
  month: number;
  items: Task[];
  totalActualMinutes: number;
}

export interface HistoryYearGroup {
  year: number;
  months: HistoryMonthGroup[];
  count: number;
  totalActualMinutes: number;
}

/**
 * 完了したチケット/タスクを完了日の年→月でグルーピングする。
 * 新しい年・月が先頭に来る（振り返りやすいように直近から並べる）。
 */
export function groupCompletedByYearMonth(
  tasks: readonly Task[],
  actualByTask: ReadonlyMap<string, number>,
  filterGroupId: string | null = null,
): HistoryYearGroup[] {
  const done = tasks.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt !== null &&
      (filterGroupId === null || t.groupId === filterGroupId),
  );

  const byYearMonth = new Map<string, { year: number; month: number; items: Task[] }>();
  for (const task of done) {
    const completed = new Date(task.completedAt as string);
    const year = completed.getFullYear();
    const month = completed.getMonth() + 1;
    const key = `${year}-${month}`;
    const bucket = byYearMonth.get(key) ?? { year, month, items: [] };
    bucket.items.push(task);
    byYearMonth.set(key, bucket);
  }

  const monthGroups: HistoryMonthGroup[] = [...byYearMonth.values()]
    .map((bucket) => ({
      year: bucket.year,
      month: bucket.month,
      items: [...bucket.items].sort((a, b) =>
        (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
      ),
      totalActualMinutes: bucket.items.reduce(
        (sum, t) => sum + (actualByTask.get(t.id) ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const byYear = new Map<number, HistoryMonthGroup[]>();
  for (const group of monthGroups) {
    byYear.set(group.year, [...(byYear.get(group.year) ?? []), group]);
  }

  return [...byYear.entries()]
    .map(([year, months]) => ({
      year,
      months,
      count: months.reduce((sum, m) => sum + m.items.length, 0),
      totalActualMinutes: months.reduce((sum, m) => sum + m.totalActualMinutes, 0),
    }))
    .sort((a, b) => b.year - a.year);
}

const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

export function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? `${month}月`;
}

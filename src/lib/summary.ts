import type { Category, TimeEntry } from "../types";
import { durationMinutes } from "./dates";

export interface CategorySummary {
  categoryId: string | null;
  name: string;
  color: string;
  minutes: number;
  /** 合計に対する割合 (0-1)。合計 0 分のときは 0 */
  ratio: number;
}

export interface WeekSummary {
  totalMinutes: number;
  byCategory: CategorySummary[];
}

export const UNCATEGORIZED_COLOR = "#8A8886";
export const UNCATEGORIZED_LABEL = "未分類";

/** 週サマリー：合計時間とカテゴリ別内訳（時間降順） */
export function computeWeekSummary(
  entries: readonly TimeEntry[],
  categories: readonly Category[],
): WeekSummary {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const minutesByCategory = new Map<string | null, number>();

  for (const entry of entries) {
    const minutes = Math.max(0, durationMinutes(entry.startAt, entry.endAt));
    const key = entry.categoryId !== null && byId.has(entry.categoryId) ? entry.categoryId : null;
    minutesByCategory.set(key, (minutesByCategory.get(key) ?? 0) + minutes);
  }

  const totalMinutes = [...minutesByCategory.values()].reduce((a, b) => a + b, 0);

  const byCategory: CategorySummary[] = [...minutesByCategory.entries()]
    .map(([categoryId, minutes]) => {
      const category = categoryId !== null ? byId.get(categoryId) : undefined;
      return {
        categoryId,
        name: category?.name ?? UNCATEGORIZED_LABEL,
        color: category?.color ?? UNCATEGORIZED_COLOR,
        minutes,
        ratio: totalMinutes === 0 ? 0 : minutes / totalMinutes,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return { totalMinutes, byCategory };
}

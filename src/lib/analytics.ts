import type { Category, Task, TimeEntry } from "../types";
import { addDays, dateKey, durationMinutes, startOfWeek } from "./dates";
import { UNCATEGORIZED_COLOR, UNCATEGORIZED_LABEL } from "./summary";
import { groupTickets, rollupActualMinutes, rollupEstimateMinutes } from "./tickets";

/** 日付キー（YYYY-MM-DD）ごとの記録分数を集計する */
export function minutesByDay(entries: readonly TimeEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.startAt.slice(0, 10);
    const minutes = Math.max(0, durationMinutes(entry.startAt, entry.endAt));
    map.set(key, (map.get(key) ?? 0) + minutes);
  }
  return map;
}

/** ヒートマップの濃さ（0-4）。2時間刻みで濃くなる */
export function heatmapLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 120) return 1;
  if (minutes < 240) return 2;
  if (minutes < 360) return 3;
  return 4;
}

export interface HeatmapCell {
  key: string;
  date: Date;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  inYear: boolean;
}

/**
 * 年間ヒートマップ用のグリッド（週の配列。各週は月曜始まりの7日）を作る。
 * GitHub の草表示と同様に、1/1 を含む週から 12/31 を含む週まで。
 */
export function buildYearHeatmap(
  year: number,
  minutes: ReadonlyMap<string, number>,
): HeatmapCell[][] {
  const gridStart = startOfWeek(new Date(year, 0, 1));
  const yearEnd = new Date(year, 11, 31);
  const weeks: HeatmapCell[][] = [];
  let cursor = gridStart;
  while (cursor <= yearEnd) {
    const week: HeatmapCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i);
      const key = dateKey(date);
      const dayMinutes = minutes.get(key) ?? 0;
      week.push({
        key,
        date,
        minutes: dayMinutes,
        level: heatmapLevel(dayMinutes),
        inYear: date.getFullYear() === year,
      });
    }
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export interface EstimateComparison {
  task: Task;
  estimateMinutes: number;
  actualMinutes: number;
  /** 実績 / 見積。見積 0 のときは null */
  ratio: number | null;
  /** チケット（親）の行かどうか */
  isTicket: boolean;
}

/**
 * チケット単位の見積 vs 実績（子タスクをロールアップ）。
 * 見積がどこにも設定されていないチケットは除外する。
 */
export function compareEstimates(
  tasks: readonly Task[],
  actualByTask: ReadonlyMap<string, number>,
): EstimateComparison[] {
  return groupTickets(tasks)
    .map((group) => {
      const estimateMinutes = rollupEstimateMinutes(group);
      return {
        task: group.ticket,
        estimateMinutes: estimateMinutes ?? 0,
        actualMinutes: rollupActualMinutes(group, actualByTask),
        ratio:
          estimateMinutes !== null && estimateMinutes > 0
            ? rollupActualMinutes(group, actualByTask) / estimateMinutes
            : null,
        isTicket: true,
      };
    })
    .filter((c) => c.estimateMinutes > 0);
}

export interface CategoryEstimateFactor {
  categoryId: string | null;
  name: string;
  color: string;
  /** 実績合計 / 見積合計。1.0 = 見積どおり、1.5 = 見積の 1.5 倍かかる傾向 */
  factor: number;
  itemCount: number;
}

/**
 * カテゴリ別の「見積補正係数」。
 * 見積と実績の両方があるチケット/タスク単体（ロールアップではなく自身の値）を集計する。
 * 新しい見積にこの係数を掛けると、過去の傾向を踏まえた予想時間になる。
 */
export function categoryEstimateFactors(
  tasks: readonly Task[],
  actualByTask: ReadonlyMap<string, number>,
  categories: readonly Category[],
): CategoryEstimateFactor[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sums = new Map<string | null, { estimate: number; actual: number; count: number }>();
  for (const task of tasks) {
    const estimate = task.estimateMinutes;
    const actual = actualByTask.get(task.id) ?? 0;
    if (estimate === null || estimate <= 0 || actual <= 0) continue;
    const key = task.categoryId !== null && byId.has(task.categoryId) ? task.categoryId : null;
    const current = sums.get(key) ?? { estimate: 0, actual: 0, count: 0 };
    sums.set(key, {
      estimate: current.estimate + estimate,
      actual: current.actual + actual,
      count: current.count + 1,
    });
  }
  return [...sums.entries()]
    .map(([categoryId, s]) => {
      const category = categoryId !== null ? byId.get(categoryId) : undefined;
      return {
        categoryId,
        name: category?.name ?? UNCATEGORIZED_LABEL,
        color: category?.color ?? UNCATEGORIZED_COLOR,
        factor: s.actual / s.estimate,
        itemCount: s.count,
      };
    })
    .sort((a, b) => b.itemCount - a.itemCount);
}

export interface EstimateAccuracy {
  taskCount: number;
  totalEstimate: number;
  totalActual: number;
  /** 全体の実績/見積比。対象タスクがなければ null */
  overallRatio: number | null;
}

/** 実績が付いた見積タスク全体の精度サマリー */
export function estimateAccuracy(comparisons: readonly EstimateComparison[]): EstimateAccuracy {
  const withActual = comparisons.filter((c) => c.actualMinutes > 0);
  const totalEstimate = withActual.reduce((s, c) => s + c.estimateMinutes, 0);
  const totalActual = withActual.reduce((s, c) => s + c.actualMinutes, 0);
  return {
    taskCount: withActual.length,
    totalEstimate,
    totalActual,
    overallRatio: totalEstimate > 0 ? totalActual / totalEstimate : null,
  };
}

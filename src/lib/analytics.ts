import type { Task, TimeEntry } from "../types";
import { addDays, dateKey, durationMinutes, startOfWeek } from "./dates";

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
}

/** 見積が設定されているタスクの見積 vs 実績の一覧（未完了→完了、更新が新しい順） */
export function compareEstimates(
  tasks: readonly Task[],
  actualByTask: ReadonlyMap<string, number>,
): EstimateComparison[] {
  return tasks
    .filter((t) => t.estimateMinutes !== null && t.estimateMinutes > 0)
    .map((task) => {
      const estimateMinutes = task.estimateMinutes ?? 0;
      const actualMinutes = actualByTask.get(task.id) ?? 0;
      return {
        task,
        estimateMinutes,
        actualMinutes,
        ratio: estimateMinutes > 0 ? actualMinutes / estimateMinutes : null,
      };
    })
    .sort((a, b) => {
      if (a.task.status !== b.task.status) return a.task.status === "open" ? -1 : 1;
      return b.task.updatedAt.localeCompare(a.task.updatedAt);
    });
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

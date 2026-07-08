import type { Category, Task, TimeEntry } from "../types";
import {
  addDays,
  calendarRange,
  dateKey,
  durationMinutes,
  fromLocalIso,
  startOfDay,
  startOfWeek,
  type WeekStartsOn,
} from "./dates";
import { UNCATEGORIZED_COLOR, UNCATEGORIZED_LABEL } from "./summary";
import { groupTickets, rollupActualMinutes, rollupEstimateMinutes } from "./tickets";

export type AnalyticsPeriodKind = "week" | "month" | "year";

/**
 * 分析の集計期間（to は排他的）。
 * month は暦月そのもの（カレンダー表示用の6週グリッドを使うと隣接月が混入し、
 * 前月比の二重計上や42本のバー描画につながるため使わない）。
 */
export function analyticsPeriodRange(
  kind: AnalyticsPeriodKind,
  anchor: Date,
  weekStartsOn: WeekStartsOn,
): { from: Date; to: Date } {
  if (kind === "year") {
    return {
      from: new Date(anchor.getFullYear(), 0, 1),
      to: new Date(anchor.getFullYear() + 1, 0, 1),
    };
  }
  if (kind === "month") {
    return {
      from: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
      to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
    };
  }
  return calendarRange("week", anchor, weekStartsOn);
}

/** 前期間のアンカー（前期間比の計算に使う） */
export function previousPeriodAnchor(kind: AnalyticsPeriodKind, anchor: Date): Date {
  if (kind === "week") return addDays(startOfDay(anchor), -7);
  if (kind === "month") return new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  return new Date(anchor.getFullYear() - 1, 0, 1);
}

export interface StackedBarSegment {
  categoryId: string | null;
  name: string;
  color: string;
  minutes: number;
}

export interface StackedBarDatum {
  /** week/month は "YYYY-MM-DD"、year は "YYYY-MM" */
  key: string;
  label: string;
  totalMinutes: number;
  /** 分の降順 */
  segments: StackedBarSegment[];
}

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 期間内のカテゴリ別積み上げ棒グラフのデータ。
 * week = 7本（日別）、month = 日数分、year = 12本（月別集計）。
 */
export function buildPeriodStackedBars(
  kind: AnalyticsPeriodKind,
  anchor: Date,
  weekStartsOn: WeekStartsOn,
  entries: readonly TimeEntry[],
  categories: readonly Category[],
): StackedBarDatum[] {
  const { from, to } = analyticsPeriodRange(kind, anchor, weekStartsOn);
  const byId = new Map(categories.map((c) => [c.id, c]));

  // バーのキー一覧を先に作る（記録のない日/月も0本として並べる）
  const keys: { key: string; label: string }[] = [];
  if (kind === "year") {
    for (let m = 0; m < 12; m++) {
      const mm = String(m + 1).padStart(2, "0");
      keys.push({ key: `${anchor.getFullYear()}-${mm}`, label: `${m + 1}月` });
    }
  } else {
    for (let d = new Date(from); d < to; d = addDays(d, 1)) {
      const label = kind === "week" ? DOW_LABELS[d.getDay()] : String(d.getDate());
      keys.push({ key: dateKey(d), label });
    }
  }

  const buckets = new Map<string, Map<string | null, number>>(
    keys.map(({ key }) => [key, new Map()]),
  );
  for (const entry of entries) {
    const start = fromLocalIso(entry.startAt);
    if (start < from || start >= to) continue;
    const key = kind === "year" ? entry.startAt.slice(0, 7) : entry.startAt.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket === undefined) continue;
    const minutes = Math.max(0, durationMinutes(entry.startAt, entry.endAt));
    bucket.set(entry.categoryId, (bucket.get(entry.categoryId) ?? 0) + minutes);
  }

  return keys.map(({ key, label }) => {
    const bucket = buckets.get(key) ?? new Map<string | null, number>();
    const segments = [...bucket.entries()]
      .map(([categoryId, minutes]) => {
        const category = categoryId !== null ? byId.get(categoryId) : undefined;
        return {
          categoryId,
          name: category?.name ?? UNCATEGORIZED_LABEL,
          color: category?.color ?? UNCATEGORIZED_COLOR,
          minutes,
        };
      })
      .filter((s) => s.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    return {
      key,
      label,
      totalMinutes: segments.reduce((s, seg) => s + seg.minutes, 0),
      segments,
    };
  });
}

export interface CategoryDelta {
  categoryId: string | null;
  name: string;
  color: string;
  currentMinutes: number;
  previousMinutes: number;
  deltaMinutes: number;
}

export interface PeriodComparison {
  currentTotal: number;
  previousTotal: number;
  deltaMinutes: number;
  /** 増減率（deltaMinutes / previousTotal）。+0.5 = 前期間比 +50%。前期間が 0 のときは null */
  deltaRatio: number | null;
  /** 現期間の分の降順 */
  byCategory: CategoryDelta[];
}

function totalMinutesByCategory(entries: readonly TimeEntry[]): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const entry of entries) {
    const minutes = Math.max(0, durationMinutes(entry.startAt, entry.endAt));
    map.set(entry.categoryId, (map.get(entry.categoryId) ?? 0) + minutes);
  }
  return map;
}

/** 現期間と前期間の合計・カテゴリ別増減 */
export function comparePeriods(
  currentEntries: readonly TimeEntry[],
  previousEntries: readonly TimeEntry[],
  categories: readonly Category[],
): PeriodComparison {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const current = totalMinutesByCategory(currentEntries);
  const previous = totalMinutesByCategory(previousEntries);
  const currentTotal = [...current.values()].reduce((s, m) => s + m, 0);
  const previousTotal = [...previous.values()].reduce((s, m) => s + m, 0);

  const categoryIds = new Set<string | null>([...current.keys(), ...previous.keys()]);
  const byCategory = [...categoryIds]
    .map((categoryId) => {
      const category = categoryId !== null ? byId.get(categoryId) : undefined;
      const currentMinutes = current.get(categoryId) ?? 0;
      const previousMinutes = previous.get(categoryId) ?? 0;
      return {
        categoryId,
        name: category?.name ?? UNCATEGORIZED_LABEL,
        color: category?.color ?? UNCATEGORIZED_COLOR,
        currentMinutes,
        previousMinutes,
        deltaMinutes: currentMinutes - previousMinutes,
      };
    })
    .sort((a, b) => b.currentMinutes - a.currentMinutes);

  return {
    currentTotal,
    previousTotal,
    deltaMinutes: currentTotal - previousTotal,
    deltaRatio: previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal : null,
    byCategory,
  };
}

export interface HourDowHeatmapData {
  /** [曜日(0=日)][時(0-23)] の分数 */
  minutes: number[][];
  maxMinutes: number;
}

/**
 * 時間帯×曜日のヒートマップ。エントリを1時間の境界で分割して各セルへ配分する。
 * 日をまたぐ分はその日の 24:00 でクリップする。
 */
export function buildHourDowHeatmap(entries: readonly TimeEntry[]): HourDowHeatmapData {
  const minutes: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const entry of entries) {
    const start = fromLocalIso(entry.startAt);
    const end = fromLocalIso(entry.endAt);
    if (end <= start) continue;
    const dayEnd = addDays(startOfDay(start), 1);
    const clippedEnd = end < dayEnd ? end : dayEnd;
    const dow = start.getDay();
    let cursor = start;
    while (cursor < clippedEnd) {
      const hourEnd = new Date(cursor);
      hourEnd.setMinutes(60, 0, 0);
      const segEnd = hourEnd < clippedEnd ? hourEnd : clippedEnd;
      minutes[dow][cursor.getHours()] += Math.round(
        (segEnd.getTime() - cursor.getTime()) / 60_000,
      );
      cursor = segEnd;
    }
  }
  const maxMinutes = minutes.reduce(
    (max, row) => row.reduce((m, v) => (v > m ? v : m), max),
    0,
  );
  return { minutes, maxMinutes };
}

/** 最大値に対する相対5段階（max が 0 なら常に 0） */
export function scaledHeatLevel(minutes: number, maxMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || maxMinutes <= 0) return 0;
  const level = Math.ceil((minutes / maxMinutes) * 4);
  return Math.min(4, Math.max(1, level)) as 1 | 2 | 3 | 4;
}

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
  weekStartsOn: WeekStartsOn = 0,
): HeatmapCell[][] {
  const gridStart = startOfWeek(new Date(year, 0, 1), weekStartsOn);
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

/** 日付キー（YYYY-MM-DD）ごとに、カテゴリ別の記録分数を集計する */
export function minutesByDayAndCategory(
  entries: readonly TimeEntry[],
): Map<string, Map<string | null, number>> {
  const map = new Map<string, Map<string | null, number>>();
  for (const entry of entries) {
    const key = entry.startAt.slice(0, 10);
    const minutes = Math.max(0, durationMinutes(entry.startAt, entry.endAt));
    const byCategory = map.get(key) ?? new Map<string | null, number>();
    byCategory.set(entry.categoryId, (byCategory.get(entry.categoryId) ?? 0) + minutes);
    map.set(key, byCategory);
  }
  return map;
}

export interface CategoryHeatmap {
  categoryId: string | null;
  name: string;
  color: string;
  weeks: HeatmapCell[][];
}

/**
 * 指定した任意期間（履歴ビューの週/月/年など）のヒートマップグリッドを、
 * カテゴリごとに分けて作る（GitHub の草表示をカテゴリ別に並べたもの）。
 * グリッドは range の週始めから週終わりまで（範囲外の日は inYear=false 相当で除外）。
 */
export function buildCategoryHeatmaps(
  from: Date,
  to: Date,
  minutesByDayCategory: ReadonlyMap<string, ReadonlyMap<string | null, number>>,
  categories: readonly Category[],
  weekStartsOn: WeekStartsOn = 0,
): CategoryHeatmap[] {
  const gridStart = startOfWeek(from, weekStartsOn);
  const rangeEnd = addDays(startOfDay(to), -1);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const usedCategoryIds = new Set<string | null>();
  for (const byCategory of minutesByDayCategory.values()) {
    for (const categoryId of byCategory.keys()) usedCategoryIds.add(categoryId);
  }

  return [...usedCategoryIds]
    .map((categoryId) => {
      const category = categoryId !== null ? byId.get(categoryId) : undefined;
      const weeks: HeatmapCell[][] = [];
      let cursor = gridStart;
      while (cursor <= rangeEnd) {
        const week: HeatmapCell[] = [];
        for (let i = 0; i < 7; i++) {
          const date = addDays(cursor, i);
          const key = dateKey(date);
          const dayMinutes = minutesByDayCategory.get(key)?.get(categoryId) ?? 0;
          week.push({
            key,
            date,
            minutes: dayMinutes,
            level: heatmapLevel(dayMinutes),
            inYear: date >= startOfDay(from) && date <= rangeEnd,
          });
        }
        weeks.push(week);
        cursor = addDays(cursor, 7);
      }
      return {
        categoryId,
        name: category?.name ?? UNCATEGORIZED_LABEL,
        color: category?.color ?? UNCATEGORIZED_COLOR,
        weeks,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
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
  return groupTickets(tasks, "due")
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

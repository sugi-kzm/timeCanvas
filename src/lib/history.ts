import type { Task } from "../types";
import { addDays, startOfDay, startOfWeek, type WeekStartsOn } from "./dates";

export type HistoryGranularity = "week" | "month" | "year";

export interface HistoryPeriod {
  /** 期間の開始日 0:00（含む） */
  from: Date;
  /** 期間の終了日翌日 0:00（含まない） */
  to: Date;
}

/** anchor を含む期間（週/月/年）を返す */
export function periodForAnchor(
  granularity: HistoryGranularity,
  anchor: Date,
  weekStartsOn: WeekStartsOn = 0,
): HistoryPeriod {
  if (granularity === "week") {
    const from = startOfWeek(anchor, weekStartsOn);
    return { from, to: addDays(from, 7) };
  }
  if (granularity === "month") {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return { from, to };
  }
  const from = new Date(anchor.getFullYear(), 0, 1);
  const to = new Date(anchor.getFullYear() + 1, 0, 1);
  return { from, to };
}

/** 次/前の期間へ移動した anchor 日を返す */
export function shiftHistoryAnchor(
  granularity: HistoryGranularity,
  anchor: Date,
  direction: 1 | -1,
): Date {
  if (granularity === "week") return addDays(anchor, direction * 7);
  if (granularity === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  return new Date(anchor.getFullYear() + direction, anchor.getMonth(), 1);
}

/** 期間ラベル（週=期間、月="2026年7月"、年="2026年"） */
export function periodLabel(granularity: HistoryGranularity, anchor: Date): string {
  if (granularity === "year") return `${anchor.getFullYear()}年`;
  if (granularity === "month") return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
  const period = periodForAnchor(granularity, anchor);
  const end = addDays(period.to, -1);
  const startLabel = `${period.from.getFullYear()}年${period.from.getMonth() + 1}月${period.from.getDate()}日`;
  const endLabel =
    end.getFullYear() === period.from.getFullYear()
      ? `${end.getMonth() + 1}月${end.getDate()}日`
      : `${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
  return `${startLabel} - ${endLabel}`;
}

/**
 * 指定した粒度・期間内に完了したタスク（status==="done" かつ completedAt が期間内）を返す。
 * 分類での絞り込みも合わせて適用できる。
 */
export function completedTasksInPeriod(
  tasks: readonly Task[],
  period: HistoryPeriod,
  filterGroupIds: ReadonlySet<string> = new Set(),
): Task[] {
  const fromTime = startOfDay(period.from).getTime();
  const toTime = startOfDay(period.to).getTime();
  return tasks.filter((t) => {
    if (t.status !== "done" || t.completedAt === null) return false;
    if (filterGroupIds.size > 0 && !filterGroupIds.has(t.groupId ?? "__none__")) return false;
    const completedTime = new Date(t.completedAt).getTime();
    return completedTime >= fromTime && completedTime < toTime;
  });
}

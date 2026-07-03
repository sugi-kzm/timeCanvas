import type { Task } from "../types";
import { addDays, fromLocalIso, startOfDay, toLocalIso } from "./dates";

export interface GanttSpan {
  /** "YYYY-MM-DD" */
  start: string;
  end: string;
  /** 開始/期限が未設定で、実績の記録日から導出した期間かどうか */
  derived: boolean;
}

export interface EntryRangeLike {
  from: string;
  to: string;
}

/**
 * チケット/タスクの表示期間を決める。
 * 開始日・期限日が設定されていればそれを優先し、
 * 未設定の場合は実績（紐付いた記録の日付範囲）から導出する。
 * どちらもなければ null（バーを表示しない）。
 */
export function taskSpan(task: Task, entryRange: EntryRangeLike | undefined): GanttSpan | null {
  const start = task.startDate ?? entryRange?.from ?? null;
  const end = task.dueDate ?? entryRange?.to ?? null;
  if (start === null && end === null) return null;
  const s = start ?? end;
  const e = end ?? start;
  if (s === null || e === null) return null;
  const ordered = s <= e ? { start: s, end: e } : { start: e, end: s };
  return { ...ordered, derived: task.startDate === null && task.dueDate === null };
}

export interface GanttRange {
  from: Date;
  /** 含まれる最終日の翌日ではなく最終日そのもの */
  to: Date;
  totalDays: number;
}

const MIN_SPAN_DAYS = 42;
const PAD_BEFORE_DAYS = 7;
const PAD_AFTER_DAYS = 14;

/** 全バーが収まる表示範囲（前後に余白、最低 6 週間） */
export function computeGanttRange(spans: readonly GanttSpan[], today: Date): GanttRange {
  const day = startOfDay(today);
  let min = day;
  let max = day;
  for (const span of spans) {
    const s = fromLocalIso(span.start);
    const e = fromLocalIso(span.end);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  let from = addDays(startOfDay(min), -PAD_BEFORE_DAYS);
  let to = addDays(startOfDay(max), PAD_AFTER_DAYS);
  const days = dayDiff(from, to) + 1;
  if (days < MIN_SPAN_DAYS) {
    to = addDays(from, MIN_SPAN_DAYS - 1);
  }
  return { from, to, totalDays: dayDiff(from, to) + 1 };
}

/** 2つの日付の差（日数、b - a） */
export function dayDiff(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export interface MonthSegment {
  label: string;
  /** 範囲先頭からのオフセット（日） */
  startOffset: number;
  days: number;
}

/** 月ヘッダ用のセグメント一覧 */
export function monthSegments(range: GanttRange): MonthSegment[] {
  const segments: MonthSegment[] = [];
  let cursor = new Date(range.from);
  while (cursor <= range.to) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const segEnd = monthEnd < range.to ? monthEnd : range.to;
    segments.push({
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      startOffset: dayDiff(range.from, cursor),
      days: dayDiff(cursor, segEnd) + 1,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return segments;
}

/** span をバーの位置（オフセット日数と幅日数）へ変換。範囲外にはみ出す分はクリップ */
export function spanToBar(
  span: GanttSpan,
  range: GanttRange,
): { offsetDays: number; widthDays: number } {
  const start = fromLocalIso(span.start);
  const end = fromLocalIso(span.end);
  const offset = Math.max(0, dayDiff(range.from, start));
  const endOffset = Math.min(range.totalDays - 1, dayDiff(range.from, end));
  return { offsetDays: offset, widthDays: Math.max(1, endOffset - offset + 1) };
}

/** 今日の位置（範囲外なら null） */
export function todayOffset(range: GanttRange, today: Date): number | null {
  const offset = dayDiff(range.from, today);
  if (offset < 0 || offset > range.totalDays - 1) return null;
  return offset;
}

/** Date → "YYYY-MM-DD" */
export function toDateString(d: Date): string {
  return toLocalIso(d).slice(0, 10);
}

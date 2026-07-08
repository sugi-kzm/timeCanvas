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

/** 開始位置の既定: 今日の 3 日前から表示する */
export const DEFAULT_GANTT_START_OFFSET_DAYS = 3;
const MIN_FORWARD_DAYS = 27;
const PAD_AFTER_DAYS = 7;
const PAD_BEFORE_DAYS = 7;

/**
 * 表示範囲。開始は「今日 - startOffsetDays」を基本に、過去に開始するバーが
 * あればそこまで（+余白）広げる（過去バーへスクロールで遡れるようにする）。
 * 終了はすべてのバーが収まるところ + 余白（最低でも今日から4週間先まで）。
 */
export function computeGanttRange(
  spans: readonly GanttSpan[],
  today: Date,
  startOffsetDays: number = DEFAULT_GANTT_START_OFFSET_DAYS,
): GanttRange {
  const day = startOfDay(today);
  let from = addDays(day, -startOffsetDays);
  let max = addDays(day, MIN_FORWARD_DAYS);
  for (const span of spans) {
    const s = addDays(startOfDay(fromLocalIso(span.start)), -PAD_BEFORE_DAYS);
    if (s < from) from = s;
    const e = fromLocalIso(span.end);
    if (e > max) max = e;
  }
  const to = addDays(startOfDay(max), PAD_AFTER_DAYS);
  return { from, to, totalDays: dayDiff(from, to) + 1 };
}

/**
 * 初期スクロール位置（日数）。範囲が過去へ広がっていても、
 * 初期表示は「今日 - startOffsetDays」が左端に来るようにする。
 */
export function initialScrollOffsetDays(
  range: GanttRange,
  today: Date,
  startOffsetDays: number = DEFAULT_GANTT_START_OFFSET_DAYS,
): number {
  return Math.max(0, dayDiff(range.from, addDays(startOfDay(today), -startOffsetDays)));
}

/** ヘッダの日セル（1日 = 1マス） */
export function dayCells(range: GanttRange): Date[] {
  return Array.from({ length: range.totalDays }, (_, i) => addDays(range.from, i));
}

/** 範囲先頭からのオフセット（日）を日付文字列にする */
export function offsetToDate(range: GanttRange, offsetDays: number): string {
  return toDateString(addDays(range.from, offsetDays));
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

/**
 * 見積に対する実績の割合（0-1）。
 * 見積が未設定・0 のときは描画対象がないので null を返す。
 */
export function actualFillRatio(
  actualMinutes: number,
  estimateMinutes: number | null,
): number | null {
  if (estimateMinutes === null || estimateMinutes <= 0) return null;
  return Math.min(1, actualMinutes / estimateMinutes);
}

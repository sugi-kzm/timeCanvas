import type { CalendarMode } from "../types";

export const SNAP_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;

/** Date → ローカル時刻の "YYYY-MM-DDTHH:mm:ss"（タイムゾーン情報なし） */
export function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** "YYYY-MM-DDTHH:mm:ss" → Date（ローカル時刻として解釈） */
export function fromLocalIso(iso: string): Date {
  const [datePart, timePart = "00:00:00"] = iso.split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  const [h, min, sec = 0] = timePart.split(":").map(Number);
  return new Date(y, m - 1, day, h, min, sec);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 週の開始日（月曜）を返す */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const dow = day.getDay(); // 0=日, 1=月, ...
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(day, diff);
}

export function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** その日の 0:00 からの経過分 */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** 分を刻み幅にスナップ（最近傍） */
export function snapMinutes(min: number, step: number = SNAP_MINUTES): number {
  return Math.round(min / step) * step;
}

/** 分を刻み幅で切り捨てスナップ */
export function snapMinutesFloor(min: number, step: number = SNAP_MINUTES): number {
  return Math.floor(min / step) * step;
}

export function clampMinutes(min: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, min));
}

/** "9:00" 形式 */
export function formatHm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 分 → "9:00" 形式 */
export function formatMinutesHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function durationMinutes(startIso: string, endIso: string): number {
  return Math.round((fromLocalIso(endIso).getTime() - fromLocalIso(startIso).getTime()) / 60_000);
}

/** 分 → "32.5" のような時間表記（小数1桁、末尾ゼロは削除） */
export function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return String(hours);
}

/** 週の表示ラベル: "2026年6月29日 - 7月5日"（年をまたぐ場合は両方に年を付ける） */
export function weekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const startLabel = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日`;
  const endLabel =
    end.getFullYear() === weekStart.getFullYear()
      ? `${end.getMonth() + 1}月${end.getDate()}日`
      : `${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
  return `${startLabel} - ${endLabel}`;
}

export const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 指定日の 0:00 に分を加えたローカル ISO 文字列 */
export function dayMinuteToIso(day: Date, minute: number): string {
  return toLocalIso(addMinutes(startOfDay(day), minute));
}

// ---------- カレンダーモード（日 / 週 / 月） ----------

/** モードに応じたエントリ読み込み範囲 [from, to) */
export function calendarRange(mode: CalendarMode, anchor: Date): { from: Date; to: Date } {
  if (mode === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (mode === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const gridStart = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return { from: gridStart, to: addDays(gridStart, 42) };
}

/** 前へ / 次へ の移動量（日=±1日、週=±7日、月=±1ヶ月） */
export function shiftAnchor(mode: CalendarMode, anchor: Date, direction: 1 | -1): Date {
  if (mode === "day") return addDays(anchor, direction);
  if (mode === "week") return addDays(anchor, direction * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

/** ツールバーに表示する期間ラベル */
export function calendarLabel(mode: CalendarMode, anchor: Date): string {
  if (mode === "day") {
    return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月${anchor.getDate()}日（${DOW_LABELS[anchor.getDay()]}）`;
  }
  if (mode === "week") return weekRangeLabel(startOfWeek(anchor));
  return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
}

/** 月表示・ミニカレンダー用の 6 週 × 7 日のグリッド（月初を含む週の月曜から42日） */
export function buildMonthGrid(anchor: Date): Date[] {
  const gridStart = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** "YYYY-MM-DD" 形式の日付キー */
export function dateKey(d: Date): string {
  return toLocalIso(startOfDay(d)).slice(0, 10);
}

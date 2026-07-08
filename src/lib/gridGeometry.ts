import type { CalendarMode } from "../types";
import { HOUR_HEIGHT } from "../components/calendar/WeekView";
import { dateKey } from "./dates";

const PX_PER_MIN_VERTICAL = HOUR_HEIGHT / 60;

export interface GridAnchorPoint {
  x: number;
  y: number;
}

/**
 * quickCreate の論理アンカー（日付 + 開始分）から、現在の DOM 実測値をもとに
 * 画面上の座標を再計算する。ウィンドウリサイズ後も呼び出すたびに最新の値を返す。
 * 対象の列要素が見つからない場合（切替直後など）は null を返す。
 */
export function computeGridAnchorPoint(
  calendarMode: CalendarMode,
  day: Date,
  startMin: number,
): GridAnchorPoint | null {
  const el = document.querySelector<HTMLElement>(`[data-day-key="${dateKey(day)}"]`);
  if (el === null) return null;
  const rect = el.getBoundingClientRect();

  if (calendarMode === "day") {
    const pxPerMin = rect.width / (24 * 60);
    return { x: rect.left + startMin * pxPerMin, y: rect.top };
  }

  return { x: rect.left, y: rect.top + startMin * PX_PER_MIN_VERTICAL };
}

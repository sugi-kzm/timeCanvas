import { useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import type { TimeEntry } from "../../types";
import { buildMonthGrid, dateKey, formatHm, fromLocalIso, isSameDay } from "../../lib/dates";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";

const DOW_HEADER = ["月", "火", "水", "木", "金", "土", "日"];
const MAX_CHIPS_PER_DAY = 3;

export function MonthView() {
  const anchorDate = useAppStore((s) => s.anchorDate);
  const entries = useAppStore((s) => s.entries);
  const categories = useAppStore((s) => s.categories);
  const hiddenIds = useAppStore((s) => s.hiddenCategoryIds);
  const showDay = useAppStore((s) => s.showDay);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      if (entry.categoryId !== null && hiddenIds.includes(entry.categoryId)) continue;
      const key = entry.startAt.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [entries, hiddenIds]);

  const days = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const today = new Date();

  return (
    <div className="month-view">
      <div className="month-dow-row">
        {DOW_HEADER.map((label) => (
          <span key={label} className="month-dow">
            {label}
          </span>
        ))}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const dayEntries = entriesByDate.get(dateKey(day)) ?? [];
          const overflow = dayEntries.length - MAX_CHIPS_PER_DAY;
          const outside = day.getMonth() !== anchorDate.getMonth();
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`month-cell ${outside ? "outside" : ""}`}
              onClick={() => void showDay(day)}
              title={`${day.getMonth() + 1}月${day.getDate()}日を日表示で開く`}
            >
              <span className={`month-date ${isSameDay(day, today) ? "today" : ""}`}>
                {day.getDate()}
              </span>
              {dayEntries.slice(0, MAX_CHIPS_PER_DAY).map((entry) => {
                const color =
                  entry.categoryId !== null
                    ? (categoryById.get(entry.categoryId)?.color ?? UNCATEGORIZED_COLOR)
                    : UNCATEGORIZED_COLOR;
                return (
                  <span key={entry.id} className="month-chip">
                    <span className="month-chip-dot" style={{ background: color }} />
                    <span className="month-chip-time">
                      {formatHm(fromLocalIso(entry.startAt))}
                    </span>
                    <span className="month-chip-title">{entry.title}</span>
                  </span>
                );
              })}
              {overflow > 0 && <span className="month-more">+{overflow} 件</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

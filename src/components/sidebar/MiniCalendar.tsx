import { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { addDays, isSameDay, startOfWeek } from "../../lib/dates";
import { IconChevronLeft, IconChevronRight } from "../icons";

const DOW_HEADER = ["月", "火", "水", "木", "金", "土", "日"];

function buildMonthGrid(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function MiniCalendar() {
  const weekStart = useAppStore((s) => s.weekStart);
  const setWeekStart = useAppStore((s) => s.setWeekStart);
  const [anchor, setAnchor] = useState(new Date(weekStart));

  // 週の移動に追従して表示月を合わせる
  useEffect(() => {
    setAnchor(new Date(weekStart));
  }, [weekStart]);

  const today = new Date();
  const weekEnd = addDays(weekStart, 6);
  const days = buildMonthGrid(anchor);

  const isInSelectedWeek = (d: Date) => d >= weekStart && d <= addDays(weekEnd, 1) && d < addDays(weekStart, 7);

  return (
    <section className="mini-calendar" aria-label="ミニカレンダー">
      <div className="mini-cal-header">
        <span className="mini-cal-title">
          {anchor.getFullYear()}年{anchor.getMonth() + 1}月
        </span>
        <button
          type="button"
          className="btn icon-btn small"
          aria-label="前の月"
          onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
        >
          <IconChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="btn icon-btn small"
          aria-label="次の月"
          onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
        >
          <IconChevronRight size={14} />
        </button>
      </div>
      <div className="mini-cal-grid">
        {DOW_HEADER.map((label) => (
          <span key={label} className="mini-cal-dow">
            {label}
          </span>
        ))}
        {days.map((d) => {
          const classes = ["mini-cal-day"];
          if (d.getMonth() !== anchor.getMonth()) classes.push("outside");
          if (isSameDay(d, today)) classes.push("today");
          if (isInSelectedWeek(d)) classes.push("in-week");
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={classes.join(" ")}
              onClick={() => void setWeekStart(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

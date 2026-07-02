import { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { addDays, buildMonthGrid, isSameDay, startOfWeek } from "../../lib/dates";
import { IconChevronLeft, IconChevronRight } from "../icons";

const DOW_HEADER = ["月", "火", "水", "木", "金", "土", "日"];

export function MiniCalendar() {
  const calendarMode = useAppStore((s) => s.calendarMode);
  const anchorDate = useAppStore((s) => s.anchorDate);
  const setAnchorDate = useAppStore((s) => s.setAnchorDate);
  const [monthAnchor, setMonthAnchor] = useState(new Date(anchorDate));

  // 表示期間の移動に追従して表示月を合わせる
  useEffect(() => {
    setMonthAnchor(new Date(anchorDate));
  }, [anchorDate]);

  const today = new Date();
  const weekStart = startOfWeek(anchorDate);
  const days = buildMonthGrid(monthAnchor);

  const isHighlighted = (d: Date) => {
    if (calendarMode === "day") return isSameDay(d, anchorDate);
    if (calendarMode === "week") return d >= weekStart && d < addDays(weekStart, 7);
    return (
      d.getFullYear() === anchorDate.getFullYear() && d.getMonth() === anchorDate.getMonth()
    );
  };

  return (
    <section className="mini-calendar" aria-label="ミニカレンダー">
      <div className="mini-cal-header">
        <span className="mini-cal-title">
          {monthAnchor.getFullYear()}年{monthAnchor.getMonth() + 1}月
        </span>
        <button
          type="button"
          className="btn icon-btn small"
          aria-label="前の月"
          onClick={() =>
            setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))
          }
        >
          <IconChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="btn icon-btn small"
          aria-label="次の月"
          onClick={() =>
            setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))
          }
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
          if (d.getMonth() !== monthAnchor.getMonth()) classes.push("outside");
          if (isSameDay(d, today)) classes.push("today");
          if (isHighlighted(d)) classes.push("in-week");
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={classes.join(" ")}
              onClick={() => void setAnchorDate(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { addDays, buildMonthGrid, dowLabels, isSameDay, startOfWeek } from "../../lib/dates";
import { IconChevronLeft, IconChevronRight } from "../icons";

/** 表示している月の前後 3 年分の「YYYY年M月」候補 */
function monthOptions(anchor: Date): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let y = anchor.getFullYear() - 3; y <= anchor.getFullYear() + 3; y++) {
    for (let m = 1; m <= 12; m++) {
      options.push({ value: `${y}-${m}`, label: `${y}年${m}月` });
    }
  }
  return options;
}

export function MiniCalendar() {
  const calendarMode = useAppStore((s) => s.calendarMode);
  const anchorDate = useAppStore((s) => s.anchorDate);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const setAnchorDate = useAppStore((s) => s.setAnchorDate);
  const [monthAnchor, setMonthAnchor] = useState(new Date(anchorDate));

  // 表示期間の移動に追従して表示月を合わせる
  useEffect(() => {
    setMonthAnchor(new Date(anchorDate));
  }, [anchorDate]);

  const today = new Date();
  const weekStart = startOfWeek(anchorDate, weekStartsOn);
  const weekEndDow = (weekStartsOn + 6) % 7;
  const days = useMemo(
    () => buildMonthGrid(monthAnchor, weekStartsOn),
    [monthAnchor, weekStartsOn],
  );
  const options = useMemo(() => monthOptions(monthAnchor), [monthAnchor]);

  const isInSelectedWeek = (d: Date) =>
    calendarMode === "week" && d >= weekStart && d < addDays(weekStart, 7);

  return (
    <section className="mini-calendar" aria-label="ミニカレンダー">
      <div className="mini-cal-header">
        <select
          className="mini-cal-select"
          aria-label="年月を選択"
          value={`${monthAnchor.getFullYear()}-${monthAnchor.getMonth() + 1}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setMonthAnchor(new Date(y, m - 1, 1));
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="mini-cal-spacer" />
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
        {dowLabels(weekStartsOn).map((label) => (
          <span key={label} className="mini-cal-dow">
            {label}
          </span>
        ))}
        {days.map((d) => {
          const classes = ["mini-cal-day"];
          if (d.getMonth() !== monthAnchor.getMonth()) classes.push("outside");
          if (isInSelectedWeek(d)) {
            classes.push("in-week");
            if (d.getDay() === weekStartsOn) classes.push("week-first");
            if (d.getDay() === weekEndDow) classes.push("week-last");
          }
          if (calendarMode !== "week" && isSameDay(d, anchorDate)) classes.push("selected");
          if (isSameDay(d, today)) classes.push("today");
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={classes.join(" ")}
              onClick={() => void setAnchorDate(d)}
            >
              <span className="mini-cal-day-num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

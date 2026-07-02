import { useAppStore } from "../../store/appStore";
import { computeWeekSummary } from "../../lib/summary";
import { formatHours } from "../../lib/dates";

const HEADINGS = {
  day: "この日の記録",
  week: "今週の記録",
  month: "この月の記録",
} as const;

export function WeekSummary() {
  const calendarMode = useAppStore((s) => s.calendarMode);
  const anchorDate = useAppStore((s) => s.anchorDate);
  const entries = useAppStore((s) => s.entries);
  const categories = useAppStore((s) => s.categories);

  // 月表示では前後月の日も読み込まれるため、当月分のみ集計する
  const targetEntries =
    calendarMode === "month"
      ? entries.filter((e) => {
          const ym = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, "0")}`;
          return e.startAt.startsWith(ym);
        })
      : entries;

  const summary = computeWeekSummary(targetEntries, categories);

  return (
    <section className="week-summary" aria-label={HEADINGS[calendarMode]}>
      <div className="side-section-header">
        <span>{HEADINGS[calendarMode]}</span>
      </div>
      <p className="summary-total">
        {formatHours(summary.totalMinutes)}
        <span className="summary-unit"> 時間</span>
      </p>
      {summary.totalMinutes > 0 && (
        <>
          <div className="summary-bar" aria-hidden="true">
            {summary.byCategory.map((c) => (
              <span
                key={c.categoryId ?? "none"}
                style={{ width: `${c.ratio * 100}%`, background: c.color }}
              />
            ))}
          </div>
          <ul className="summary-list">
            {summary.byCategory.map((c) => (
              <li key={c.categoryId ?? "none"}>
                <span className="category-dot" style={{ background: c.color }} />
                <span className="category-name">{c.name}</span>
                <span className="summary-hours">{formatHours(c.minutes)}h</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

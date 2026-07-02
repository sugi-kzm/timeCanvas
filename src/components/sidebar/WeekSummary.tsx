import { useAppStore } from "../../store/appStore";
import { computeWeekSummary } from "../../lib/summary";
import { formatHours } from "../../lib/dates";

export function WeekSummary() {
  const entries = useAppStore((s) => s.entries);
  const categories = useAppStore((s) => s.categories);
  const summary = computeWeekSummary(entries, categories);

  return (
    <section className="week-summary" aria-label="今週のサマリー">
      <div className="side-section-header">
        <span>今週の記録</span>
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

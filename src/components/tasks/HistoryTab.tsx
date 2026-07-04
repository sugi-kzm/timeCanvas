import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { groupCompletedByYearMonth, monthLabel } from "../../lib/history";
import { formatHours } from "../../lib/dates";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import { IconChevronRight } from "../icons";

interface HistoryTabProps {
  /** null = すべて表示。分類 ID で絞り込み */
  filterGroupId: string | null;
}

/**
 * 完了したチケット/タスクを年→月で振り返るビュー。
 * 「毎月何ができたか」「毎年何を成し遂げたか」を思い出せるようにする。
 */
export function HistoryTab({ filterGroupId }: HistoryTabProps) {
  const tasks = useAppStore((s) => s.tasks);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const categories = useAppStore((s) => s.categories);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const years = useMemo(
    () => groupCompletedByYearMonth(tasks, actualMinutes, filterGroupId),
    [tasks, actualMinutes, filterGroupId],
  );

  const [collapsedMonths, setCollapsedMonths] = useState<ReadonlySet<string>>(new Set());
  const toggleMonth = (key: string) =>
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (years.length === 0) {
    return (
      <p className="tasks-empty">
        完了したチケット/タスクはまだありません。カンバンや「チケット」タブで
        ステータスを「完了」にすると、ここに実績として積み上がっていきます。
      </p>
    );
  }

  return (
    <div className="history-view">
      {years.map((year) => (
        <section key={year.year} className="history-year">
          <div className="history-year-header">
            <h3 className="history-year-title">{year.year}年</h3>
            <span className="history-year-summary">
              {year.count} 件 ・ 合計 {formatHours(year.totalActualMinutes)} 時間
            </span>
          </div>
          {year.months.map((month) => {
            const key = `${month.year}-${month.month}`;
            const collapsed = collapsedMonths.has(key);
            return (
              <div key={key} className="history-month">
                <button
                  type="button"
                  className="history-month-header"
                  onClick={() => toggleMonth(key)}
                >
                  <span className={`tree-caret ${collapsed ? "" : "open"}`}>
                    <IconChevronRight size={13} />
                  </span>
                  <span className="history-month-title">{monthLabel(month.month)}</span>
                  <span className="history-month-summary">
                    {month.items.length} 件 ・ {formatHours(month.totalActualMinutes)} 時間
                  </span>
                </button>
                {!collapsed && (
                  <ul className="history-item-list">
                    {month.items.map((item) => {
                      const category =
                        item.categoryId !== null ? categoryById.get(item.categoryId) : undefined;
                      const actual = actualMinutes.get(item.id) ?? 0;
                      return (
                        <li key={item.id} className="history-item">
                          <span
                            className="category-dot"
                            style={{ background: category?.color ?? UNCATEGORIZED_COLOR }}
                          />
                          <span className="history-item-title">{item.title}</span>
                          <span className="history-item-date">
                            {(item.completedAt ?? "").slice(0, 10)}
                          </span>
                          <span className="history-item-hours">
                            {actual > 0 ? `${formatHours(actual)}h` : "-"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

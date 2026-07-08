import { useMemo } from "react";
import type { Category, TimeEntry } from "../../types";
import type { HistoryPeriod } from "../../lib/history";
import { buildCategoryHeatmaps, minutesByDayAndCategory } from "../../lib/analytics";
import { formatHours } from "../../lib/dates";
import type { WeekStartsOn } from "../../lib/dates";

const HEAT_COLORS = ["#EBEBEA", "#C8E1F8", "#8FC3F0", "#4D9EE6", "#1A6DC0"];

interface HistoryHeatmapProps {
  entries: readonly TimeEntry[];
  categories: readonly Category[];
  period: HistoryPeriod;
  weekStartsOn: WeekStartsOn;
}

/** 期間内の記録を、カテゴリごとのカレンダーヒートマップとして表示する（分析画面の年間ヒートマップを流用） */
export function HistoryHeatmap({ entries, categories, period, weekStartsOn }: HistoryHeatmapProps) {
  const byDayAndCategory = useMemo(() => minutesByDayAndCategory(entries), [entries]);
  const heatmaps = useMemo(
    () => buildCategoryHeatmaps(period.from, period.to, byDayAndCategory, categories, weekStartsOn),
    [period, byDayAndCategory, categories, weekStartsOn],
  );

  if (heatmaps.length === 0) {
    return <p className="tasks-empty">この期間に記録された時間はありません。</p>;
  }

  return (
    <div className="history-heatmap-list">
      {heatmaps.map((h) => (
        <section key={h.categoryId ?? "none"} className="history-heatmap-section">
          <h4 className="history-heatmap-title">
            <span className="category-dot" style={{ background: h.color }} />
            {h.name}
          </h4>
          <div className="heatmap-scroll">
            <div className="heatmap">
              {h.weeks.map((week, wi) => (
                <div key={wi} className="heatmap-week">
                  {week.map((cell) => (
                    <span
                      key={cell.key}
                      className={`heatmap-cell ${cell.inYear ? "" : "outside"}`}
                      style={{ background: cell.inYear ? HEAT_COLORS[cell.level] : "transparent" }}
                      title={`${cell.key}: ${formatHours(cell.minutes)}時間`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
      <div className="heatmap-legend">
        <span>少</span>
        {HEAT_COLORS.map((color) => (
          <span key={color} className="heatmap-cell" style={{ background: color }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

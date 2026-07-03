import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { TimeEntry } from "../../types";
import { listEntriesBetween } from "../../db/entryRepo";
import { computeWeekSummary } from "../../lib/summary";
import {
  buildYearHeatmap,
  categoryEstimateFactors,
  compareEstimates,
  estimateAccuracy,
  minutesByDay,
} from "../../lib/analytics";
import {
  addDays,
  calendarLabel,
  calendarRange,
  formatHours,
  shiftAnchor,
  startOfWeek,
  toLocalIso,
} from "../../lib/dates";
import { IconChevronLeft, IconChevronRight } from "../icons";

type PeriodKind = "week" | "month" | "year";

const HEAT_COLORS = ["#EBEBEA", "#C8E1F8", "#8FC3F0", "#4D9EE6", "#1A6DC0"];

function periodLabel(kind: PeriodKind, anchor: Date): string {
  if (kind === "week") return calendarLabel("week", anchor);
  if (kind === "month") return calendarLabel("month", anchor);
  return `${anchor.getFullYear()}年`;
}

export function AnalyticsView() {
  const categories = useAppStore((s) => s.categories);
  const tasks = useAppStore((s) => s.tasks);
  const taskActualMinutes = useAppStore((s) => s.taskActualMinutes);
  const setStatus = useAppStore((s) => s.setStatus);

  const [periodKind, setPeriodKind] = useState<PeriodKind>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [periodEntries, setPeriodEntries] = useState<TimeEntry[]>([]);
  const [yearEntries, setYearEntries] = useState<TimeEntry[]>([]);

  // 期間集計用のエントリ読み込み
  useEffect(() => {
    const range =
      periodKind === "year"
        ? {
            from: new Date(anchor.getFullYear(), 0, 1),
            to: new Date(anchor.getFullYear() + 1, 0, 1),
          }
        : calendarRange(periodKind, anchor);
    listEntriesBetween(toLocalIso(range.from), toLocalIso(range.to))
      .then(setPeriodEntries)
      .catch((e) => setStatus(`集計データの読み込みに失敗しました: ${String(e)}`));
  }, [periodKind, anchor, setStatus]);

  // ヒートマップ用に表示年の全エントリを読み込み（グリッドは前後年に少しはみ出す）
  const year = anchor.getFullYear();
  useEffect(() => {
    const from = startOfWeek(new Date(year, 0, 1));
    const to = addDays(new Date(year, 11, 31), 7);
    listEntriesBetween(toLocalIso(from), toLocalIso(to))
      .then(setYearEntries)
      .catch((e) => setStatus(`年間データの読み込みに失敗しました: ${String(e)}`));
  }, [year, setStatus]);

  const summary = useMemo(
    () => computeWeekSummary(periodEntries, categories),
    [periodEntries, categories],
  );
  const heatmapWeeks = useMemo(
    () => buildYearHeatmap(year, minutesByDay(yearEntries)),
    [year, yearEntries],
  );
  const comparisons = useMemo(
    () => compareEstimates(tasks, taskActualMinutes),
    [tasks, taskActualMinutes],
  );
  const accuracy = useMemo(() => estimateAccuracy(comparisons), [comparisons]);
  const factors = useMemo(
    () => categoryEstimateFactors(tasks, taskActualMinutes, categories),
    [tasks, taskActualMinutes, categories],
  );
  const maxCategoryMinutes = summary.byCategory[0]?.minutes ?? 0;

  const shift = (direction: 1 | -1) => {
    if (periodKind === "year") {
      setAnchor(new Date(anchor.getFullYear() + direction, 0, 1));
    } else {
      setAnchor(shiftAnchor(periodKind, anchor, direction));
    }
  };

  return (
    <div className="analytics-view">
      <div className="analytics-inner">
        <h2 className="tasks-heading">分析</h2>

        <div className="analytics-controls">
          <button type="button" className="btn" onClick={() => setAnchor(new Date())}>
            今日
          </button>
          <button type="button" className="btn icon-btn" aria-label="前へ" onClick={() => shift(-1)}>
            <IconChevronLeft />
          </button>
          <button type="button" className="btn icon-btn" aria-label="次へ" onClick={() => shift(1)}>
            <IconChevronRight />
          </button>
          <span className="analytics-period-label">{periodLabel(periodKind, anchor)}</span>
          <span className="spacer" />
          <div className="view-switch" role="group" aria-label="集計期間">
            {(
              [
                { key: "week", label: "週" },
                { key: "month", label: "月" },
                { key: "year", label: "年" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                className={`seg ${periodKind === m.key ? "active" : ""}`}
                onClick={() => setPeriodKind(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <section className="analytics-section">
          <h3 className="analytics-heading">カテゴリ別の時間</h3>
          <p className="analytics-total">
            合計 <strong>{formatHours(summary.totalMinutes)}</strong> 時間
          </p>
          {summary.byCategory.length === 0 ? (
            <p className="tasks-empty">この期間の記録はありません</p>
          ) : (
            <ul className="category-bars">
              {summary.byCategory.map((c) => (
                <li key={c.categoryId ?? "none"}>
                  <span className="category-bar-label">
                    <span className="category-dot" style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <span className="category-bar-track">
                    <span
                      className="category-bar-fill"
                      style={{
                        width: `${maxCategoryMinutes > 0 ? (c.minutes / maxCategoryMinutes) * 100 : 0}%`,
                        background: c.color,
                      }}
                    />
                  </span>
                  <span className="category-bar-value">
                    {formatHours(c.minutes)}h ({Math.round(c.ratio * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="analytics-section">
          <h3 className="analytics-heading">見積 vs 実績（チケット単位）</h3>
          {accuracy.overallRatio !== null && (
            <p className="analytics-total">
              全体精度: 見積 {formatHours(accuracy.totalEstimate)}h に対して実績{" "}
              {formatHours(accuracy.totalActual)}h（
              <strong>{Math.round(accuracy.overallRatio * 100)}%</strong> ・ {accuracy.taskCount}{" "}
              タスク）
            </p>
          )}
          {comparisons.length === 0 ? (
            <p className="tasks-empty">
              見積時間を設定したチケットがありません。チケット画面で見積を入力し、
              記録にチケット/タスクを紐付けるとここで比較できます。
            </p>
          ) : (
            <ul className="estimate-list">
              {comparisons.map(({ task, estimateMinutes, actualMinutes, ratio }) => {
                const over = ratio !== null && ratio > 1;
                const pct = ratio !== null ? Math.min(ratio, 2) * 50 : 0; // 200% でバー最大
                return (
                  <li key={task.id} className="estimate-row">
                    <span className={`estimate-title ${task.status === "done" ? "done" : ""}`}>
                      {task.title}
                    </span>
                    <span className="estimate-track">
                      <span className="estimate-marker" />
                      <span
                        className={`estimate-fill ${over ? "over" : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="estimate-value">
                      {formatHours(actualMinutes)}h / {formatHours(estimateMinutes)}h
                      {ratio !== null && (
                        <span className={`task-ratio ${over ? "over-text" : ""}`}>
                          {" "}
                          ({Math.round(ratio * 100)}%)
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="analytics-section">
          <h3 className="analytics-heading">見積精度の傾向（カテゴリ別の補正係数）</h3>
          <p className="analytics-total">
            係数 = これまでの実績合計 ÷ 見積合計。
            新しい見積にこの係数を掛けると、過去の傾向を踏まえた予想時間になります。
          </p>
          {factors.length === 0 ? (
            <p className="tasks-empty">
              見積と実績が両方そろった項目がまだありません。データが溜まるほど
              この係数が安定し、見積の精度改善に使えるようになります。
            </p>
          ) : (
            <ul className="factor-list">
              {factors.map((f) => (
                <li key={f.categoryId ?? "none"} className="factor-row">
                  <span className="category-dot" style={{ background: f.color }} />
                  <span className="factor-name">{f.name}</span>
                  <span className={`factor-value ${f.factor > 1.1 ? "over-text" : ""}`}>
                    × {f.factor.toFixed(2)}
                  </span>
                  <span className="factor-count">{f.itemCount} 件</span>
                  <span className="factor-hint">
                    {f.factor > 1.1
                      ? `見積の約 ${Math.round(f.factor * 100)}% かかる傾向`
                      : f.factor < 0.9
                        ? "見積より早く終わる傾向"
                        : "ほぼ見積どおり"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="analytics-section">
          <h3 className="analytics-heading">{year}年の記録ヒートマップ</h3>
          <div className="heatmap-scroll">
            <div className="heatmap">
              {heatmapWeeks.map((week, wi) => (
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
          <div className="heatmap-legend">
            <span>少</span>
            {HEAT_COLORS.map((color) => (
              <span key={color} className="heatmap-cell" style={{ background: color }} />
            ))}
            <span>多</span>
          </div>
        </section>
      </div>
    </div>
  );
}

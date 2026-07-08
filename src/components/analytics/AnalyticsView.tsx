import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { TimeEntry } from "../../types";
import { listEntriesBetween } from "../../db/entryRepo";
import { computeWeekSummary } from "../../lib/summary";
import {
  analyticsPeriodRange,
  buildHourDowHeatmap,
  buildPeriodStackedBars,
  categoryEstimateFactors,
  compareEstimates,
  comparePeriods,
  estimateAccuracy,
  previousPeriodAnchor,
  type AnalyticsPeriodKind,
} from "../../lib/analytics";
import { calendarLabel, formatHours, shiftAnchor, toLocalIso } from "../../lib/dates";
import { IconArrowLeft, IconArrowRight } from "../icons";
import { StackedBarChart } from "./StackedBarChart";
import { HourDowChart } from "./HourDowChart";

type PeriodKind = AnalyticsPeriodKind;

const PREVIOUS_LABEL: Record<PeriodKind, string> = {
  week: "前週比",
  month: "前月比",
  year: "前年比",
};

function periodLabel(kind: PeriodKind, anchor: Date, weekStartsOn: 0 | 1): string {
  if (kind === "week") return calendarLabel("week", anchor, weekStartsOn);
  if (kind === "month") return calendarLabel("month", anchor);
  return `${anchor.getFullYear()}年`;
}

function formatDelta(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  return `${sign}${formatHours(Math.abs(minutes))}h`;
}

export function AnalyticsView() {
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const categories = useAppStore((s) => s.categories);
  const tasks = useAppStore((s) => s.tasks);
  const taskActualMinutes = useAppStore((s) => s.taskActualMinutes);
  const setStatus = useAppStore((s) => s.setStatus);

  const [periodKind, setPeriodKind] = useState<PeriodKind>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [periodEntries, setPeriodEntries] = useState<TimeEntry[]>([]);
  const [previousEntries, setPreviousEntries] = useState<TimeEntry[]>([]);

  // 現期間と前期間（前期間比用）のエントリ読み込み。
  // 期間を素早く切り替えたとき、古い応答が新しい応答を上書きしないようキャンセルフラグで守る
  useEffect(() => {
    let cancelled = false;
    const range = analyticsPeriodRange(periodKind, anchor, weekStartsOn);
    const prevRange = analyticsPeriodRange(
      periodKind,
      previousPeriodAnchor(periodKind, anchor),
      weekStartsOn,
    );
    Promise.all([
      listEntriesBetween(toLocalIso(range.from), toLocalIso(range.to)),
      listEntriesBetween(toLocalIso(prevRange.from), toLocalIso(prevRange.to)),
    ])
      .then(([current, previous]) => {
        if (cancelled) return;
        setPeriodEntries(current);
        setPreviousEntries(previous);
      })
      .catch((e) => {
        if (!cancelled) setStatus(`集計データの読み込みに失敗しました: ${String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [periodKind, anchor, weekStartsOn, setStatus]);

  const summary = useMemo(
    () => computeWeekSummary(periodEntries, categories),
    [periodEntries, categories],
  );
  const comparison = useMemo(
    () => comparePeriods(periodEntries, previousEntries, categories),
    [periodEntries, previousEntries, categories],
  );
  const stackedBars = useMemo(
    () => buildPeriodStackedBars(periodKind, anchor, weekStartsOn, periodEntries, categories),
    [periodKind, anchor, weekStartsOn, periodEntries, categories],
  );
  const hourDow = useMemo(() => buildHourDowHeatmap(periodEntries), [periodEntries]);
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
            <IconArrowLeft size={16} />
          </button>
          <button type="button" className="btn icon-btn" aria-label="次へ" onClick={() => shift(1)}>
            <IconArrowRight size={16} />
          </button>
          <span className="analytics-period-label">
            {periodLabel(periodKind, anchor, weekStartsOn)}
          </span>
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

        {/* 合計と前期間比のサマリー */}
        <section className="analytics-section">
          <div className="analytics-summary-row">
            <span className="analytics-summary-total">
              合計 <strong>{formatHours(comparison.currentTotal)}</strong> 時間
            </span>
            <span className={`delta-chip ${comparison.deltaMinutes >= 0 ? "up" : "down"}`}>
              {PREVIOUS_LABEL[periodKind]} {formatDelta(comparison.deltaMinutes)}
              {comparison.deltaRatio !== null &&
                ` (${comparison.deltaRatio >= 0 ? "+" : "-"}${Math.abs(
                  Math.round(comparison.deltaRatio * 100),
                )}%)`}
            </span>
          </div>
          {comparison.byCategory.length > 0 && (
            <div className="delta-category-row">
              {comparison.byCategory.slice(0, 6).map((c) => (
                <span key={c.categoryId ?? "none"} className="delta-category-chip">
                  <span className="category-dot" style={{ background: c.color }} />
                  {c.name} {formatDelta(c.deltaMinutes)}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* コアレポート: 日別（年は月別）のカテゴリ積み上げ棒 */}
        <section className="analytics-section">
          <h3 className="analytics-heading">
            {periodKind === "year" ? "月別の記録時間" : "日別の記録時間"}
          </h3>
          <StackedBarChart bars={stackedBars} labelEvery={periodKind === "month" ? 5 : 1} />
        </section>

        <section className="analytics-section">
          <h3 className="analytics-heading">カテゴリ別の時間</h3>
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

        {/* どの時間帯に活動しているか */}
        <section className="analytics-section">
          <h3 className="analytics-heading">時間帯×曜日の分布</h3>
          <HourDowChart data={hourDow} />
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

      </div>
    </div>
  );
}

import { formatHours } from "../../lib/dates";
import type { StackedBarDatum } from "../../lib/analytics";

interface StackedBarChartProps {
  bars: readonly StackedBarDatum[];
  /** X軸ラベルを何本おきに表示するか（月表示の日ラベル間引き用） */
  labelEvery?: number;
}

/** 期間内の日別（年は月別）カテゴリ積み上げ棒グラフ。div ベースの軽量描画 */
export function StackedBarChart({ bars, labelEvery = 1 }: StackedBarChartProps) {
  const max = bars.reduce((m, b) => (b.totalMinutes > m ? b.totalMinutes : m), 0);
  if (max === 0) {
    return <p className="tasks-empty">この期間の記録はありません</p>;
  }
  return (
    <div className="stacked-bars" role="img" aria-label="期間内のカテゴリ別記録時間">
      {bars.map((bar, i) => (
        <div key={bar.key} className="stacked-bar-col">
          <div
            className="stacked-bar"
            title={`${bar.key}: ${formatHours(bar.totalMinutes)}時間`}
          >
            {bar.segments.map((seg) => (
              <span
                key={seg.categoryId ?? "none"}
                className="stacked-bar-seg"
                style={{ height: `${(seg.minutes / max) * 100}%`, background: seg.color }}
                title={`${seg.name}: ${formatHours(seg.minutes)}時間`}
              />
            ))}
          </div>
          <span className="stacked-bar-xlabel">{i % labelEvery === 0 ? bar.label : ""}</span>
        </div>
      ))}
    </div>
  );
}

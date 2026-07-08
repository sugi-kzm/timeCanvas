import { Fragment } from "react";
import { formatHours } from "../../lib/dates";
import { scaledHeatLevel, type HourDowHeatmapData } from "../../lib/analytics";

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
export const HEAT_COLORS = ["#EBEBEA", "#C8E1F8", "#8FC3F0", "#4D9EE6", "#1A6DC0"];

/** 時間帯×曜日のヒートマップ（どの時間帯に活動が集中しているかを見る） */
export function HourDowChart({ data }: { data: HourDowHeatmapData }) {
  if (data.maxMinutes === 0) {
    return <p className="tasks-empty">この期間の記録はありません</p>;
  }
  return (
    <div className="hourdow">
      <div className="hourdow-grid">
        <span className="hourdow-axis-label" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="hourdow-axis-label">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
        {data.minutes.map((row, dow) => (
          <Fragment key={dow}>
            <span className="hourdow-axis-label hourdow-dow-label">{DOW_LABELS[dow]}</span>
            {row.map((minutes, hour) => (
              <span
                key={hour}
                className="hourdow-cell"
                style={{ background: HEAT_COLORS[scaledHeatLevel(minutes, data.maxMinutes)] }}
                title={`${DOW_LABELS[dow]}曜 ${hour}時台: ${formatHours(minutes)}時間`}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

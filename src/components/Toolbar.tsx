import { useAppStore } from "../store/appStore";
import { weekRangeLabel } from "../lib/dates";
import { IconChevronLeft, IconChevronRight } from "./icons";

export function Toolbar() {
  const weekStart = useAppStore((s) => s.weekStart);
  const goToday = useAppStore((s) => s.goToday);
  const goPrevWeek = useAppStore((s) => s.goPrevWeek);
  const goNextWeek = useAppStore((s) => s.goNextWeek);

  return (
    <header className="toolbar">
      <span className="app-title">TimeCanvas</span>
      <button type="button" className="btn" onClick={() => void goToday()}>
        今日
      </button>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="前の週"
        onClick={() => void goPrevWeek()}
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="次の週"
        onClick={() => void goNextWeek()}
      >
        <IconChevronRight />
      </button>
      <h1 className="week-label">{weekRangeLabel(weekStart)}</h1>
      <div className="toolbar-spacer" />
      <div className="view-switch" role="group" aria-label="表示切替">
        <button type="button" className="seg" disabled title="日表示（今後対応）">
          日
        </button>
        <button type="button" className="seg active">
          週
        </button>
        <button type="button" className="seg" disabled title="月表示（今後対応）">
          月
        </button>
      </div>
    </header>
  );
}

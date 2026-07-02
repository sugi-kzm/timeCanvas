import { useAppStore } from "../store/appStore";
import { calendarLabel } from "../lib/dates";
import type { CalendarMode } from "../types";
import { IconChevronLeft, IconChevronRight } from "./icons";

const MODES: { key: CalendarMode; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "週" },
  { key: "month", label: "月" },
];

export function Toolbar() {
  const calendarMode = useAppStore((s) => s.calendarMode);
  const anchorDate = useAppStore((s) => s.anchorDate);
  const goToday = useAppStore((s) => s.goToday);
  const goPrev = useAppStore((s) => s.goPrev);
  const goNext = useAppStore((s) => s.goNext);
  const setCalendarMode = useAppStore((s) => s.setCalendarMode);
  const searchKeyword = useAppStore((s) => s.searchKeyword);
  const setSearchKeyword = useAppStore((s) => s.setSearchKeyword);

  return (
    <header className="toolbar">
      <span className="app-title">TimeCanvas</span>
      <button type="button" className="btn" onClick={() => void goToday()}>
        今日
      </button>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="前へ"
        onClick={() => void goPrev()}
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="次へ"
        onClick={() => void goNext()}
      >
        <IconChevronRight />
      </button>
      <h1 className="week-label">{calendarLabel(calendarMode, anchorDate)}</h1>
      <div className="toolbar-spacer" />
      <input
        id="entry-search-input"
        type="search"
        className="text-input search-box"
        placeholder="記録を検索 (Ctrl+F)"
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSearchKeyword("");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <div className="view-switch" role="group" aria-label="表示切替">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`seg ${calendarMode === m.key ? "active" : ""}`}
            onClick={() => void setCalendarMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </header>
  );
}

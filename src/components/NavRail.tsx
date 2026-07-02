import { useAppStore } from "../store/appStore";
import type { ViewKind } from "../types";
import { IconCalendar, IconChart, IconGear, IconNotebook, IconTasks } from "./icons";

const VIEWS: { key: ViewKind; label: string; icon: React.ReactNode }[] = [
  { key: "calendar", label: "カレンダー", icon: <IconCalendar /> },
  { key: "tasks", label: "タスク", icon: <IconTasks /> },
  { key: "analytics", label: "分析", icon: <IconChart /> },
];

export function NavRail() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <nav className="nav-rail" aria-label="画面切替">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          className={`rail-btn ${view === v.key ? "active" : ""}`}
          title={v.label}
          aria-label={v.label}
          onClick={() => setView(v.key)}
        >
          {v.icon}
        </button>
      ))}
      <button
        type="button"
        className="rail-btn"
        disabled
        title="ノート（Phase 4 で対応予定）"
        aria-label="ノート（Phase 4 で対応予定）"
      >
        <IconNotebook />
      </button>
      <div className="rail-spacer" />
      <button
        type="button"
        className="rail-btn"
        title="設定"
        aria-label="設定"
        onClick={() => setSettingsOpen(true)}
      >
        <IconGear />
      </button>
    </nav>
  );
}

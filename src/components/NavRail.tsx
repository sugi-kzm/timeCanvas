import { useAppStore } from "../store/appStore";
import { IconCalendar, IconChart, IconGear, IconNotebook, IconTasks } from "./icons";

const FUTURE_VIEWS = [
  { key: "tasks", label: "タスク（Phase 2 で対応予定）", icon: <IconTasks /> },
  { key: "analytics", label: "分析（Phase 3 で対応予定）", icon: <IconChart /> },
  { key: "notes", label: "ノート（Phase 4 で対応予定）", icon: <IconNotebook /> },
] as const;

export function NavRail() {
  const view = useAppStore((s) => s.view);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <nav className="nav-rail" aria-label="画面切替">
      <button
        type="button"
        className={`rail-btn ${view === "calendar" ? "active" : ""}`}
        title="カレンダー"
        aria-label="カレンダー"
      >
        <IconCalendar />
      </button>
      {FUTURE_VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          className="rail-btn"
          disabled
          title={v.label}
          aria-label={v.label}
        >
          {v.icon}
        </button>
      ))}
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

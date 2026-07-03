import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { TasksViewMode } from "../../store/appStore";
import { KanbanBoard } from "./KanbanBoard";
import { GanttChart } from "./GanttChart";

const VIEW_TABS: { key: TasksViewMode; label: string }[] = [
  { key: "board", label: "カンバン" },
  { key: "gantt", label: "ガント" },
];

export function TasksView() {
  const viewMode = useAppStore((s) => s.tasksViewMode);
  const setViewMode = useAppStore((s) => s.setTasksViewMode);
  const categories = useAppStore((s) => s.categories);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  /** null = すべて */
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);

  return (
    <div className="tasks-view wide">
      <div className="tasks-inner">
        {/* どの表示モードでも変わらない共通ヘッダー */}
        <div className="tasks-header-row">
          <h2 className="tasks-heading">チケット</h2>
          <div className="view-switch" role="group" aria-label="チケットの表示切替">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`seg ${viewMode === tab.key ? "active" : ""}`}
                onClick={() => setViewMode(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tickets-layout">
          <aside className="tickets-side" aria-label="チケットの分類">
            <button
              type="button"
              className={`tickets-side-item ${filterCategoryId === null ? "active" : ""}`}
              onClick={() => setFilterCategoryId(null)}
            >
              すべて
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`tickets-side-item ${filterCategoryId === c.id ? "active" : ""}`}
                onClick={() => setFilterCategoryId(c.id)}
              >
                <span className="category-dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
            <button
              type="button"
              className="tickets-side-item add"
              title="カテゴリの追加は設定から"
              onClick={() => setSettingsOpen(true)}
            >
              + 分類を追加
            </button>
          </aside>
          <div className="tickets-main">
            {viewMode === "board" ? (
              <KanbanBoard filterCategoryId={filterCategoryId} />
            ) : (
              <GanttChart filterCategoryId={filterCategoryId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const addTask = useAppStore((s) => s.addTask);

  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string | null>(categories[0]?.id ?? null);

  const submit = () => {
    const title = newTitle.trim();
    if (title === "") return;
    void addTask(title, newCategoryId, null);
    setNewTitle("");
  };

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
        <div className="task-add-row">
          <input
            type="text"
            className="text-input"
            placeholder="新しいチケットを追加（Enter で登録）"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <select
            className="select-input task-add-category"
            value={newCategoryId ?? ""}
            onChange={(e) => setNewCategoryId(e.target.value === "" ? null : e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">未分類</option>
          </select>
          <button type="button" className="btn primary" onClick={submit}>
            追加
          </button>
        </div>
        {viewMode === "board" ? <KanbanBoard /> : <GanttChart />}
      </div>
    </div>
  );
}

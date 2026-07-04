import { useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";
import type { TasksViewMode } from "../../store/appStore";
import { TicketsTab } from "./TicketsTab";
import { KanbanBoard } from "./KanbanBoard";
import { GanttChart } from "./GanttChart";
import { HistoryTab } from "./HistoryTab";
import { IconChevronLeft, IconChevronRight } from "../icons";

const VIEW_TABS: { key: TasksViewMode; label: string }[] = [
  { key: "tickets", label: "チケット" },
  { key: "board", label: "カンバン" },
  { key: "gantt", label: "ガント" },
  { key: "history", label: "履歴" },
];

export function TasksView() {
  const viewMode = useAppStore((s) => s.tasksViewMode);
  const setViewMode = useAppStore((s) => s.setTasksViewMode);
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(true);

  return (
    <div className="tasks-view wide">
      <div className="tasks-inner">
        {/* どの表示モードでも変わらない共通ヘッダー */}
        <div className="tasks-header-row">
          <button
            type="button"
            className="ghost-icon-btn"
            title={railOpen ? "分類パネルを隠す" : "分類パネルを表示"}
            aria-label={railOpen ? "分類パネルを隠す" : "分類パネルを表示"}
            onClick={() => setRailOpen((v) => !v)}
          >
            {railOpen ? <IconChevronLeft size={16} /> : <IconChevronRight size={16} />}
          </button>
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
          {railOpen && (
            <TicketGroupRail
              filterGroupId={filterGroupId}
              onSelect={setFilterGroupId}
            />
          )}
          <div className="tickets-main">
            {viewMode === "tickets" && <TicketsTab filterGroupId={filterGroupId} />}
            {viewMode === "board" && <KanbanBoard filterGroupId={filterGroupId} />}
            {viewMode === "gantt" && <GanttChart filterGroupId={filterGroupId} />}
            {viewMode === "history" && <HistoryTab filterGroupId={filterGroupId} />}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TicketGroupRailProps {
  filterGroupId: string | null;
  onSelect: (id: string | null) => void;
}

/** チケットの分類レール（スケジュールのカテゴリとは別軸。自学習・プロジェクト等） */
function TicketGroupRail({ filterGroupId, onSelect }: TicketGroupRailProps) {
  const ticketGroups = useAppStore((s) => s.ticketGroups);
  const addTicketGroup = useAppStore((s) => s.addTicketGroup);
  const renameTicketGroup = useAppStore((s) => s.renameTicketGroup);
  const removeTicketGroup = useAppStore((s) => s.removeTicketGroup);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const submitNew = () => {
    const name = newName.trim();
    if (name !== "") {
      void addTicketGroup(name).then((created) => {
        if (created !== null) onSelect(created.id);
      });
    }
    setNewName("");
    setAdding(false);
  };

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const submitEdit = () => {
    if (editingId === null) return;
    const name = editingName.trim();
    if (name !== "") void renameTicketGroup(editingId, name);
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    void confirmDialog({
      title: "分類を削除",
      message: `分類「${name}」を削除しますか？\n（この分類のチケットは「なし」になります）`,
      danger: true,
    }).then((ok) => {
      if (ok) {
        void removeTicketGroup(id);
        if (filterGroupId === id) onSelect(null);
      }
    });
  };

  return (
    <aside className="tickets-side" aria-label="チケットの分類">
      <button
        type="button"
        className={`tickets-side-item ${filterGroupId === null ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        すべて
      </button>
      {ticketGroups.map((g) =>
        editingId === g.id ? (
          <input
            key={g.id}
            type="text"
            className="text-input tickets-side-edit-input"
            autoFocus
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitEdit();
              if (e.key === "Escape") setEditingId(null);
            }}
            onBlur={submitEdit}
          />
        ) : (
          <div key={g.id} className="tickets-side-row">
            <button
              type="button"
              className={`tickets-side-item ${filterGroupId === g.id ? "active" : ""}`}
              onClick={() => onSelect(g.id)}
              onDoubleClick={() => startEdit(g.id, g.name)}
              title="ダブルクリックで名前を変更"
            >
              {g.name}
            </button>
            <button
              type="button"
              className="tickets-side-del"
              aria-label={`${g.name} を削除`}
              title="削除"
              onClick={() => handleDelete(g.id, g.name)}
            >
              ×
            </button>
          </div>
        ),
      )}
      {adding ? (
        <input
          ref={addInputRef}
          type="text"
          className="text-input tickets-side-edit-input"
          autoFocus
          placeholder="分類名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
            if (e.key === "Escape") {
              setNewName("");
              setAdding(false);
            }
          }}
          onBlur={submitNew}
        />
      ) : (
        <button type="button" className="tickets-side-item add" onClick={() => setAdding(true)}>
          + 分類を追加
        </button>
      )}
    </aside>
  );
}

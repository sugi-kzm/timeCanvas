import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";
import type { Task } from "../../types";
import { TASK_STATUSES, statusConfig } from "../../lib/status";
import { formatHours } from "../../lib/dates";
import {
  childProgress,
  groupTickets,
  rollupActualMinutes,
  rollupEstimateMinutes,
  type TicketGroup as TicketBundle,
} from "../../lib/tickets";
import { IconChevronRight } from "../icons";

interface TicketsTabProps {
  /** null = すべて表示。分類 ID で絞り込み */
  filterGroupId: string | null;
}

/**
 * チケット/タスクを包括的に管理するタブ（Jira/Atlassian 風のマスタ・ディテール構成）。
 * 左に親子階層のリスト、右に選択項目の詳細編集パネル。
 */
export function TicketsTab({ filterGroupId }: TicketsTabProps) {
  const tasks = useAppStore((s) => s.tasks);
  const addTask = useAppStore((s) => s.addTask);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedCollapsed, setExpandedCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [newTicketTitle, setNewTicketTitle] = useState("");

  const groups = useMemo(() => {
    const all = groupTickets(tasks);
    if (filterGroupId === null) return all;
    return all.filter((g) => g.ticket.groupId === filterGroupId);
  }, [tasks, filterGroupId]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );
  const selectedParent = useMemo(
    () =>
      selectedTask?.parentId !== null && selectedTask !== null
        ? (tasks.find((t) => t.id === selectedTask.parentId) ?? null)
        : null,
    [tasks, selectedTask],
  );
  const selectedChildren = useMemo(
    () => (selectedTask !== null ? tasks.filter((t) => t.parentId === selectedTask.id) : []),
    [tasks, selectedTask],
  );

  const toggleExpand = (id: string) =>
    setExpandedCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitTicket = () => {
    const title = newTicketTitle.trim();
    if (title === "") return;
    void addTask(title, null, null, filterGroupId).then((created) => {
      if (created !== null) setSelectedId(created.id);
    });
    setNewTicketTitle("");
  };

  return (
    <div className="tickets-tab">
      <div className="tickets-tab-master">
        <div className="task-add-row">
          <input
            type="text"
            className="text-input"
            placeholder="新しいチケットを追加（Enter で登録）"
            value={newTicketTitle}
            onChange={(e) => setNewTicketTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTicket();
            }}
          />
          <button type="button" className="btn primary" onClick={submitTicket}>
            追加
          </button>
        </div>
        {groups.length === 0 && (
          <p className="tasks-empty">チケットがありません。上の入力欄から追加してください。</p>
        )}
        <ul className="task-list">
          {groups.map((group) => (
            <TicketMasterRow
              key={group.ticket.id}
              group={group}
              expanded={!expandedCollapsed.has(group.ticket.id)}
              onToggle={() => toggleExpand(group.ticket.id)}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </ul>
      </div>
      <div className="tickets-tab-detail">
        {selectedTask === null ? (
          <p className="tasks-empty">左のリストからチケット/タスクを選ぶと詳細を編集できます。</p>
        ) : (
          <TicketDetail
            task={selectedTask}
            parent={selectedParent}
            children={selectedChildren}
            onSelectParent={setSelectedId}
            onSelectChild={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

interface TicketMasterRowProps {
  group: TicketBundle;
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function TicketMasterRow({ group, expanded, onToggle, selectedId, onSelect }: TicketMasterRowProps) {
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const { ticket, children } = group;
  const status = statusConfig(ticket.status);
  const rollupActual = rollupActualMinutes(group, actualMinutes);
  const rollupEstimate = rollupEstimateMinutes(group);
  const progress = childProgress(group);

  return (
    <li className="ticket-block">
      <button
        type="button"
        className={`task-row ticket master-row ${ticket.id === selectedId ? "selected" : ""}`}
        onClick={() => onSelect(ticket.id)}
      >
        <span
          className={`tree-caret-btn ${children.length > 0 ? "" : "hidden"}`}
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <span className={`tree-caret ${expanded ? "open" : ""}`}>
            <IconChevronRight size={13} />
          </span>
        </span>
        <span className="lozenge" style={{ background: status.bg, color: status.text }}>
          {status.label}
        </span>
        <span className="ticket-title master-title">{ticket.title}</span>
        {progress !== null && (
          <span className="ticket-progress">
            {progress.done}/{progress.total}
          </span>
        )}
        <span className="master-hours">
          {rollupActual > 0 ? `${formatHours(rollupActual)}h` : "-"}
          {rollupEstimate !== null && ` / ${formatHours(rollupEstimate)}h`}
        </span>
      </button>
      {expanded && children.length > 0 && (
        <ul className="task-children">
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                className={`task-row child master-row ${child.id === selectedId ? "selected" : ""}`}
                onClick={() => onSelect(child.id)}
              >
                <span className="child-indent" />
                <span
                  className="lozenge"
                  style={{
                    background: statusConfig(child.status).bg,
                    color: statusConfig(child.status).text,
                  }}
                >
                  {statusConfig(child.status).label}
                </span>
                <span className="master-title">{child.title}</span>
                <span className="master-hours">
                  {(actualMinutes.get(child.id) ?? 0) > 0
                    ? `${formatHours(actualMinutes.get(child.id) ?? 0)}h`
                    : "-"}
                  {child.estimateMinutes !== null &&
                    ` / ${formatHours(child.estimateMinutes)}h`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface TicketDetailProps {
  task: Task;
  parent: Task | null;
  children: Task[];
  onSelectParent: (id: string) => void;
  onSelectChild: (id: string) => void;
  onClose: () => void;
}

function TicketDetail({
  task,
  parent,
  children,
  onSelectParent,
  onSelectChild,
  onClose,
}: TicketDetailProps) {
  const categories = useAppStore((s) => s.categories);
  const ticketGroups = useAppStore((s) => s.ticketGroups);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const updateTask = useAppStore((s) => s.updateTask);
  const addTask = useAppStore((s) => s.addTask);
  const removeTask = useAppStore((s) => s.removeTask);

  const [newChildTitle, setNewChildTitle] = useState("");
  const isTicket = task.parentId === null;
  const actual = actualMinutes.get(task.id) ?? 0;

  const submitChild = () => {
    const title = newChildTitle.trim();
    if (title === "") return;
    void addTask(title, task.categoryId, task.id, task.groupId);
    setNewChildTitle("");
  };

  const handleDelete = () => {
    void confirmDialog({
      title: isTicket ? "チケットを削除" : "タスクを削除",
      message:
        isTicket && children.length > 0
          ? `チケット「${task.title}」を削除しますか？\n（子タスクも削除されます。記録済みの実績は残ります）`
          : `「${task.title}」を削除しますか？\n（記録済みの実績は残ります）`,
      danger: true,
    }).then((ok) => {
      if (ok) {
        void removeTask(task.id);
        onClose();
      }
    });
  };

  return (
    <div className="ticket-detail">
      <div className="ticket-detail-header">
        {parent !== null && (
          <button
            type="button"
            className="link-btn ticket-detail-parent"
            onClick={() => onSelectParent(parent.id)}
          >
            ← {parent.title}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="ghost-icon-btn" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>

      <input
        type="text"
        className="ticket-detail-title-input"
        defaultValue={task.title}
        key={task.id}
        onBlur={(e) => {
          const title = e.target.value.trim();
          if (title !== "" && title !== task.title) void updateTask({ ...task, title });
        }}
      />

      <div className="ticket-detail-field-row">
        <label className="ticket-detail-field">
          <span className="ticket-detail-label">ステータス</span>
          <select
            className="select-input"
            value={task.status}
            onChange={(e) =>
              void updateTask({
                ...task,
                status: e.target.value as Task["status"],
                completedAt:
                  e.target.value === "done" ? new Date().toISOString() : task.completedAt,
              })
            }
          >
            {TASK_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ticket-detail-field">
          <span className="ticket-detail-label">分類</span>
          <select
            className="select-input"
            value={task.groupId ?? ""}
            onChange={(e) =>
              void updateTask({ ...task, groupId: e.target.value === "" ? null : e.target.value })
            }
          >
            <option value="">なし</option>
            {ticketGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ticket-detail-field">
          <span className="ticket-detail-label">カテゴリ</span>
          <select
            className="select-input"
            value={task.categoryId ?? ""}
            onChange={(e) =>
              void updateTask({
                ...task,
                categoryId: e.target.value === "" ? null : e.target.value,
              })
            }
          >
            <option value="">未分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ticket-detail-field-row">
        <label className="ticket-detail-field">
          <span className="ticket-detail-label">開始日</span>
          <input
            type="date"
            className="text-input"
            value={task.startDate ?? ""}
            onChange={(e) => void updateTask({ ...task, startDate: e.target.value || null })}
          />
        </label>
        <label className="ticket-detail-field">
          <span className="ticket-detail-label">期限日</span>
          <input
            type="date"
            className="text-input"
            value={task.dueDate ?? ""}
            onChange={(e) => void updateTask({ ...task, dueDate: e.target.value || null })}
          />
        </label>
        <label className="ticket-detail-field">
          <span className="ticket-detail-label">見積 (h)</span>
          <input
            type="number"
            className="text-input"
            min={0}
            step={0.25}
            defaultValue={task.estimateMinutes !== null ? task.estimateMinutes / 60 : ""}
            onBlur={(e) => {
              const value = e.target.value.trim();
              const minutes = value === "" ? null : Math.round(Number(value) * 60);
              if (minutes !== task.estimateMinutes && (minutes === null || minutes >= 0)) {
                void updateTask({ ...task, estimateMinutes: minutes });
              }
            }}
          />
        </label>
      </div>

      <p className="ticket-detail-actual">
        実績合計: <strong>{actual > 0 ? `${formatHours(actual)} 時間` : "記録なし"}</strong>
      </p>

      <label className="ticket-detail-field full">
        <span className="ticket-detail-label">説明・メモ</span>
        <textarea
          className="textarea-input"
          rows={5}
          defaultValue={task.memo}
          onBlur={(e) => {
            if (e.target.value !== task.memo) void updateTask({ ...task, memo: e.target.value });
          }}
        />
      </label>

      {isTicket && (
        <div className="ticket-detail-children">
          <span className="ticket-detail-label">子タスク</span>
          <ul className="ticket-detail-child-list">
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  className="link-btn ticket-detail-child-link"
                  onClick={() => onSelectChild(child.id)}
                >
                  <span
                    className="lozenge small"
                    style={{
                      background: statusConfig(child.status).bg,
                      color: statusConfig(child.status).text,
                    }}
                  >
                    {statusConfig(child.status).label}
                  </span>
                  {child.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="task-add-row small">
            <input
              type="text"
              className="text-input"
              placeholder="子タスクを追加（Enter で登録）"
              value={newChildTitle}
              onChange={(e) => setNewChildTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitChild();
              }}
            />
            <button type="button" className="btn" onClick={submitChild}>
              追加
            </button>
          </div>
        </div>
      )}

      <div className="ticket-detail-footer">
        <button type="button" className="btn danger" onClick={handleDelete}>
          削除
        </button>
      </div>
    </div>
  );
}

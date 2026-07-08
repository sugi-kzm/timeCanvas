import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";
import { listEntriesForTaskIds } from "../../db/entryRepo";
import type { Category, Task, TimeEntry } from "../../types";
import { TASK_STATUSES, statusConfig } from "../../lib/status";
import { DOW_LABELS, durationMinutes, formatHm, formatHours, fromLocalIso } from "../../lib/dates";
import {
  groupTickets,
  rollupActualMinutes,
  rollupEstimateMinutes,
  taskDepth,
  totalEstimateMinutes,
  type TicketChild,
  type TicketGroup as TicketBundle,
} from "../../lib/tickets";
import { IconChevronRight } from "../icons";
import { TicketRow } from "./TicketRow";
import { CreateTicketDialog } from "./CreateTicketDialog";

interface TicketsTabProps {
  /** 空集合 = すべて表示。分類 ID（"__none__" はなし）の集合で絞り込み */
  filterGroupIds: ReadonlySet<string>;
}

/**
 * チケット/タスクを包括的に管理するタブ（Jira/Atlassian 風のマスタ・ディテール構成）。
 * 左に親子階層のリスト、右に選択項目の詳細編集パネル。
 */
export function TicketsTab({ filterGroupIds }: TicketsTabProps) {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const ticketSortMode = useAppStore((s) => s.ticketSortMode);
  const setTicketSortMode = useAppStore((s) => s.setTicketSortMode);
  const reorderTickets = useAppStore((s) => s.reorderTickets);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedCollapsed, setExpandedCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [dragOverTicketId, setDragOverTicketId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const all = groupTickets(tasks, ticketSortMode);
    return all.filter((g) => filterGroupIds.size === 0 || filterGroupIds.has(g.ticket.groupId ?? "__none__"));
  }, [tasks, filterGroupIds, ticketSortMode]);

  const handleTicketDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTicketId(null);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId === "" || draggedId === targetId) return;
    const ids = groups.map((g) => g.ticket.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedId);
    void reorderTickets(reordered);
  };

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

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

  const soleGroupId = filterGroupIds.size === 1 ? [...filterGroupIds][0] : undefined;
  const initialGroupId =
    soleGroupId !== undefined && soleGroupId !== "__none__" ? soleGroupId : null;

  const totalEstimate = useMemo(() => totalEstimateMinutes(groups), [groups]);

  return (
    <div className="tickets-tab">
      <div className="tickets-tab-master">
        <div className="task-add-row">
          <button type="button" className="btn primary" onClick={() => setCreateDialogOpen(true)}>
            + 新規チケット
          </button>
          <div className="view-switch ticket-sort-switch" role="group" aria-label="並び順切替">
            <button
              type="button"
              className={`seg ${ticketSortMode === "due" ? "active" : ""}`}
              onClick={() => void setTicketSortMode("due")}
            >
              期限順
            </button>
            <button
              type="button"
              className={`seg ${ticketSortMode === "manual" ? "active" : ""}`}
              onClick={() => void setTicketSortMode("manual")}
            >
              手動
            </button>
          </div>
          <span className="tickets-tab-totals">
            {groups.length}件 / 見積合計 {formatHours(totalEstimate)}h
          </span>
        </div>
        {groups.length === 0 && (
          <p className="tasks-empty">チケットがありません。上のボタンから追加してください。</p>
        )}
        {groups.length > 0 && (
          <div className="ticket-list-header">
            <span>状態</span>
            <span>チケット名</span>
            <span>子タスク</span>
            <span>カテゴリ</span>
            <span>見積</span>
            <span>実績</span>
          </div>
        )}
        <ul className="task-list">
          {groups.map((group) => (
            <TicketMasterRow
              key={group.ticket.id}
              group={group}
              categories={categories}
              expanded={!expandedCollapsed.has(group.ticket.id)}
              onToggle={() => toggleExpand(group.ticket.id)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              expandedCollapsed={expandedCollapsed}
              onToggleChild={toggleExpand}
              dragOver={dragOverTicketId === group.ticket.id}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", group.ticket.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTicketId(group.ticket.id);
              }}
              onDragLeave={() => setDragOverTicketId(null)}
              onDrop={(e) => handleTicketDrop(group.ticket.id, e)}
            />
          ))}
        </ul>
      </div>
      <div className="tickets-tab-detail">
        {selectedTask === null ? (
          <div className="ticket-detail ticket-detail-empty">
            <p className="tasks-empty">左のリストからチケット/タスクを選ぶと詳細を編集できます。</p>
          </div>
        ) : (
          <TicketDetail
            task={selectedTask}
            depth={taskDepth(selectedTask, tasksById)}
            parent={selectedParent}
            children={selectedChildren}
            onSelectParent={setSelectedId}
            onSelectChild={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      {createDialogOpen && (
        <CreateTicketDialog
          initialGroupId={initialGroupId}
          onClose={() => setCreateDialogOpen(false)}
          onCreated={(id) => {
            setSelectedId(id);
            setCreateDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface TicketMasterRowProps {
  group: TicketBundle;
  categories: readonly Category[];
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedCollapsed: ReadonlySet<string>;
  onToggleChild: (id: string) => void;
  dragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function TicketMasterRow({
  group,
  categories,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  expandedCollapsed,
  onToggleChild,
  dragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: TicketMasterRowProps) {
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const { ticket, children } = group;
  const rollupActual = rollupActualMinutes(group, actualMinutes);
  const rollupEstimate = rollupEstimateMinutes(group);

  return (
    <li
      className={`ticket-block ${dragOver ? "drag-over" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="ticket-row-line" draggable onDragStart={onDragStart}>
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
        <TicketRow
          ticket={{
            id: ticket.id,
            displayNo: ticket.displayNo,
            title: ticket.title,
            status: ticket.status,
            categoryId: ticket.categoryId,
            childCount: children.length,
            estimateMinutes: rollupEstimate,
            actualMinutes: rollupActual,
          }}
          categories={categories}
          selected={ticket.id === selectedId}
          onSelect={onSelect}
        />
      </div>
      {expanded && children.length > 0 && (
        <ul className="task-children">
          {children.map((child) => (
            <TicketChildRow
              key={child.id}
              child={child}
              categories={categories}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={!expandedCollapsed.has(child.id)}
              onToggle={() => onToggleChild(child.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface TicketChildRowProps {
  child: TicketChild;
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

function TicketChildRow({
  child,
  categories,
  selectedId,
  onSelect,
  expanded,
  onToggle,
}: TicketChildRowProps) {
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const grandchildren = child.children;

  return (
    <li className="ticket-block child">
      <div className="ticket-row-line child">
        <span className="child-indent" />
        <span
          className={`tree-caret-btn ${grandchildren.length > 0 ? "" : "hidden"}`}
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
        <TicketRow
          ticket={{
            id: child.id,
            displayNo: child.displayNo,
            title: child.title,
            status: child.status,
            categoryId: child.categoryId,
            childCount: grandchildren.length,
            estimateMinutes: child.estimateMinutes,
            actualMinutes: actualMinutes.get(child.id) ?? 0,
          }}
          categories={categories}
          selected={child.id === selectedId}
          onSelect={onSelect}
        />
      </div>
      {expanded && grandchildren.length > 0 && (
        <ul className="task-children">
          {grandchildren.map((grandchild) => (
            <li key={grandchild.id} className="ticket-row-line child grandchild">
              <span className="child-indent" />
              <span className="child-indent" />
              <TicketRow
                ticket={{
                  id: grandchild.id,
                  displayNo: grandchild.displayNo,
                  title: grandchild.title,
                  status: grandchild.status,
                  categoryId: grandchild.categoryId,
                  childCount: 0,
                  estimateMinutes: grandchild.estimateMinutes,
                  actualMinutes: actualMinutes.get(grandchild.id) ?? 0,
                }}
                categories={categories}
                selected={grandchild.id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface TicketDetailProps {
  task: Task;
  /** チケットからの深さ（0=チケット, 1=子タスク, 2=孫タスク） */
  depth: number;
  parent: Task | null;
  children: Task[];
  onSelectParent: (id: string) => void;
  onSelectChild: (id: string) => void;
  onClose: () => void;
}

function TicketDetail({
  task,
  depth,
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
  const [workLog, setWorkLog] = useState<TimeEntry[]>([]);
  const isTicket = task.parentId === null;
  const canAddChild = depth < 2;
  const actual = actualMinutes.get(task.id) ?? 0;

  useEffect(() => {
    let cancelled = false;
    void listEntriesForTaskIds([task.id, ...children.map((c) => c.id)]).then((entries) => {
      if (!cancelled) setWorkLog(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id, children]);

  const childTitleById = useMemo(() => new Map(children.map((c) => [c.id, c.title])), [children]);

  const sortedWorkLog = useMemo(
    () => [...workLog].sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [workLog],
  );

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

      <div className="ticket-detail-title-row">
        <span className="ticket-detail-no">#{task.displayNo}</span>
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
      </div>

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

      <div className="ticket-detail-worklog">
        <span className="ticket-detail-label">作業ログ</span>
        {sortedWorkLog.length === 0 ? (
          <p className="ticket-detail-worklog-empty">記録された作業はありません。</p>
        ) : (
          <ul className="ticket-detail-worklog-list">
            {sortedWorkLog.map((entry) => {
              const start = fromLocalIso(entry.startAt);
              const end = fromLocalIso(entry.endAt);
              const childTitle = entry.taskId !== null ? childTitleById.get(entry.taskId) : undefined;
              return (
                <li key={entry.id} className="ticket-detail-worklog-row">
                  <span className="ticket-detail-worklog-date">
                    {start.getFullYear()}/{start.getMonth() + 1}/{start.getDate()}（
                    {DOW_LABELS[start.getDay()]}）
                  </span>
                  <span className="ticket-detail-worklog-time">
                    {formatHm(start)} - {formatHm(end)}
                  </span>
                  <span className="ticket-detail-worklog-duration">
                    {formatHours(durationMinutes(entry.startAt, entry.endAt))}h
                  </span>
                  {childTitle !== undefined && (
                    <span className="ticket-detail-worklog-child">{childTitle}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

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

      {canAddChild && (
        <div className="ticket-detail-children">
          <span className="ticket-detail-label">{isTicket ? "子タスク" : "孫タスク"}</span>
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
              placeholder={isTicket ? "子タスクを追加（Enter で登録）" : "孫タスクを追加（Enter で登録）"}
              value={newChildTitle}
              onChange={(e) => setNewChildTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitChild();
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

import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task, TaskStatus } from "../../types";
import { TASK_STATUSES } from "../../lib/status";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import { addMinutes, formatHours, startOfDay, toLocalIso } from "../../lib/dates";

interface KanbanBoardProps {
  /** null = すべて表示。カテゴリ ID で絞り込み */
  filterCategoryId: string | null;
}

/**
 * Notion 風のカンバンボード。
 * 子を持つチケットは「入れ物」なので表示せず、作業単位（子タスクと
 * 子を持たないチケット）をカードとして扱う。
 */
export function KanbanBoard({ filterCategoryId }: KanbanBoardProps) {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const moveTaskStatus = useAppStore((s) => s.moveTaskStatus);
  const addTask = useAppStore((s) => s.addTask);
  const removeTask = useAppStore((s) => s.removeTask);
  const openEditor = useAppStore((s) => s.openEditor);

  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [addingStatus, setAddingStatus] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const ticketById = useMemo(
    () => new Map(tasks.filter((t) => t.parentId === null).map((t) => [t.id, t])),
    [tasks],
  );
  const parentIds = useMemo(
    () => new Set(tasks.filter((t) => t.parentId !== null).map((t) => t.parentId as string)),
    [tasks],
  );

  const cards = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !parentIds.has(t.id) &&
          (filterCategoryId === null || t.categoryId === filterCategoryId),
      ),
    [tasks, parentIds, filterCategoryId],
  );

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const status of TASK_STATUSES) map.set(status.key, []);
    for (const card of cards) map.get(card.status)?.push(card);
    return map;
  }, [cards]);

  const handleDrop = (status: TaskStatus, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStatus(null);
    const id = e.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === id);
    if (task !== undefined) void moveTaskStatus(task, status);
  };

  const submitNew = (status: TaskStatus) => {
    const title = newTitle.trim();
    if (title !== "") {
      // ボードから作るものは独立した作業単位（チケット）として登録する
      void addTask(title, filterCategoryId, null).then(() => {
        const created = useAppStore.getState().tasks.find(
          (t) => t.title === title && t.parentId === null && t.status === "todo",
        );
        if (created !== undefined && status !== "todo") {
          void moveTaskStatus(created, status);
        }
      });
    }
    setNewTitle("");
    setAddingStatus(null);
  };

  // 「レビュー中」列はカードがあるときだけ表示する（既定は To-Do / 進行中 / 完了 の3列）
  const visibleStatuses = TASK_STATUSES.filter(
    (status) => status.key !== "review" || (byStatus.get("review")?.length ?? 0) > 0,
  );

  return (
    <div className="kanban">
      {visibleStatuses.map((status) => {
        const columnCards = byStatus.get(status.key) ?? [];
        return (
          <div
            key={status.key}
            className={`kanban-column ${dragOverStatus === status.key ? "drag-over" : ""}`}
            style={{ background: status.bg }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(status.key);
            }}
            onDragLeave={() => setDragOverStatus(null)}
            onDrop={(e) => handleDrop(status.key, e)}
          >
            <div className="kanban-column-header">
              <span
                className="kanban-status-chip"
                style={{ color: status.text }}
              >
                <span className="kanban-status-dot" style={{ background: status.dot }} />
                {status.label}
              </span>
              <span className="kanban-count">{columnCards.length}</span>
            </div>
            <div className="kanban-cards">
              {columnCards.map((card) => {
                const parent =
                  card.parentId !== null ? ticketById.get(card.parentId) : undefined;
                const category =
                  card.categoryId !== null ? categoryById.get(card.categoryId) : undefined;
                const actual = actualMinutes.get(card.id) ?? 0;
                return (
                  <div
                    key={card.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    title="ドラッグでステータスを変更"
                  >
                    <button
                      type="button"
                      className="kanban-card-del"
                      aria-label={`${card.title} を削除`}
                      title="削除"
                      onClick={() => {
                        if (window.confirm(`「${card.title}」を削除しますか？\n（記録済みの実績は残ります）`)) {
                          void removeTask(card.id);
                        }
                      }}
                    >
                      ×
                    </button>
                    {parent !== undefined && (
                      <span className="kanban-card-parent">{parent.title}</span>
                    )}
                    <span className="kanban-card-title">{card.title}</span>
                    <span className="kanban-card-meta">
                      <span
                        className="category-dot"
                        style={{ background: category?.color ?? UNCATEGORIZED_COLOR }}
                      />
                      {category?.name ?? "未分類"}
                      {(card.estimateMinutes !== null || actual > 0) && (
                        <span className="kanban-card-hours">
                          {actual > 0 ? `${formatHours(actual)}h` : "-"}
                          {card.estimateMinutes !== null &&
                            ` / ${formatHours(card.estimateMinutes)}h`}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="link-btn kanban-card-record"
                      onClick={() => {
                        const now = new Date();
                        const start = addMinutes(startOfDay(now), (now.getHours() + 1) * 60);
                        openEditor({
                          mode: "create",
                          title: card.title,
                          categoryId: card.categoryId,
                          taskId: card.id,
                          startAt: toLocalIso(start),
                          endAt: toLocalIso(addMinutes(start, 60)),
                        });
                      }}
                    >
                      記録
                    </button>
                  </div>
                );
              })}
            </div>
            {addingStatus === status.key ? (
              <input
                type="text"
                className="text-input kanban-add-input"
                autoFocus
                placeholder="タイトルを入力（Enter で追加）"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNew(status.key);
                  if (e.key === "Escape") {
                    setNewTitle("");
                    setAddingStatus(null);
                  }
                }}
                onBlur={() => {
                  setNewTitle("");
                  setAddingStatus(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="kanban-add-btn"
                style={{ color: status.text }}
                onClick={() => setAddingStatus(status.key)}
              >
                + 新規
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

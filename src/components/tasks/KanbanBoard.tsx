import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";
import type { Task, TaskStatus } from "../../types";
import { TASK_STATUSES } from "../../lib/status";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import { addMinutes, formatHours, startOfDay, toLocalIso } from "../../lib/dates";

/** 完了カードは当月中に完了したものだけ表示する（月が変われば自然に消える） */
function completedThisMonth(task: Task, now: Date): boolean {
  if (task.status !== "done") return true;
  if (task.completedAt === null) return true;
  const completed = new Date(task.completedAt);
  return completed.getFullYear() === now.getFullYear() && completed.getMonth() === now.getMonth();
}

interface KanbanBoardProps {
  /** null = すべて表示。分類 ID で絞り込み */
  filterGroupId: string | null;
}

/**
 * Notion 風のカンバンボード。
 * ここに載るのは実際の作業単位である「子タスク」のみ。
 * チケット（親）そのものや新規チケットの作成は「チケット」タブで行う。
 */
export function KanbanBoard({ filterGroupId }: KanbanBoardProps) {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const moveTaskStatus = useAppStore((s) => s.moveTaskStatus);
  const removeTask = useAppStore((s) => s.removeTask);
  const openEditor = useAppStore((s) => s.openEditor);
  const setTasksViewMode = useAppStore((s) => s.setTasksViewMode);

  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const ticketById = useMemo(
    () => new Map(tasks.filter((t) => t.parentId === null).map((t) => [t.id, t])),
    [tasks],
  );

  const now = useMemo(() => new Date(), []);

  // カンバンには子タスクのみを載せる（親チケット自体は「チケット」タブで管理）
  const cards = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.parentId !== null &&
          (filterGroupId === null || t.groupId === filterGroupId) &&
          completedThisMonth(t, now),
      ),
    [tasks, filterGroupId, now],
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

  const handleDelete = (card: Task) => {
    void confirmDialog({
      title: "タスクを削除",
      message: `「${card.title}」を削除しますか？\n（記録済みの実績は残ります）`,
      danger: true,
    }).then((ok) => {
      if (ok) void removeTask(card.id);
    });
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
              <span className="kanban-status-chip" style={{ color: status.text }}>
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
                      onClick={() => handleDelete(card)}
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
                        const nowTime = new Date();
                        const start = addMinutes(
                          startOfDay(nowTime),
                          (nowTime.getHours() + 1) * 60,
                        );
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
              {columnCards.length === 0 && (
                <p className="kanban-empty-hint">
                  {status.key === "todo" ? (
                    <>
                      「チケット」タブでタスクを追加してください
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setTasksViewMode("tickets")}
                      >
                        開く →
                      </button>
                    </>
                  ) : (
                    "ここにはありません"
                  )}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

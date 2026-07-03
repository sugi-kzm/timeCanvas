import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { formatHours, toLocalIso, addMinutes, startOfDay } from "../../lib/dates";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import {
  childProgress,
  groupTickets,
  rollupActualMinutes,
  rollupEstimateMinutes,
  type TicketGroup,
} from "../../lib/tickets";
import { IconChevronRight } from "../icons";

export function TasksView() {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const addTask = useAppStore((s) => s.addTask);

  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string | null>(categories[0]?.id ?? null);

  const groups = useMemo(() => groupTickets(tasks), [tasks]);

  const submit = () => {
    const title = newTitle.trim();
    if (title === "") return;
    void addTask(title, newCategoryId, null);
    setNewTitle("");
  };

  return (
    <div className="tasks-view">
      <div className="tasks-inner">
        <h2 className="tasks-heading">チケット</h2>
        <p className="tasks-lead">
          チケット = ゴールのある大きな作業単位。配下にタスクを追加して細分化できます。
          記録（実績）はタスク単位でもチケット全体でも紐付けられます。
        </p>
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

        <div className="task-list-header">
          <span className="tlh-title">チケット / タスク</span>
          <span className="tlh-category">カテゴリ</span>
          <span className="tlh-estimate">見積</span>
          <span className="tlh-actual">実績</span>
          <span className="tlh-actions" />
        </div>

        {groups.length === 0 && (
          <p className="tasks-empty">
            チケットはまだありません。上の入力欄から追加してください。
            チケットに見積時間を設定し、カレンダーの記録と紐付けると、
            見積と実績を比較できるようになります。
          </p>
        )}

        <ul className="task-list">
          {groups.map((group) => (
            <TicketBlock key={group.ticket.id} group={group} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TicketBlock({ group }: { group: TicketGroup }) {
  const addTask = useAppStore((s) => s.addTask);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [childTitle, setChildTitle] = useState("");

  const { ticket, children } = group;
  const rollupActual = rollupActualMinutes(group, actualMinutes);
  const rollupEstimate = rollupEstimateMinutes(group);
  const progress = childProgress(group);

  const submitChild = () => {
    const title = childTitle.trim();
    if (title === "") return;
    void addTask(title, ticket.categoryId, ticket.id);
    setChildTitle("");
  };

  return (
    <li className="ticket-block">
      <TaskRow
        task={ticket}
        isTicket
        rollupActual={rollupActual}
        rollupEstimate={rollupEstimate}
        progress={progress}
        expanded={expanded}
        onToggleExpand={children.length > 0 ? () => setExpanded(!expanded) : undefined}
        onAddChild={() => {
          setExpanded(true);
          setAdding(true);
        }}
      />
      {expanded && (
        <ul className="task-children">
          {children.map((child) => (
            <TaskRow key={child.id} task={child} isTicket={false} />
          ))}
          {adding && (
            <li className="task-child-add">
              <input
                type="text"
                className="text-input"
                autoFocus
                placeholder="タスク名を入力（Enter で追加、Esc で閉じる）"
                value={childTitle}
                onChange={(e) => setChildTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitChild();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setChildTitle("");
                  }
                }}
                onBlur={() => {
                  if (childTitle.trim() === "") setAdding(false);
                }}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

interface TaskRowProps {
  task: Task;
  isTicket: boolean;
  rollupActual?: number;
  rollupEstimate?: number | null;
  progress?: { done: number; total: number } | null;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onAddChild?: () => void;
}

function TaskRow({
  task,
  isTicket,
  rollupActual,
  rollupEstimate,
  progress,
  expanded,
  onToggleExpand,
  onAddChild,
}: TaskRowProps) {
  const categories = useAppStore((s) => s.categories);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const updateTask = useAppStore((s) => s.updateTask);
  const toggleTaskDone = useAppStore((s) => s.toggleTaskDone);
  const removeTask = useAppStore((s) => s.removeTask);
  const openEditor = useAppStore((s) => s.openEditor);
  const setView = useAppStore((s) => s.setView);

  const ownActual = actualMinutes.get(task.id) ?? 0;
  const actual = isTicket ? (rollupActual ?? ownActual) : ownActual;
  const hasChildEstimates = isTicket && rollupEstimate !== null && rollupEstimate !== undefined;
  const estimate = isTicket ? (rollupEstimate ?? null) : task.estimateMinutes;
  const over = estimate !== null && estimate > 0 && actual > estimate;
  const category =
    task.categoryId !== null ? categories.find((c) => c.id === task.categoryId) : undefined;

  // 「記録」: この項目を紐付けた状態で、次の正時から1時間の記録作成を開く
  const recordNow = () => {
    const now = new Date();
    const start = addMinutes(startOfDay(now), (now.getHours() + 1) * 60);
    openEditor({
      mode: "create",
      title: task.title,
      categoryId: task.categoryId,
      taskId: task.id,
      startAt: toLocalIso(start),
      endAt: toLocalIso(addMinutes(start, 60)),
    });
    setView("calendar");
  };

  return (
    <li className={`task-row ${task.status === "done" ? "done" : ""} ${isTicket ? "ticket" : "child"}`}>
      {isTicket ? (
        <button
          type="button"
          className={`tree-caret-btn ${onToggleExpand === undefined ? "hidden" : ""}`}
          aria-label={expanded === true ? "折りたたむ" : "展開する"}
          onClick={onToggleExpand}
        >
          <span className={`tree-caret ${expanded === true ? "open" : ""}`}>
            <IconChevronRight size={13} />
          </span>
        </button>
      ) : (
        <span className="child-indent" />
      )}
      <input
        type="checkbox"
        checked={task.status === "done"}
        onChange={() => void toggleTaskDone(task)}
        aria-label={`${task.title} を${task.status === "done" ? "未完了" : "完了"}にする`}
      />
      <input
        type="text"
        className={`task-title-input ${isTicket ? "ticket-title" : ""}`}
        defaultValue={task.title}
        onBlur={(e) => {
          const title = e.target.value.trim();
          if (title !== "" && title !== task.title) void updateTask({ ...task, title });
        }}
      />
      {isTicket && progress !== null && progress !== undefined && (
        <span className="ticket-progress" title="完了した子タスク / 子タスク数">
          {progress.done}/{progress.total}
        </span>
      )}
      <span className="task-category">
        <span
          className="category-dot"
          style={{ background: category?.color ?? UNCATEGORIZED_COLOR }}
        />
        <select
          className="task-category-select"
          value={task.categoryId ?? ""}
          onChange={(e) =>
            void updateTask({
              ...task,
              categoryId: e.target.value === "" ? null : e.target.value,
            })
          }
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="">未分類</option>
        </select>
      </span>
      <span className="task-estimate">
        {hasChildEstimates && task.estimateMinutes === null ? (
          <span title="子タスクの見積合計">Σ {formatHours(estimate ?? 0)}h</span>
        ) : (
          <>
            <input
              type="number"
              className="task-estimate-input"
              min={0}
              step={0.25}
              placeholder="-"
              defaultValue={
                task.estimateMinutes !== null ? Number(formatHours(task.estimateMinutes)) : ""
              }
              onBlur={(e) => {
                const value = e.target.value.trim();
                const minutes = value === "" ? null : Math.round(Number(value) * 60);
                if (minutes !== task.estimateMinutes && (minutes === null || minutes >= 0)) {
                  void updateTask({ ...task, estimateMinutes: minutes });
                }
              }}
            />
            h
          </>
        )}
      </span>
      <span className={`task-actual ${over ? "over" : ""}`}>
        {actual > 0 ? `${formatHours(actual)}h` : "-"}
        {estimate !== null && estimate > 0 && actual > 0 && (
          <span className="task-ratio"> / {Math.round((actual / estimate) * 100)}%</span>
        )}
      </span>
      <span className="task-actions">
        {isTicket && task.status === "open" && (
          <button type="button" className="btn small-btn" onClick={onAddChild} title="子タスクを追加">
            +タスク
          </button>
        )}
        {task.status === "open" && (
          <button
            type="button"
            className="btn small-btn"
            onClick={recordNow}
            title="この項目の時間を記録"
          >
            記録
          </button>
        )}
        <button
          type="button"
          className="btn small-btn danger"
          onClick={() => {
            const warning = isTicket
              ? `チケット「${task.title}」を削除しますか？\n（子タスクも削除されます。記録済みの実績は残ります）`
              : `タスク「${task.title}」を削除しますか？\n（記録済みの実績は残ります）`;
            if (window.confirm(warning)) void removeTask(task.id);
          }}
        >
          削除
        </button>
      </span>
    </li>
  );
}

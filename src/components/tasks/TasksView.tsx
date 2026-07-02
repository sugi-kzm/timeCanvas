import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { formatHours, toLocalIso, addMinutes, startOfDay } from "../../lib/dates";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";

export function TasksView() {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const addTask = useAppStore((s) => s.addTask);

  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string | null>(categories[0]?.id ?? null);

  const openTasks = tasks.filter((t) => t.status === "open");
  const doneTasks = tasks.filter((t) => t.status === "done");

  const submit = () => {
    const title = newTitle.trim();
    if (title === "") return;
    void addTask(title, newCategoryId);
    setNewTitle("");
  };

  return (
    <div className="tasks-view">
      <div className="tasks-inner">
        <h2 className="tasks-heading">タスク</h2>
        <div className="task-add-row">
          <input
            type="text"
            className="text-input"
            placeholder="新しいタスクを追加（Enter で登録）"
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
          <span className="tlh-title">タスク</span>
          <span className="tlh-category">カテゴリ</span>
          <span className="tlh-estimate">見積</span>
          <span className="tlh-actual">実績</span>
          <span className="tlh-actions" />
        </div>

        {openTasks.length === 0 && doneTasks.length === 0 && (
          <p className="tasks-empty">
            タスクはまだありません。上の入力欄から追加してください。
            タスクに紐付けて時間を記録すると、見積と実績を比較できます。
          </p>
        )}

        <ul className="task-list">
          {openTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>

        {doneTasks.length > 0 && (
          <>
            <h3 className="tasks-subheading">完了済み（直近 {doneTasks.length} 件）</h3>
            <ul className="task-list done">
              {doneTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const categories = useAppStore((s) => s.categories);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const updateTask = useAppStore((s) => s.updateTask);
  const toggleTaskDone = useAppStore((s) => s.toggleTaskDone);
  const removeTask = useAppStore((s) => s.removeTask);
  const openEditor = useAppStore((s) => s.openEditor);
  const setView = useAppStore((s) => s.setView);

  const actual = actualMinutes.get(task.id) ?? 0;
  const estimate = task.estimateMinutes;
  const over = estimate !== null && estimate > 0 && actual > estimate;
  const category = task.categoryId !== null ? categories.find((c) => c.id === task.categoryId) : undefined;

  // 「記録」: このタスクを紐付けた状態で、今日の次の正時から1時間の記録作成を開く
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
    <li className={`task-row ${task.status === "done" ? "done" : ""}`}>
      <input
        type="checkbox"
        checked={task.status === "done"}
        onChange={() => void toggleTaskDone(task)}
        aria-label={`${task.title} を${task.status === "done" ? "未完了" : "完了"}にする`}
      />
      <input
        type="text"
        className="task-title-input"
        defaultValue={task.title}
        onBlur={(e) => {
          const title = e.target.value.trim();
          if (title !== "" && title !== task.title) void updateTask({ ...task, title });
        }}
      />
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
        <input
          type="number"
          className="task-estimate-input"
          min={0}
          step={0.25}
          placeholder="-"
          defaultValue={estimate !== null ? Number(formatHours(estimate)) : ""}
          onBlur={(e) => {
            const value = e.target.value.trim();
            const minutes = value === "" ? null : Math.round(Number(value) * 60);
            if (minutes !== task.estimateMinutes && (minutes === null || minutes >= 0)) {
              void updateTask({ ...task, estimateMinutes: minutes });
            }
          }}
        />
        h
      </span>
      <span className={`task-actual ${over ? "over" : ""}`}>
        {actual > 0 ? `${formatHours(actual)}h` : "-"}
        {estimate !== null && estimate > 0 && actual > 0 && (
          <span className="task-ratio"> / {Math.round((actual / estimate) * 100)}%</span>
        )}
      </span>
      <span className="task-actions">
        {task.status === "open" && (
          <button type="button" className="btn" onClick={recordNow} title="このタスクの時間を記録">
            記録
          </button>
        )}
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (window.confirm(`タスク「${task.title}」を削除しますか？\n（記録済みの実績は残ります）`)) {
              void removeTask(task.id);
            }
          }}
        >
          削除
        </button>
      </span>
    </li>
  );
}

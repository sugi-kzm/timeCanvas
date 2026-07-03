import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { groupTickets } from "../../lib/tickets";

function timePart(iso: string): string {
  return iso.slice(11, 16);
}

export function EntryDialog() {
  const editor = useAppStore((s) => s.editor);
  const categories = useAppStore((s) => s.categories);
  const tasks = useAppStore((s) => s.tasks);
  const addEntry = useAppStore((s) => s.addEntry);
  const modifyEntry = useAppStore((s) => s.modifyEntry);
  const removeEntry = useAppStore((s) => s.removeEntry);
  const closeEditor = useAppStore((s) => s.closeEditor);

  const initial =
    editor === null
      ? null
      : editor.mode === "edit"
        ? {
            title: editor.entry.title,
            categoryId: editor.entry.categoryId,
            date: editor.entry.startAt.slice(0, 10),
            start: timePart(editor.entry.startAt),
            end: timePart(editor.entry.endAt),
            memo: editor.entry.memo,
            taskId: editor.entry.taskId,
          }
        : {
            title: editor.title,
            categoryId: editor.categoryId,
            date: editor.startAt.slice(0, 10),
            start: timePart(editor.startAt),
            end: timePart(editor.endAt),
            memo: "",
            taskId: editor.taskId ?? null,
          };

  const [title, setTitle] = useState(initial?.title ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [date, setDate] = useState(initial?.date ?? "");
  const [start, setStart] = useState(initial?.start ?? "09:00");
  const [end, setEnd] = useState(initial?.end ?? "10:00");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [taskId, setTaskId] = useState<string | null>(initial?.taskId ?? null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // 選択肢: 未完了のチケット/タスク + 現在紐付いているもの（完了済みでも表示する）
  const isSelectable = (t: Task) => t.status === "open" || t.id === taskId;
  const ticketGroups = useMemo(
    () =>
      groupTickets(tasks)
        .map(({ ticket, children }) => ({ ticket, children: children.filter(isSelectable) }))
        .filter(({ ticket, children }) => isSelectable(ticket) || children.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, taskId],
  );

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  if (editor === null) return null;

  const save = () => {
    if (end <= start) {
      setError("終了時刻は開始時刻より後にしてください");
      return;
    }
    const startAt = `${date}T${start}:00`;
    const endAt = `${date}T${end}:00`;
    const entryTitle = title.trim() === "" ? "無題" : title.trim();

    if (editor.mode === "edit") {
      void modifyEntry({
        ...editor.entry,
        title: entryTitle,
        categoryId,
        startAt,
        endAt,
        memo,
        taskId,
      });
    } else {
      void addEntry({ title: entryTitle, categoryId, startAt, endAt, memo, taskId });
      closeEditor();
    }
  };

  const remove = () => {
    if (editor.mode !== "edit") return;
    if (window.confirm("この記録を削除しますか？")) {
      void removeEntry(editor.entry.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closeEditor();
  };

  return (
    <div className="modal-backdrop" onPointerDown={closeEditor}>
      <div
        className="dialog"
        role="dialog"
        aria-label="記録の編集"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="dialog-title">{editor.mode === "edit" ? "記録の編集" : "記録の作成"}</h2>
        <label className="field">
          <span className="field-label">タイトル</span>
          <input
            ref={titleRef}
            type="text"
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="何をしましたか？"
          />
        </label>
        <label className="field">
          <span className="field-label">カテゴリ</span>
          <select
            className="select-input"
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value === "" ? null : e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">未分類</option>
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">日付</span>
            <input
              type="date"
              className="text-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">開始</span>
            <input
              type="time"
              className="text-input"
              step={900}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">終了</span>
            <input
              type="time"
              className="text-input"
              step={900}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {ticketGroups.length > 0 && (
          <label className="field">
            <span className="field-label">チケット / タスク（見積と実績を紐付け）</span>
            <select
              className="select-input"
              value={taskId ?? ""}
              onChange={(e) => setTaskId(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">なし</option>
              {ticketGroups.map(({ ticket, children }) => (
                <optgroup key={ticket.id} label={ticket.title}>
                  {isSelectable(ticket) && (
                    <option value={ticket.id}>{ticket.title}（チケット全体）</option>
                  )}
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field-label">メモ</span>
          <textarea
            className="textarea-input"
            rows={4}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
        {error !== null && <p className="field-error">{error}</p>}
        <div className="dialog-actions">
          {editor.mode === "edit" && (
            <button type="button" className="btn danger" onClick={remove}>
              削除
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn" onClick={closeEditor}>
            キャンセル
          </button>
          <button type="button" className="btn primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

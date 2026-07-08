import { useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { TASK_STATUSES } from "../../lib/status";

interface CreateTicketDialogProps {
  /** 起票時の初期分類。単一選択の絞り込み中はその分類を初期値にする */
  initialGroupId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** 新規チケットの作成モーダル（子タスク管理は含まない。作成後に詳細パネルで追加する） */
export function CreateTicketDialog({
  initialGroupId,
  onClose,
  onCreated,
}: CreateTicketDialogProps) {
  const categories = useAppStore((s) => s.categories);
  const ticketGroups = useAppStore((s) => s.ticketGroups);
  const addTask = useAppStore((s) => s.addTask);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimateHours, setEstimateHours] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed === "") {
      setError("タイトルを入力してください");
      titleRef.current?.focus();
      return;
    }
    const estimateMinutes =
      estimateHours.trim() === "" ? null : Math.round(Number(estimateHours) * 60);
    void addTask(trimmed, categoryId, null, groupId, {
      status,
      startDate: startDate === "" ? null : startDate,
      dueDate: dueDate === "" ? null : dueDate,
      estimateMinutes: estimateMinutes !== null && estimateMinutes >= 0 ? estimateMinutes : null,
      memo,
    }).then((created) => {
      if (created !== null) onCreated(created.id);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="新規チケットの作成"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="dialog-title">新規チケット</h2>
        <label className="field">
          <span className="field-label">タイトル</span>
          <input
            ref={titleRef}
            type="text"
            className="text-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="チケット名"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">ステータス</span>
            <select
              className="select-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as Task["status"])}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">分類</span>
            <select
              className="select-input"
              value={groupId ?? ""}
              onChange={(e) => setGroupId(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">なし</option>
              {ticketGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">カテゴリ</span>
            <select
              className="select-input"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value === "" ? null : e.target.value)}
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

        <div className="field-row">
          <label className="field">
            <span className="field-label">開始日</span>
            <input
              type="date"
              className="text-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">期限日</span>
            <input
              type="date"
              className="text-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">見積 (h)</span>
            <input
              type="number"
              className="text-input"
              min={0}
              step={0.25}
              value={estimateHours}
              onChange={(e) => setEstimateHours(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">説明・メモ</span>
          <textarea
            className="textarea-input"
            rows={4}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>

        {error !== null && <p className="field-error">{error}</p>}

        <div className="dialog-actions">
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn primary" onClick={submit}>
            作成
          </button>
        </div>
      </div>
    </div>
  );
}

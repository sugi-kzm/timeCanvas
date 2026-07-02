import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { dayMinuteToIso, formatMinutesHm, DOW_LABELS } from "../../lib/dates";

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 210;

export function QuickCreatePopover() {
  const quickCreate = useAppStore((s) => s.quickCreate);
  const categories = useAppStore((s) => s.categories);
  const addEntry = useAppStore((s) => s.addEntry);
  const closeQuickCreate = useAppStore((s) => s.closeQuickCreate);
  const openEditor = useAppStore((s) => s.openEditor);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (quickCreate === null) return null;

  const { day, startMin, endMin, x, y } = quickCreate;
  const startAt = dayMinuteToIso(day, startMin);
  const endAt = dayMinuteToIso(day, endMin);

  const left = Math.max(8, Math.min(x + 8, window.innerWidth - POPOVER_WIDTH - 8));
  const top = Math.max(8, Math.min(y + 8, window.innerHeight - POPOVER_HEIGHT - 8));

  const save = () => {
    void addEntry({
      title: title.trim() === "" ? "無題" : title.trim(),
      categoryId,
      startAt,
      endAt,
      memo: "",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") closeQuickCreate();
  };

  return (
    <>
      <div className="popover-backdrop" onPointerDown={closeQuickCreate} />
      <div
        className="quick-create"
        style={{ left, top, width: POPOVER_WIDTH }}
        role="dialog"
        aria-label="記録のクイック作成"
      >
        <p className="quick-create-when">
          {day.getMonth() + 1}月{day.getDate()}日（{DOW_LABELS[day.getDay()]}）{" "}
          {formatMinutesHm(startMin)} - {formatMinutesHm(endMin)}
        </p>
        <input
          ref={inputRef}
          type="text"
          className="text-input"
          placeholder="何をしましたか？"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
        />
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
        <div className="quick-create-actions">
          <button
            type="button"
            className="link-btn"
            onClick={() => openEditor({ mode: "create", title, startAt, endAt, categoryId })}
          >
            詳細を編集
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={closeQuickCreate}>
            キャンセル
          </button>
          <button type="button" className="btn primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </>
  );
}

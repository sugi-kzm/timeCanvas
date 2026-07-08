import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { dayMinuteToIso, formatMinutesHm, DOW_LABELS } from "../../lib/dates";
import { computeGridAnchorPoint } from "../../lib/gridGeometry";
import { TicketCombobox } from "./TicketCombobox";

const POPOVER_WIDTH = 320;

interface DragOffset {
  dx: number;
  dy: number;
}

export function QuickCreatePopover() {
  const quickCreate = useAppStore((s) => s.quickCreate);
  const calendarMode = useAppStore((s) => s.calendarMode);
  const categories = useAppStore((s) => s.categories);
  const tasks = useAppStore((s) => s.tasks);
  const addEntry = useAppStore((s) => s.addEntry);
  const closeQuickCreate = useAppStore((s) => s.closeQuickCreate);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [memo, setMemo] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ dx: 0, dy: 0 });
  const [, forceTick] = useState(0);
  const [popoverHeight, setPopoverHeight] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; base: DragOffset } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setDragOffset({ dx: 0, dy: 0 });
  }, [quickCreate?.day, quickCreate?.startMin]);

  useEffect(() => {
    const onResize = () => forceTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = popoverRef.current;
    if (el === null) return;
    const update = () => setPopoverHeight(el.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (quickCreate === null) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (drag === null) return;
      setDragOffset({
        dx: drag.base.dx + (e.clientX - drag.startX),
        dy: drag.base.dy + (e.clientY - drag.startY),
      });
    };
    const onUp = () => {
      dragStateRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [quickCreate]);

  if (quickCreate === null) return null;

  const { day, startMin, endMin } = quickCreate;
  const startAt = dayMinuteToIso(day, startMin);
  const endAt = dayMinuteToIso(day, endMin);

  const anchor = computeGridAnchorPoint(calendarMode, day, startMin) ?? {
    x: quickCreate.x,
    y: quickCreate.y,
  };
  const height = popoverHeight > 0 ? popoverHeight : 300;
  const left = Math.max(
    8,
    Math.min(anchor.x + 8 + dragOffset.dx, window.innerWidth - POPOVER_WIDTH - 8),
  );
  const top = Math.max(8, Math.min(anchor.y + 8 + dragOffset.dy, window.innerHeight - height - 8));

  const handleDragHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, base: dragOffset };
    e.preventDefault();
  };

  const save = () => {
    void addEntry({
      title: title.trim() === "" ? "無題" : title.trim(),
      categoryId,
      startAt,
      endAt,
      memo,
      taskId,
    });
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closeQuickCreate();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
  };

  return (
    <>
      <div className="popover-backdrop" onPointerDown={closeQuickCreate} />
      <div
        ref={popoverRef}
        className="quick-create"
        style={{ left, top, width: POPOVER_WIDTH }}
        role="dialog"
        aria-label="記録のクイック作成"
        onKeyDown={handleDialogKeyDown}
      >
        <p
          className="quick-create-when quick-create-drag-handle"
          onPointerDown={handleDragHandlePointerDown}
        >
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
          onKeyDown={handleTitleKeyDown}
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
        {tasks.length > 0 && (
          <TicketCombobox tasks={tasks} taskId={taskId} onChange={setTaskId} />
        )}
        <textarea
          className="textarea-input"
          rows={3}
          placeholder="メモ"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <div className="quick-create-actions">
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

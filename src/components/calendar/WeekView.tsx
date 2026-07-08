import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { TimeEntry } from "../../types";
import {
  DOW_LABELS,
  MINUTES_PER_DAY,
  addDays,
  clampMinutes,
  dayMinuteToIso,
  durationMinutes,
  formatMinutesHm,
  fromLocalIso,
  dateKey,
  isSameDay,
  minutesOfDay,
  snapMinutes,
  snapMinutesFloor,
  startOfDay,
  startOfWeek,
} from "../../lib/dates";
import { layoutOverlaps, type Positioned } from "../../lib/layout";
import { EntryBlock, type EntryDragMode } from "./EntryBlock";
import { EntryContextMenu, type EntryContextMenuState } from "./EntryContextMenu";

/** 高さは固定（Outlook 同様、ウィンドウサイズに追従して伸縮しない）。列幅は週表示のみ可変 */
export const HOUR_HEIGHT = 80;
/** 週表示の列幅のフォールバック値（ResizeObserver 反映前の初期値） */
export const DAY_WIDTH = 150;
const PX_PER_MIN = HOUR_HEIGHT / 60;
const MIN_DURATION = 15;
const CLICK_DEFAULT_DURATION = 30;

type DragState =
  | {
      kind: "create";
      dayIndex: number;
      anchorMin: number;
      startMin: number;
      endMin: number;
      moved: boolean;
    }
  | {
      kind: EntryDragMode;
      entry: TimeEntry;
      dayIndex: number;
      startMin: number;
      endMin: number;
      grabOffsetMin: number;
      moved: boolean;
    };

interface DayEntryPosition {
  entry: TimeEntry;
  startMin: number;
  endMin: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function WeekView() {
  const anchorDate = useAppStore((s) => s.anchorDate);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const showWeekends = useAppStore((s) => s.showWeekends);
  const scheduleStartHour = useAppStore((s) => s.scheduleStartHour);
  const entries = useAppStore((s) => s.entries);
  const categories = useAppStore((s) => s.categories);
  const hiddenIds = useAppStore((s) => s.hiddenCategoryIds);
  const selectedEntryId = useAppStore((s) => s.selectedEntryId);
  const quickCreate = useAppStore((s) => s.quickCreate);
  const editor = useAppStore((s) => s.editor);
  const selectEntry = useAppStore((s) => s.selectEntry);
  const openQuickCreate = useAppStore((s) => s.openQuickCreate);
  const openEditor = useAppStore((s) => s.openEditor);
  const modifyEntry = useAppStore((s) => s.modifyEntry);

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const [now, setNow] = useState(new Date());
  const [dayWidth, setDayWidth] = useState(DAY_WIDTH);
  const [contextMenu, setContextMenu] = useState<EntryContextMenuState | null>(null);

  const days = useMemo(() => {
    const weekStart = startOfWeek(anchorDate, weekStartsOn);
    const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    if (!showWeekends) {
      return week.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
    }
    return week;
  }, [anchorDate, weekStartsOn, showWeekends]);

  useEffect(() => {
    const el = columnsRef.current;
    if (el === null) return;
    const updateWidth = () => {
      const perColumn = el.clientWidth / days.length;
      if (perColumn > 0) setDayWidth(perColumn);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [days.length]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const visibleEntries = useMemo(
    () => entries.filter((e) => e.categoryId === null || !hiddenIds.includes(e.categoryId)),
    [entries, hiddenIds],
  );

  const entriesByDay = useMemo(() => {
    return days.map((day) => {
      const list: DayEntryPosition[] = [];
      for (const entry of visibleEntries) {
        const start = fromLocalIso(entry.startAt);
        if (!isSameDay(start, day)) continue;
        const startMin = minutesOfDay(start);
        const endMin = Math.min(
          MINUTES_PER_DAY,
          startMin + Math.max(MIN_DURATION, durationMinutes(entry.startAt, entry.endAt)),
        );
        list.push({ entry, startMin, endMin });
      }
      return list;
    });
  }, [days, visibleEntries]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scheduleStartHour * HOUR_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const pointToDayMin = (clientX: number, clientY: number) => {
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return { dayIndex: 0, minute: 0 };
    const dayIndex = Math.max(
      0,
      Math.min(days.length - 1, Math.floor((clientX - rect.left) / dayWidth)),
    );
    const minute = clampMinutes((clientY - rect.top) / PX_PER_MIN);
    return { dayIndex, minute };
  };

  const handleColumnPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || drag !== null) return;
    if ((e.target as HTMLElement).closest("[data-entry-id]") !== null) return;
    selectEntry(null);
    const { dayIndex, minute } = pointToDayMin(e.clientX, e.clientY);
    const anchor = Math.min(snapMinutesFloor(minute), MINUTES_PER_DAY - CLICK_DEFAULT_DURATION);
    setDrag({
      kind: "create",
      dayIndex,
      anchorMin: anchor,
      startMin: anchor,
      endMin: anchor + CLICK_DEFAULT_DURATION,
      moved: false,
    });
    e.preventDefault();
  };

  const startEntryDrag = (entry: TimeEntry, mode: EntryDragMode, e: React.PointerEvent) => {
    if (e.button !== 0 || drag !== null) return;
    const start = fromLocalIso(entry.startAt);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex < 0) return;
    const startMin = minutesOfDay(start);
    const endMin = Math.min(
      MINUTES_PER_DAY,
      startMin + Math.max(MIN_DURATION, durationMinutes(entry.startAt, entry.endAt)),
    );
    const { minute } = pointToDayMin(e.clientX, e.clientY);
    setDrag({
      kind: mode,
      entry,
      dayIndex,
      startMin,
      endMin,
      grabOffsetMin: minute - startMin,
      moved: false,
    });
    e.preventDefault();
  };

  useEffect(() => {
    if (drag === null) return;

    const onMove = (e: PointerEvent) => {
      const { dayIndex, minute } = pointToDayMin(e.clientX, e.clientY);
      setDrag((prev) => {
        if (prev === null) return prev;
        if (prev.kind === "create") {
          const snapped = snapMinutes(minute);
          if (snapped === prev.anchorMin && !prev.moved) return prev;
          let startMin = Math.min(prev.anchorMin, snapped);
          let endMin = Math.max(prev.anchorMin, snapped);
          if (endMin - startMin < MIN_DURATION) endMin = startMin + MIN_DURATION;
          return { ...prev, startMin, endMin: Math.min(endMin, MINUTES_PER_DAY), moved: true };
        }
        if (prev.kind === "move") {
          const duration = prev.endMin - prev.startMin;
          const rawStart = snapMinutes(minute - prev.grabOffsetMin);
          const startMin = Math.max(0, Math.min(rawStart, MINUTES_PER_DAY - duration));
          return { ...prev, dayIndex, startMin, endMin: startMin + duration, moved: true };
        }
        if (prev.kind === "resize-end") {
          const endMin = Math.max(prev.startMin + MIN_DURATION, Math.min(snapMinutes(minute), MINUTES_PER_DAY));
          return { ...prev, endMin, moved: true };
        }
        // resize-start
        const startMin = Math.min(prev.endMin - MIN_DURATION, Math.max(snapMinutes(minute), 0));
        return { ...prev, startMin, moved: true };
      });
    };

    const onUp = (e: PointerEvent) => {
      const current = dragRef.current;
      if (current === null) return;
      if (current.kind === "create") {
        openQuickCreate({
          day: days[current.dayIndex],
          startMin: current.startMin,
          endMin: current.endMin,
          x: e.clientX,
          y: e.clientY,
        });
      } else if (!current.moved) {
        selectEntry(current.entry.id);
        openEditor({ mode: "edit", entry: current.entry });
      } else {
        const targetDay =
          current.kind === "move" ? days[current.dayIndex] : fromLocalIso(current.entry.startAt);
        const startAt = dayMinuteToIso(targetDay, current.startMin);
        const endAt = dayMinuteToIso(targetDay, current.endMin);
        if (startAt !== current.entry.startAt || endAt !== current.entry.endAt) {
          void modifyEntry({ ...current.entry, startAt, endAt });
        }
      }
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, days]);

  const draggedEntryId = drag !== null && drag.kind !== "create" ? drag.entry.id : null;
  const nowMin = minutesOfDay(now);

  // ドラッグで選択した範囲を、クイック作成・詳細記入が完了するまで表示し続ける
  const pendingSelection = useMemo(() => {
    if (quickCreate !== null) {
      return { day: quickCreate.day, startMin: quickCreate.startMin, endMin: quickCreate.endMin };
    }
    if (editor !== null && editor.mode === "create") {
      const start = fromLocalIso(editor.startAt);
      const startMin = minutesOfDay(start);
      return {
        day: startOfDay(start),
        startMin,
        endMin: startMin + Math.max(MIN_DURATION, durationMinutes(editor.startAt, editor.endAt)),
      };
    }
    return null;
  }, [quickCreate, editor]);

  return (
    <div className="week-view">
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-header">
          <div className="gutter-head" />
          {days.map((day) => (
            <div
              key={day.toDateString()}
              className={`day-head ${isSameDay(day, now) ? "today" : ""}`}
            >
              <span className="day-head-dow">{DOW_LABELS[day.getDay()]}</span>
              <span className="day-head-date">{day.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="week-body">
          <div className="time-gutter">
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ height: HOUR_HEIGHT }}>
                {h > 0 ? `${h}:00` : ""}
              </div>
            ))}
          </div>
          <div className="day-columns" ref={columnsRef} onPointerDown={handleColumnPointerDown}>
            {days.map((day, dayIndex) => {
              const positioned = entriesByDay[dayIndex].filter(
                (p) => p.entry.id !== draggedEntryId,
              );
              const layout = layoutOverlaps(
                positioned.map<Positioned>((p) => ({
                  id: p.entry.id,
                  startMin: p.startMin,
                  endMin: p.endMin,
                })),
              );
              const isToday = isSameDay(day, now);
              const showGhost = drag !== null && drag.dayIndex === dayIndex;
              const ghostInSameDay =
                drag !== null &&
                drag.kind !== "create" &&
                drag.kind !== "move" &&
                isSameDay(fromLocalIso(drag.entry.startAt), day);

              return (
                <div
                  key={day.toDateString()}
                  className={`day-column ${dayIndex % 2 === 1 ? "alt" : ""} ${isToday ? "today" : ""}`}
                  data-day-key={dateKey(day)}
                >
                  {HOURS.map((h) => (
                    <div key={h} className="hour-cell" style={{ height: HOUR_HEIGHT }} />
                  ))}
                  {positioned.map((p) => {
                    const pos = layout.get(p.entry.id) ?? { column: 0, columns: 1 };
                    const category =
                      p.entry.categoryId !== null
                        ? categoryById.get(p.entry.categoryId)
                        : undefined;
                    return (
                      <EntryBlock
                        key={p.entry.id}
                        entry={p.entry}
                        category={category}
                        top={p.startMin * PX_PER_MIN}
                        height={(p.endMin - p.startMin) * PX_PER_MIN}
                        leftPct={(pos.column / pos.columns) * 100}
                        widthPct={100 / pos.columns}
                        selected={p.entry.id === selectedEntryId}
                        onDragInit={startEntryDrag}
                        onOpen={(entry) => openEditor({ mode: "edit", entry })}
                        onContextMenu={(entry, e) =>
                          setContextMenu({ entryId: entry.id, x: e.clientX, y: e.clientY })
                        }
                      />
                    );
                  })}
                  {(showGhost || ghostInSameDay) && drag !== null && (
                    <div
                      className={`drag-ghost ${drag.kind !== "create" ? "entry-ghost" : ""}`}
                      style={{
                        top: drag.startMin * PX_PER_MIN,
                        height: (drag.endMin - drag.startMin) * PX_PER_MIN,
                      }}
                    >
                      <span className="ghost-title">
                        {drag.kind !== "create" ? drag.entry.title : "新しい記録"}
                      </span>
                      <span className="ghost-time">
                        {formatMinutesHm(drag.startMin)} - {formatMinutesHm(drag.endMin)}
                      </span>
                    </div>
                  )}
                  {pendingSelection !== null &&
                    drag === null &&
                    isSameDay(pendingSelection.day, day) && (
                      <div
                        className="drag-ghost"
                        style={{
                          top: pendingSelection.startMin * PX_PER_MIN,
                          height:
                            (pendingSelection.endMin - pendingSelection.startMin) * PX_PER_MIN,
                        }}
                      >
                        <span className="ghost-title">新しい記録</span>
                        <span className="ghost-time">
                          {formatMinutesHm(pendingSelection.startMin)} -{" "}
                          {formatMinutesHm(pendingSelection.endMin)}
                        </span>
                      </div>
                    )}
                  {isToday && (
                    <div className="now-line" style={{ top: nowMin * PX_PER_MIN }}>
                      <span className="now-dot" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {contextMenu !== null && (
        <EntryContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}

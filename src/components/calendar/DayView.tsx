import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { TimeEntry } from "../../types";
import {
  MINUTES_PER_DAY,
  clampMinutes,
  dateKey,
  dayMinuteToIso,
  durationMinutes,
  formatMinutesHm,
  fromLocalIso,
  isSameDay,
  minutesOfDay,
  snapMinutes,
  snapMinutesFloor,
  startOfDay,
} from "../../lib/dates";
import { layoutOverlaps, type Positioned } from "../../lib/layout";
import { EntryBlock, type EntryDragMode } from "./EntryBlock";
import { EntryContextMenu, type EntryContextMenuState } from "./EntryContextMenu";

/** 1 分あたりの px（時間軸は横方向）。VISIBLE_HOURS 分が横スクロールなしで収まるよう、実測幅から算出する */
const VISIBLE_HOURS = 11;
/** 日表示ウィンドウ幅(760px, App.tsx の DAY_VIEW_WINDOW_WIDTH) からナビレール分を引いた最小トラック幅を基準にした下限 */
const MIN_PX_PER_MIN = (760 - 48) / (VISIBLE_HOURS * 60);
const ROW_HEIGHT = 60;
const MIN_DURATION = 15;
const CLICK_DEFAULT_DURATION = 30;

type DragState =
  | {
      kind: "create";
      anchorMin: number;
      startMin: number;
      endMin: number;
      moved: boolean;
    }
  | {
      kind: EntryDragMode;
      entry: TimeEntry;
      startMin: number;
      endMin: number;
      grabOffsetMin: number;
      moved: boolean;
    };

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function DayView() {
  const anchorDate = useAppStore((s) => s.anchorDate);
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

  const day = useMemo(() => startOfDay(anchorDate), [anchorDate]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [pxPerMin, setPxPerMin] = useState(MIN_PX_PER_MIN);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const [now, setNow] = useState(new Date());
  const [contextMenu, setContextMenu] = useState<EntryContextMenuState | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const update = () => {
      const perMin = el.clientWidth / (VISIBLE_HOURS * 60);
      if (perMin > 0) setPxPerMin(Math.max(perMin, MIN_PX_PER_MIN));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(scheduleStartHour * 60 * pxPerMin, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerMin]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const dayEntries = useMemo(() => {
    return entries
      .filter((e) => e.categoryId === null || !hiddenIds.includes(e.categoryId))
      .filter((e) => isSameDay(fromLocalIso(e.startAt), day))
      .map((entry) => {
        const start = fromLocalIso(entry.startAt);
        const startMin = minutesOfDay(start);
        const endMin = Math.min(
          MINUTES_PER_DAY,
          startMin + Math.max(MIN_DURATION, durationMinutes(entry.startAt, entry.endAt)),
        );
        return { entry, startMin, endMin };
      });
  }, [entries, hiddenIds, day]);

  const draggedEntryId = drag !== null && drag.kind !== "create" ? drag.entry.id : null;
  const positioned = dayEntries.filter((p) => p.entry.id !== draggedEntryId);
  const layout = layoutOverlaps(
    positioned.map<Positioned>((p) => ({ id: p.entry.id, startMin: p.startMin, endMin: p.endMin })),
  );
  const rowCount = Math.max(1, ...[...layout.values()].map((p) => p.columns));

  const pointToMin = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clampMinutes((clientX - rect.left) / pxPerMin);
  };

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || drag !== null) return;
    if ((e.target as HTMLElement).closest("[data-entry-id]") !== null) return;
    selectEntry(null);
    const minute = pointToMin(e.clientX);
    const anchor = Math.min(snapMinutesFloor(minute), MINUTES_PER_DAY - CLICK_DEFAULT_DURATION);
    setDrag({
      kind: "create",
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
    const startMin = minutesOfDay(start);
    const endMin = Math.min(
      MINUTES_PER_DAY,
      startMin + Math.max(MIN_DURATION, durationMinutes(entry.startAt, entry.endAt)),
    );
    const minute = pointToMin(e.clientX);
    setDrag({
      kind: mode,
      entry,
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
      const minute = pointToMin(e.clientX);
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
          return { ...prev, startMin, endMin: startMin + duration, moved: true };
        }
        if (prev.kind === "resize-end") {
          const endMin = Math.max(
            prev.startMin + MIN_DURATION,
            Math.min(snapMinutes(minute), MINUTES_PER_DAY),
          );
          return { ...prev, endMin, moved: true };
        }
        // resize-start
        const startMin = Math.min(prev.endMin - MIN_DURATION, Math.max(snapMinutes(minute), 0));
        return { ...prev, startMin, moved: true };
      });
    };

    const onUp = () => {
      const current = dragRef.current;
      if (current === null) return;
      if (current.kind === "create") {
        const rect = trackRef.current?.getBoundingClientRect();
        const x = (rect?.left ?? 0) + current.startMin * pxPerMin;
        const y = rect?.top ?? 0;
        openQuickCreate({ day, startMin: current.startMin, endMin: current.endMin, x, y });
      } else if (!current.moved) {
        selectEntry(current.entry.id);
        openEditor({ mode: "edit", entry: current.entry });
      } else {
        const startAt = dayMinuteToIso(day, current.startMin);
        const endAt = dayMinuteToIso(day, current.endMin);
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
  }, [drag !== null, day, pxPerMin]);

  const isToday = isSameDay(day, now);
  const nowMin = minutesOfDay(now);
  const trackWidth = MINUTES_PER_DAY * pxPerMin;

  const pendingSelection = useMemo(() => {
    if (quickCreate !== null && isSameDay(quickCreate.day, day)) {
      return { startMin: quickCreate.startMin, endMin: quickCreate.endMin };
    }
    if (editor !== null && editor.mode === "create") {
      const start = fromLocalIso(editor.startAt);
      if (!isSameDay(start, day)) return null;
      const startMin = minutesOfDay(start);
      return {
        startMin,
        endMin: startMin + Math.max(MIN_DURATION, durationMinutes(editor.startAt, editor.endAt)),
      };
    }
    return null;
  }, [quickCreate, editor, day]);

  return (
    <div className="day-view">
      <div className="day-view-scroll" ref={scrollRef}>
        <div className="day-view-hours">
          <div className="day-view-hours-spacer" />
          <div className="day-view-hours-track" style={{ width: trackWidth }}>
            {HOURS.map((h) => (
              <div key={h} className="day-view-hour-label" style={{ left: h * 60 * pxPerMin }}>
                {h}:00
              </div>
            ))}
          </div>
        </div>
        <div
          className="day-view-track"
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          data-day-key={dateKey(day)}
          style={{ width: trackWidth, height: Math.max(ROW_HEIGHT * rowCount, ROW_HEIGHT * 3) }}
        >
          {HOURS.map((h) => (
            <div key={h} className="day-view-hour-cell" style={{ left: h * 60 * pxPerMin, width: 60 * pxPerMin }} />
          ))}
          {isToday && (
            <div className="day-view-now-line" style={{ left: nowMin * pxPerMin }}>
              <span className="now-dot" />
            </div>
          )}
          {positioned.map((p) => {
            const pos = layout.get(p.entry.id) ?? { column: 0, columns: 1 };
            const category =
              p.entry.categoryId !== null ? categoryById.get(p.entry.categoryId) : undefined;
            const memoFirstLine = p.entry.memo.split("\n")[0]?.trim() ?? "";
            const detailParts = [memoFirstLine, category?.name].filter(
              (part): part is string => part !== undefined && part.length > 0,
            );
            return (
              <EntryBlock
                key={p.entry.id}
                entry={p.entry}
                category={category}
                top={pos.column * ROW_HEIGHT}
                height={ROW_HEIGHT - 4}
                leftPct={0}
                widthPct={100}
                selected={p.entry.id === selectedEntryId}
                detail={detailParts.length > 0 ? detailParts.join(" · ") : undefined}
                onDragInit={startEntryDrag}
                onOpen={(entry) => openEditor({ mode: "edit", entry })}
                onContextMenu={(entry, e) =>
                  setContextMenu({ entryId: entry.id, x: e.clientX, y: e.clientY })
                }
                style={{
                  left: p.startMin * pxPerMin,
                  width: Math.max(4, (p.endMin - p.startMin) * pxPerMin),
                }}
              />
            );
          })}
          {drag !== null && (
            <div
              className={`drag-ghost horizontal ${drag.kind !== "create" ? "entry-ghost" : ""}`}
              style={{
                left: drag.startMin * pxPerMin,
                width: (drag.endMin - drag.startMin) * pxPerMin,
                top: 0,
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
          {pendingSelection !== null && drag === null && (
            <div
              className="drag-ghost horizontal"
              style={{
                left: pendingSelection.startMin * pxPerMin,
                width: (pendingSelection.endMin - pendingSelection.startMin) * pxPerMin,
                top: 0,
              }}
            >
              <span className="ghost-title">新しい記録</span>
              <span className="ghost-time">
                {formatMinutesHm(pendingSelection.startMin)} -{" "}
                {formatMinutesHm(pendingSelection.endMin)}
              </span>
            </div>
          )}
        </div>
      </div>
      {contextMenu !== null && (
        <EntryContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}

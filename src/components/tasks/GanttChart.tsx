import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { groupTickets } from "../../lib/tickets";
import { statusConfig } from "../../lib/status";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import { isSameDay } from "../../lib/dates";
import {
  computeGanttRange,
  dayCells,
  monthSegments,
  offsetToDate,
  spanToBar,
  taskSpan,
  todayOffset,
  type GanttRange,
} from "../../lib/gantt";
import { IconChevronRight } from "../icons";

/** 1日 = 1マス（正方形）。行の高さは CSS 側の min-height 30px と対応する */
const DAY_WIDTH = 30;
const LEFT_PANE_WIDTH = 300;

interface GanttChartProps {
  /** null = すべて表示。カテゴリ ID で絞り込み */
  filterCategoryId: string | null;
}

export function GanttChart({ filterCategoryId }: GanttChartProps) {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const entryRanges = useAppStore((s) => s.taskEntryRanges);
  const ganttStartOffsetDays = useAppStore((s) => s.ganttStartOffsetDays);
  const updateTask = useAppStore((s) => s.updateTask);
  const addTask = useAppStore((s) => s.addTask);
  const removeTask = useAppStore((s) => s.removeTask);

  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const [addingTicket, setAddingTicket] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState("");

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groups = useMemo(() => {
    const all = groupTickets(tasks);
    if (filterCategoryId === null) return all;
    return all.filter((g) => g.ticket.categoryId === filterCategoryId);
  }, [tasks, filterCategoryId]);
  const today = new Date();

  const range = useMemo(() => {
    const spans = groups
      .flatMap((g) => [g.ticket, ...g.children])
      .map((t) => taskSpan(t, entryRanges.get(t.id)))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    return computeGanttRange(spans, today, ganttStartOffsetDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, entryRanges, ganttStartOffsetDays]);

  const months = useMemo(() => monthSegments(range), [range]);
  const days = useMemo(() => dayCells(range), [range]);
  const timelineWidth = range.totalDays * DAY_WIDTH;
  const todayPos = todayOffset(range, today);

  const toggleExpand = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitTicket = () => {
    const title = newTicketTitle.trim();
    if (title !== "") void addTask(title, filterCategoryId, null);
    setNewTicketTitle("");
    setAddingTicket(false);
  };

  const colorOf = (task: Task) =>
    (task.categoryId !== null ? categoryById.get(task.categoryId)?.color : undefined) ??
    UNCATEGORIZED_COLOR;

  return (
    <div className="gantt">
      <div className="gantt-scroll">
        <div style={{ width: LEFT_PANE_WIDTH + timelineWidth }}>
          <div className="gantt-header-row">
            <div className="gantt-left gantt-left-head">チケット</div>
            <div className="gantt-timeline gantt-months" style={{ width: timelineWidth }}>
              {months.map((m) => (
                <span
                  key={m.label}
                  className="gantt-month"
                  style={{ left: m.startOffset * DAY_WIDTH, width: m.days * DAY_WIDTH }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
          <div className="gantt-header-row">
            <div className="gantt-left gantt-left-head" />
            <div className="gantt-timeline gantt-days" style={{ width: timelineWidth }}>
              {days.map((d) => {
                const dow = d.getDay();
                return (
                  <span
                    key={d.toISOString()}
                    className={`gantt-day-cell ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span className={`gantt-day-num ${isSameDay(d, today) ? "today" : ""}`}>
                      {d.getDate()}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
          {groups.length === 0 && (
            <div className="gantt-row">
              <div className="gantt-left gantt-empty-left">
                <span className="gantt-empty-text">チケットがありません</span>
              </div>
              <GanttRowTimeline width={timelineWidth} todayPos={todayPos} />
            </div>
          )}
          {groups.map((group) => {
            const expanded = !collapsedIds.has(group.ticket.id);
            return (
              <div key={group.ticket.id}>
                <GanttRow
                  task={group.ticket}
                  isTicket
                  hasChildren={group.children.length > 0}
                  expanded={expanded}
                  onToggle={() => toggleExpand(group.ticket.id)}
                  range={range}
                  timelineWidth={timelineWidth}
                  todayPos={todayPos}
                  color={colorOf(group.ticket)}
                  entryRange={entryRanges.get(group.ticket.id)}
                  onUpdate={updateTask}
                  onAddChild={() => {
                    const name = window.prompt("タスク名を入力してください");
                    if (name !== null && name.trim() !== "") {
                      void addTask(name.trim(), group.ticket.categoryId, group.ticket.id);
                    }
                  }}
                  onDelete={() => {
                    const warning =
                      group.children.length > 0
                        ? `チケット「${group.ticket.title}」を削除しますか？\n（子タスクも削除されます。記録済みの実績は残ります）`
                        : `「${group.ticket.title}」を削除しますか？\n（記録済みの実績は残ります）`;
                    if (window.confirm(warning)) void removeTask(group.ticket.id);
                  }}
                />
                {expanded &&
                  group.children.map((child) => (
                    <GanttRow
                      key={child.id}
                      task={child}
                      isTicket={false}
                      hasChildren={false}
                      expanded={false}
                      range={range}
                      timelineWidth={timelineWidth}
                      todayPos={todayPos}
                      color={colorOf(child)}
                      entryRange={entryRanges.get(child.id)}
                      onUpdate={updateTask}
                      onDelete={() => {
                        if (
                          window.confirm(
                            `タスク「${child.title}」を削除しますか？\n（記録済みの実績は残ります）`,
                          )
                        ) {
                          void removeTask(child.id);
                        }
                      }}
                    />
                  ))}
              </div>
            );
          })}
          {/* ガント上からのチケット追加 */}
          <div className="gantt-row">
            <div className="gantt-left gantt-add-left">
              {addingTicket ? (
                <input
                  type="text"
                  className="text-input gantt-add-input"
                  autoFocus
                  placeholder="チケット名（Enter で追加）"
                  value={newTicketTitle}
                  onChange={(e) => setNewTicketTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitTicket();
                    if (e.key === "Escape") {
                      setNewTicketTitle("");
                      setAddingTicket(false);
                    }
                  }}
                  onBlur={submitTicket}
                />
              ) : (
                <button
                  type="button"
                  className="gantt-add-btn"
                  onClick={() => setAddingTicket(true)}
                >
                  + チケットを追加
                </button>
              )}
            </div>
            <GanttRowTimeline width={timelineWidth} todayPos={todayPos} />
          </div>
        </div>
      </div>
      <p className="gantt-hint">
        タイムライン上をドラッグすると開始日〜期限日を設定できます。
        日付未設定のときは記録（実績）の期間を薄いバーで表示します。
      </p>
    </div>
  );
}

function GanttRowTimeline({ width, todayPos }: { width: number; todayPos: number | null }) {
  return (
    <div className="gantt-timeline" style={{ width }}>
      {todayPos !== null && (
        <span className="gantt-today-line" style={{ left: todayPos * DAY_WIDTH }} />
      )}
    </div>
  );
}

interface GanttRowProps {
  task: Task;
  isTicket: boolean;
  hasChildren: boolean;
  expanded: boolean;
  onToggle?: () => void;
  range: GanttRange;
  timelineWidth: number;
  todayPos: number | null;
  color: string;
  entryRange: { from: string; to: string } | undefined;
  onUpdate: (task: Task) => Promise<void>;
  onAddChild?: () => void;
  onDelete: () => void;
}

interface DragState {
  anchorIdx: number;
  currentIdx: number;
  rectLeft: number;
}

function GanttRow({
  task,
  isTicket,
  hasChildren,
  expanded,
  onToggle,
  range,
  timelineWidth,
  todayPos,
  color,
  entryRange,
  onUpdate,
  onAddChild,
  onDelete,
}: GanttRowProps) {
  const status = statusConfig(task.status);
  const span = taskSpan(task, entryRange);
  const bar = span !== null ? spanToBar(span, range) : null;
  const [drag, setDrag] = useState<DragState | null>(null);

  const clampIdx = (idx: number) => Math.max(0, Math.min(range.totalDays - 1, idx));
  const pointToIdx = (clientX: number, rectLeft: number) =>
    clampIdx(Math.floor((clientX - rectLeft) / DAY_WIDTH));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = pointToIdx(e.clientX, rect.left);
    setDrag({ anchorIdx: idx, currentIdx: idx, rectLeft: rect.left });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const idx = pointToIdx(e.clientX, drag.rectLeft);
    if (idx !== drag.currentIdx) setDrag({ ...drag, currentIdx: idx });
  };

  const handlePointerUp = () => {
    if (drag === null) return;
    const startIdx = Math.min(drag.anchorIdx, drag.currentIdx);
    const endIdx = Math.max(drag.anchorIdx, drag.currentIdx);
    void onUpdate({
      ...task,
      startDate: offsetToDate(range, startIdx),
      dueDate: offsetToDate(range, endIdx),
    });
    setDrag(null);
  };

  const previewLeft = drag !== null ? Math.min(drag.anchorIdx, drag.currentIdx) : 0;
  const previewDays =
    drag !== null ? Math.abs(drag.currentIdx - drag.anchorIdx) + 1 : 0;

  return (
    <div className={`gantt-row ${isTicket ? "ticket" : "child"}`}>
      <div className="gantt-left">
        {isTicket ? (
          <button
            type="button"
            className={`tree-caret-btn ${hasChildren ? "" : "hidden"}`}
            aria-label={expanded ? "子タスクを隠す" : "子タスクを表示"}
            onClick={onToggle}
          >
            <span className={`tree-caret ${expanded ? "open" : ""}`}>
              <IconChevronRight size={13} />
            </span>
          </button>
        ) : (
          <span className="child-indent" />
        )}
        <span className="gantt-cat-dot" style={{ background: color }} />
        <span
          className={`gantt-title ${isTicket ? "ticket-title" : ""} ${task.status === "done" ? "done" : ""}`}
          title={`${task.title}${span !== null ? `（${span.start} → ${span.end}）` : ""}`}
        >
          {task.title}
        </span>
        <span className="gantt-status-chip" style={{ background: status.bg, color: status.text }}>
          {status.label}
        </span>
        {isTicket && onAddChild !== undefined && (
          <button
            type="button"
            className="ghost-icon-btn"
            title="子タスクを追加"
            aria-label={`${task.title} に子タスクを追加`}
            onClick={onAddChild}
          >
            ＋
          </button>
        )}
        <button
          type="button"
          className="ghost-icon-btn gantt-del"
          title="削除"
          aria-label={`${task.title} を削除`}
          onClick={onDelete}
        >
          ×
        </button>
      </div>
      <div
        className="gantt-timeline gantt-row-timeline"
        style={{ width: timelineWidth }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="ドラッグで期間を設定"
      >
        {todayPos !== null && (
          <span className="gantt-today-line" style={{ left: todayPos * DAY_WIDTH }} />
        )}
        {drag !== null ? (
          <span
            className="gantt-bar preview"
            style={{
              left: previewLeft * DAY_WIDTH,
              width: previewDays * DAY_WIDTH,
              background: color,
            }}
          />
        ) : (
          bar !== null &&
          span !== null && (
            <span
              className={`gantt-bar ${span.derived ? "derived" : ""}`}
              style={{
                left: bar.offsetDays * DAY_WIDTH,
                width: bar.widthDays * DAY_WIDTH,
                background: color,
              }}
              title={`${span.start} → ${span.end}${span.derived ? "（実績から導出）" : ""}`}
            />
          )
        )}
      </div>
    </div>
  );
}

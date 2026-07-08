import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";
import type { Task } from "../../types";
import { groupTickets, rollupActualMinutes, rollupEstimateMinutes } from "../../lib/tickets";
import { statusConfig } from "../../lib/status";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import { isSameDay } from "../../lib/dates";
import {
  actualFillRatio,
  computeGanttRange,
  dayCells,
  initialScrollOffsetDays,
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
const DEFAULT_LEFT_PANE_WIDTH = 300;
const MAX_LEFT_PANE_WIDTH = 600;

interface GanttChartProps {
  /** 空集合 = すべて表示。分類 ID（"__none__" はなし）の集合で絞り込み */
  filterGroupIds: ReadonlySet<string>;
  /** 指定時、このチケット/タスク ID のみ表示する（履歴ビューなど期間で絞り込む場合に使う） */
  restrictToTaskIds?: ReadonlySet<string>;
  /** 完了済みのチケット/タスクを表示しない（チケット画面用。履歴では指定しない） */
  excludeDone?: boolean;
}

export function GanttChart({ filterGroupIds, restrictToTaskIds, excludeDone }: GanttChartProps) {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const entryRanges = useAppStore((s) => s.taskEntryRanges);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const ganttStartOffsetDays = useAppStore((s) => s.ganttStartOffsetDays);
  const ganttMinLeftPaneWidth = useAppStore((s) => s.ganttMinLeftPaneWidth);
  const ticketSortMode = useAppStore((s) => s.ticketSortMode);
  const updateTask = useAppStore((s) => s.updateTask);
  const addTask = useAppStore((s) => s.addTask);
  const removeTask = useAppStore((s) => s.removeTask);

  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const [addingTicket, setAddingTicket] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [leftPaneWidth, setLeftPaneWidth] = useState(DEFAULT_LEFT_PANE_WIDTH);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevRangeFromRef = useRef<number | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groups = useMemo(() => {
    const all = groupTickets(tasks, ticketSortMode);
    return all
      .filter((g) => filterGroupIds.size === 0 || filterGroupIds.has(g.ticket.groupId ?? "__none__"))
      .filter((g) => excludeDone !== true || g.ticket.status !== "done")
      .map((g) =>
        excludeDone !== true
          ? g
          : {
              ticket: g.ticket,
              children: g.children
                .filter((c) => c.status !== "done")
                .map((c) => ({
                  ...c,
                  children: c.children.filter((gc) => gc.status !== "done"),
                })),
            },
      )
      .map((g) =>
        restrictToTaskIds === undefined
          ? g
          : {
              ticket: g.ticket,
              children: g.children
                .map((c) => ({
                  ...c,
                  children: c.children.filter((gc) => restrictToTaskIds.has(gc.id)),
                }))
                .filter((c) => restrictToTaskIds.has(c.id) || c.children.length > 0),
            },
      )
      .filter(
        (g) =>
          restrictToTaskIds === undefined ||
          restrictToTaskIds.has(g.ticket.id) ||
          g.children.length > 0,
      );
  }, [tasks, filterGroupIds, restrictToTaskIds, ticketSortMode, excludeDone]);
  const today = new Date();

  const range = useMemo(() => {
    const spans = groups
      .flatMap((g) => [g.ticket, ...g.children.flatMap((c) => [c, ...c.children])])
      .map((t) => taskSpan(t, entryRanges.get(t.id)))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    return computeGanttRange(spans, today, ganttStartOffsetDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, entryRanges, ganttStartOffsetDays]);

  const months = useMemo(() => monthSegments(range), [range]);
  const days = useMemo(() => dayCells(range), [range]);
  const timelineWidth = range.totalDays * DAY_WIDTH;
  const todayPos = todayOffset(range, today);
  const paneWidth = Math.max(ganttMinLeftPaneWidth, Math.min(MAX_LEFT_PANE_WIDTH, leftPaneWidth));

  // 初期表示は「今日 - offset」を左端に。範囲の先頭が過去へ伸びたときは
  // 見えている日付が動かないようスクロール位置を補正する
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const fromMs = range.from.getTime();
    const prev = prevRangeFromRef.current;
    prevRangeFromRef.current = fromMs;
    if (prev === null) {
      el.scrollLeft = initialScrollOffsetDays(range, today, ganttStartOffsetDays) * DAY_WIDTH;
    } else if (prev !== fromMs) {
      el.scrollLeft += Math.round((prev - fromMs) / 86_400_000) * DAY_WIDTH;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, ganttStartOffsetDays]);

  // 通常のホイール操作を横スクロールに変換する（端に達したら縦スクロールへ委譲）
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      // shift+ホイールは標準の横スクロール、ctrl はズーム系ジェスチャなので触らない
      if (e.shiftKey || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      // 端では縦スクロールへ委譲（fractional DPI で scrollLeft が max に届かないことがあるため 1px の許容）
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 1)) {
        return;
      }
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    // React の onWheel は passive のため preventDefault できない。native で登録する
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toggleExpand = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitTicket = () => {
    const title = newTicketTitle.trim();
    if (title !== "") {
      const soleGroupId =
        filterGroupIds.size === 1 ? [...filterGroupIds][0] : undefined;
      const groupId = soleGroupId !== undefined && soleGroupId !== "__none__" ? soleGroupId : null;
      void addTask(title, null, null, groupId);
    }
    setNewTicketTitle("");
    setAddingTicket(false);
  };

  const colorOf = (task: Task) =>
    (task.categoryId !== null ? categoryById.get(task.categoryId)?.color : undefined) ??
    UNCATEGORIZED_COLOR;

  const startResize = (e: React.PointerEvent) => {
    resizeRef.current = { startX: e.clientX, startWidth: paneWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (resizeRef.current === null) return;
    const delta = e.clientX - resizeRef.current.startX;
    setLeftPaneWidth(
      Math.max(
        ganttMinLeftPaneWidth,
        Math.min(MAX_LEFT_PANE_WIDTH, resizeRef.current.startWidth + delta),
      ),
    );
  };
  const endResize = () => {
    resizeRef.current = null;
  };

  const confirmDeleteTicket = (task: Task, hasChildren: boolean) => {
    void confirmDialog({
      title: "チケットを削除",
      message: hasChildren
        ? `チケット「${task.title}」を削除しますか？\n（子タスクも削除されます。記録済みの実績は残ります）`
        : `「${task.title}」を削除しますか？\n（記録済みの実績は残ります）`,
      danger: true,
    }).then((ok) => {
      if (ok) void removeTask(task.id);
    });
  };

  const confirmDeleteChild = (task: Task) => {
    void confirmDialog({
      title: "タスクを削除",
      message: `タスク「${task.title}」を削除しますか？\n（記録済みの実績は残ります）`,
      danger: true,
    }).then((ok) => {
      if (ok) void removeTask(task.id);
    });
  };

  const leftStyle = { width: paneWidth };

  // 左ペイン右端のリサイズハンドル。ヘッダー行だけでなく全行に描画し、列の縁全体をドラッグ可能にする
  const resizeHandle = (
    <span
      className="gantt-resize-handle"
      onPointerDown={startResize}
      onPointerMove={onResizeMove}
      onPointerUp={endResize}
      onPointerCancel={endResize}
      title="ドラッグで幅を調整"
    />
  );

  return (
    <div className="gantt">
      <div className="gantt-scroll" ref={scrollRef}>
        <div style={{ width: paneWidth + timelineWidth }}>
          <div className="gantt-header-row">
            <div className="gantt-left gantt-left-head" style={leftStyle}>
              チケット
              {resizeHandle}
            </div>
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
            <div className="gantt-left gantt-left-head" style={leftStyle}>
              {resizeHandle}
            </div>
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
          {groups.map((group) => {
            const expanded = !collapsedIds.has(group.ticket.id);
            const rollupEstimate = rollupEstimateMinutes(group);
            const rollupActual = rollupActualMinutes(group, actualMinutes);
            return (
              <div key={group.ticket.id}>
                <GanttRow
                  task={group.ticket}
                  isTicket
                  depth={0}
                  hasChildren={group.children.length > 0}
                  expanded={expanded}
                  onToggle={() => toggleExpand(group.ticket.id)}
                  range={range}
                  timelineWidth={timelineWidth}
                  leftWidth={paneWidth}
                  todayPos={todayPos}
                  color={colorOf(group.ticket)}
                  entryRange={entryRanges.get(group.ticket.id)}
                  fillRatio={actualFillRatio(rollupActual, rollupEstimate)}
                  resizeHandle={resizeHandle}
                  onUpdate={updateTask}
                  onAddChild={() => {
                    const name = window.prompt("タスク名を入力してください");
                    if (name !== null && name.trim() !== "") {
                      void addTask(
                        name.trim(),
                        group.ticket.categoryId,
                        group.ticket.id,
                        group.ticket.groupId,
                      );
                    }
                  }}
                  onDelete={() => confirmDeleteTicket(group.ticket, group.children.length > 0)}
                />
                {expanded &&
                  group.children.map((child) => {
                    const childExpanded = !collapsedIds.has(child.id);
                    return (
                      <div key={child.id}>
                        <GanttRow
                          task={child}
                          isTicket={false}
                          depth={1}
                          hasChildren={child.children.length > 0}
                          expanded={childExpanded}
                          onToggle={() => toggleExpand(child.id)}
                          range={range}
                          timelineWidth={timelineWidth}
                          leftWidth={paneWidth}
                          todayPos={todayPos}
                          color={colorOf(child)}
                          entryRange={entryRanges.get(child.id)}
                          fillRatio={actualFillRatio(
                            actualMinutes.get(child.id) ?? 0,
                            child.estimateMinutes,
                          )}
                          resizeHandle={resizeHandle}
                          onUpdate={updateTask}
                          onAddChild={() => {
                            const name = window.prompt("タスク名を入力してください");
                            if (name !== null && name.trim() !== "") {
                              void addTask(name.trim(), child.categoryId, child.id, child.groupId);
                            }
                          }}
                          onDelete={() => confirmDeleteChild(child)}
                        />
                        {childExpanded &&
                          child.children.map((grandchild) => (
                            <GanttRow
                              key={grandchild.id}
                              task={grandchild}
                              isTicket={false}
                              depth={2}
                              hasChildren={false}
                              expanded={false}
                              range={range}
                              timelineWidth={timelineWidth}
                              leftWidth={paneWidth}
                              todayPos={todayPos}
                              color={colorOf(grandchild)}
                              entryRange={entryRanges.get(grandchild.id)}
                              fillRatio={actualFillRatio(
                                actualMinutes.get(grandchild.id) ?? 0,
                                grandchild.estimateMinutes,
                              )}
                              resizeHandle={resizeHandle}
                              onUpdate={updateTask}
                              onDelete={() => confirmDeleteChild(grandchild)}
                            />
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
          {/* ガント上からのチケット追加 */}
          <div className="gantt-row">
            <div className="gantt-left gantt-add-left" style={leftStyle}>
              {addingTicket ? (
                <input
                  type="text"
                  className="text-input gantt-add-input"
                  autoFocus
                  placeholder="チケット名（Enter で追加）"
                  value={newTicketTitle}
                  onChange={(e) => setNewTicketTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) submitTicket();
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
              {resizeHandle}
            </div>
            <GanttRowTimeline width={timelineWidth} todayPos={todayPos} />
          </div>
        </div>
      </div>
      <p className="gantt-hint">
        タイムライン上をドラッグすると開始日〜期限日を設定できます。左ペインの右端をドラッグすると幅を調整できます。
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
  /** チケットからの深さ（0=チケット, 1=子タスク, 2=孫タスク）。インデント量に使う */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle?: () => void;
  range: GanttRange;
  timelineWidth: number;
  leftWidth: number;
  todayPos: number | null;
  color: string;
  entryRange: { from: string; to: string } | undefined;
  /** 見積に対する実績の割合（0-1）。見積未設定なら null（バー内の実績表示なし） */
  fillRatio: number | null;
  /** 左ペイン右端のリサイズハンドル（親で生成した共通要素） */
  resizeHandle: React.ReactNode;
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
  depth,
  hasChildren,
  expanded,
  onToggle,
  range,
  timelineWidth,
  leftWidth,
  todayPos,
  color,
  entryRange,
  fillRatio,
  resizeHandle,
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
  const previewDays = drag !== null ? Math.abs(drag.currentIdx - drag.anchorIdx) + 1 : 0;

  return (
    <div className={`gantt-row ${isTicket ? "ticket" : "child"}`}>
      <div className="gantt-left" style={{ width: leftWidth }}>
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} className="child-indent" />
        ))}
        {onToggle !== undefined ? (
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
        {onAddChild !== undefined && (
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
        {resizeHandle}
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
            >
              {fillRatio !== null && (
                <span
                  className="gantt-bar-fill"
                  style={{ width: `${fillRatio * 100}%` }}
                />
              )}
            </span>
          )
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { groupTickets } from "../../lib/tickets";
import { statusConfig } from "../../lib/status";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";
import {
  computeGanttRange,
  monthSegments,
  spanToBar,
  taskSpan,
  todayOffset,
  type GanttRange,
} from "../../lib/gantt";
import { IconChevronRight } from "../icons";

const DAY_WIDTH = 6;
const LEFT_PANE_WIDTH = 380;

export function GanttChart() {
  const tasks = useAppStore((s) => s.tasks);
  const categories = useAppStore((s) => s.categories);
  const entryRanges = useAppStore((s) => s.taskEntryRanges);
  const updateTask = useAppStore((s) => s.updateTask);

  // 既定は展開。クリックで折りたたんだチケットだけを記録する
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groups = useMemo(() => groupTickets(tasks), [tasks]);
  const today = new Date();

  const range = useMemo(() => {
    const spans = tasks
      .map((t) => taskSpan(t, entryRanges.get(t.id)))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    return computeGanttRange(spans, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, entryRanges]);

  const months = useMemo(() => monthSegments(range), [range]);
  const timelineWidth = range.totalDays * DAY_WIDTH;
  const todayPos = todayOffset(range, today);

  const toggleExpand = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (groups.length === 0) {
    return (
      <p className="tasks-empty">
        チケットがまだありません。リスト表示でチケットを追加し、開始日・期限日を
        設定するとここにスケジュールが表示されます。
      </p>
    );
  }

  return (
    <div className="gantt">
      <div className="gantt-scroll">
        <div style={{ width: LEFT_PANE_WIDTH + timelineWidth }}>
          {/* ヘッダ行 */}
          <div className="gantt-header-row">
            <div className="gantt-left gantt-left-head">チケット</div>
            <div className="gantt-timeline" style={{ width: timelineWidth }}>
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
          {/* 本体 */}
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
                  color={
                    (group.ticket.categoryId !== null
                      ? categoryById.get(group.ticket.categoryId)?.color
                      : undefined) ?? UNCATEGORIZED_COLOR
                  }
                  entryRange={entryRanges.get(group.ticket.id)}
                  onUpdate={updateTask}
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
                      color={
                        (child.categoryId !== null
                          ? categoryById.get(child.categoryId)?.color
                          : undefined) ?? UNCATEGORIZED_COLOR
                      }
                      entryRange={entryRanges.get(child.id)}
                      onUpdate={updateTask}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="gantt-hint">
        バーは開始日〜期限日を表します。日付未設定のときは記録（実績）の期間から薄いバーで表示します。
        日付は各行の入力欄で設定できます。
      </p>
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
}: GanttRowProps) {
  const status = statusConfig(task.status);
  const span = taskSpan(task, entryRange);
  const bar = span !== null ? spanToBar(span, range) : null;

  return (
    <div className={`gantt-row ${isTicket ? "ticket" : "child"}`}>
      <div className="gantt-left">
        <div className="gantt-left-main">
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
            title={task.title}
          >
            {task.title}
          </span>
          <span
            className="gantt-status-chip"
            style={{ background: status.bg, color: status.text }}
          >
            {status.label}
          </span>
        </div>
        <div className={`gantt-left-dates ${isTicket ? "" : "child"}`}>
          <input
            type="date"
            className={`gantt-date-input ${task.startDate === null ? "empty" : ""}`}
            aria-label="開始日"
            value={task.startDate ?? ""}
            onChange={(e) => void onUpdate({ ...task, startDate: e.target.value || null })}
          />
          <span className="gantt-date-sep">→</span>
          <input
            type="date"
            className={`gantt-date-input ${task.dueDate === null ? "empty" : ""}`}
            aria-label="期限日"
            value={task.dueDate ?? ""}
            onChange={(e) => void onUpdate({ ...task, dueDate: e.target.value || null })}
          />
          {span !== null && span.derived && <span className="gantt-derived-note">実績から</span>}
        </div>
      </div>
      <div className="gantt-timeline" style={{ width: timelineWidth }}>
        {todayPos !== null && (
          <span className="gantt-today-line" style={{ left: todayPos * DAY_WIDTH }} />
        )}
        {bar !== null && span !== null && (
          <span
            className={`gantt-bar ${span.derived ? "derived" : ""}`}
            style={{
              left: bar.offsetDays * DAY_WIDTH,
              width: bar.widthDays * DAY_WIDTH,
              background: color,
            }}
            title={`${span.start} → ${span.end}${span.derived ? "（実績から導出）" : ""}`}
          />
        )}
      </div>
    </div>
  );
}

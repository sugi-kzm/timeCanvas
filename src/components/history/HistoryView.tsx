import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { TicketRow } from "../tasks/TicketRow";
import { GanttChart } from "../tasks/GanttChart";
import { HistoryHeatmap } from "./HistoryHeatmap";
import {
  completedTasksInPeriod,
  periodForAnchor,
  periodLabel,
  shiftHistoryAnchor,
  type HistoryGranularity,
} from "../../lib/history";
import { listEntriesBetween } from "../../db/entryRepo";
import { toLocalIso } from "../../lib/dates";
import type { TimeEntry } from "../../types";
import { IconChevronLeft, IconChevronRight, IconPlus } from "../icons";

const GRANULARITY_TABS: { key: HistoryGranularity; label: string }[] = [
  { key: "week", label: "週" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
];

type HistoryViewType = "gantt" | "heatmap";

const VIEW_TYPE_OPTIONS: { key: HistoryViewType; label: string }[] = [
  { key: "gantt", label: "ガント" },
  { key: "heatmap", label: "カテゴリ別ヒートマップ" },
];

const UNGROUPED_KEY = "__none__";

/**
 * 完了したチケット/タスクを期間（週/月/年）で振り返るトップレベルビュー。
 * 期間内の完了タスクを一覧（TicketRow 再利用）とガントで確認できる。
 */
export function HistoryView() {
  const tasks = useAppStore((s) => s.tasks);
  const actualMinutes = useAppStore((s) => s.taskActualMinutes);
  const categories = useAppStore((s) => s.categories);
  const ticketGroups = useAppStore((s) => s.ticketGroups);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const setStatus = useAppStore((s) => s.setStatus);

  const [granularity, setGranularity] = useState<HistoryGranularity>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [filterGroupIds, setFilterGroupIds] = useState<ReadonlySet<string>>(new Set());
  const [viewType, setViewType] = useState<HistoryViewType>("gantt");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [periodEntries, setPeriodEntries] = useState<TimeEntry[]>([]);

  const period = useMemo(
    () => periodForAnchor(granularity, anchor, weekStartsOn),
    [granularity, anchor, weekStartsOn],
  );

  useEffect(() => {
    if (viewType !== "heatmap") return;
    listEntriesBetween(toLocalIso(period.from), toLocalIso(period.to))
      .then(setPeriodEntries)
      .catch((e) => setStatus(`期間データの読み込みに失敗しました: ${String(e)}`));
  }, [viewType, period, setStatus]);

  const completedTasks = useMemo(
    () => completedTasksInPeriod(tasks, period, filterGroupIds),
    [tasks, period, filterGroupIds],
  );

  const completedIdSet = useMemo(
    () => new Set(completedTasks.map((t) => t.id)),
    [completedTasks],
  );

  const toggleGroup = (id: string) => {
    setFilterGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="tasks-view wide">
      <div className="tasks-inner">
        <div className="tasks-header-row">
          <h2 className="tasks-heading">履歴</h2>
          <div className="view-switch underline-tabs" role="group" aria-label="期間の粒度切替">
            {GRANULARITY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`seg ${granularity === tab.key ? "active" : ""}`}
                onClick={() => setGranularity(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="history-period-nav">
            <button
              type="button"
              className="btn icon-btn"
              aria-label="前の期間へ"
              onClick={() => setAnchor((a) => shiftHistoryAnchor(granularity, a, -1))}
            >
              <IconChevronLeft />
            </button>
            <span className="history-period-label">{periodLabel(granularity, anchor)}</span>
            <button
              type="button"
              className="btn icon-btn"
              aria-label="次の期間へ"
              onClick={() => setAnchor((a) => shiftHistoryAnchor(granularity, a, 1))}
            >
              <IconChevronRight />
            </button>
          </div>
          <div className="history-view-type">
            <button
              type="button"
              className="btn icon-btn"
              aria-label="表示形式を選択"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen((v) => !v)}
            >
              <IconPlus />
            </button>
            {viewMenuOpen && (
              <div className="history-view-type-menu" role="menu">
                {VIEW_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={viewType === opt.key}
                    className={`history-view-type-item ${viewType === opt.key ? "active" : ""}`}
                    onClick={() => {
                      setViewType(opt.key);
                      setViewMenuOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="tickets-layout">
          <aside className="tickets-side" aria-label="分類で絞り込み">
            <button
              type="button"
              className={`tickets-side-item tickets-side-item-all ${filterGroupIds.size === 0 ? "active" : ""}`}
              onClick={() => setFilterGroupIds(new Set())}
            >
              すべて
            </button>
            <label className="tickets-side-item tickets-side-checkbox">
              <input
                type="checkbox"
                checked={filterGroupIds.has(UNGROUPED_KEY)}
                onChange={() => toggleGroup(UNGROUPED_KEY)}
              />
              なし
            </label>
            {ticketGroups.map((g) => (
              <label key={g.id} className="tickets-side-item tickets-side-checkbox">
                <input
                  type="checkbox"
                  checked={filterGroupIds.has(g.id)}
                  onChange={() => toggleGroup(g.id)}
                />
                {g.name}
              </label>
            ))}
          </aside>
          <div className="tickets-main history-main">
            {completedTasks.length === 0 ? (
              <p className="tasks-empty">
                この期間に完了したチケット/タスクはありません。カンバンや「チケット」タブで
                ステータスを「完了」にすると、ここに実績として積み上がっていきます。
              </p>
            ) : (
              <>
                <ul className="task-list history-ticket-list">
                  {completedTasks.map((task) => (
                    <li key={task.id} className="ticket-row-line">
                      <TicketRow
                        ticket={{
                          id: task.id,
                          displayNo: task.displayNo,
                          title: task.title,
                          status: task.status,
                          categoryId: task.categoryId,
                          childCount: 0,
                          estimateMinutes: task.estimateMinutes,
                          actualMinutes: actualMinutes.get(task.id) ?? 0,
                        }}
                        categories={categories}
                        selected={false}
                        onSelect={() => {}}
                      />
                    </li>
                  ))}
                </ul>
                {viewType === "gantt" ? (
                  <GanttChart filterGroupIds={filterGroupIds} restrictToTaskIds={completedIdSet} />
                ) : (
                  <HistoryHeatmap
                    entries={periodEntries}
                    categories={categories}
                    period={period}
                    weekStartsOn={weekStartsOn}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

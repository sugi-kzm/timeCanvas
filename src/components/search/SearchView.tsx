import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { TimeEntry } from "../../types";
import { searchEntries } from "../../db/entryRepo";
import { splitSearchTerms } from "../../lib/searchQuery";
import {
  DOW_LABELS,
  addDays,
  durationMinutes,
  formatHm,
  formatHours,
  fromLocalIso,
  startOfDay,
  startOfWeek,
  toLocalIso,
} from "../../lib/dates";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";

type Period = "all" | "week" | "month" | "year" | "custom";

function periodRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  switch (period) {
    case "week": {
      const from = startOfWeek(now);
      return { fromIso: toLocalIso(from), toIso: toLocalIso(addDays(from, 7)) };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { fromIso: toLocalIso(from), toIso: toLocalIso(to) };
    }
    case "year": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear() + 1, 0, 1);
      return { fromIso: toLocalIso(from), toIso: toLocalIso(to) };
    }
    case "custom":
      return {
        fromIso: customFrom !== "" ? `${customFrom}T00:00:00` : null,
        toIso: customTo !== "" ? toLocalIso(addDays(startOfDay(new Date(customTo)), 1)) : null,
      };
    default:
      return { fromIso: null, toIso: null };
  }
}

/** キーワードにマッチした部分をハイライトして返す */
function highlight(text: string, terms: readonly string[]) {
  if (terms.length === 0 || text === "") return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, i) =>
    terms.some((t) => part.toLowerCase() === t.toLowerCase()) ? (
      <mark key={i}>{part}</mark>
    ) : (
      part
    ),
  );
}

export function SearchView() {
  const keyword = useAppStore((s) => s.searchKeyword);
  const categories = useAppStore((s) => s.categories);
  const jumpToEntry = useAppStore((s) => s.jumpToEntry);
  const setStatus = useAppStore((s) => s.setStatus);

  const [selectedCategories, setSelectedCategories] = useState<readonly string[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [results, setResults] = useState<TimeEntry[]>([]);

  const terms = useMemo(() => splitSearchTerms(keyword), [keyword]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const { fromIso, toIso } = periodRange(period, customFrom, customTo);
      searchEntries({ keyword, categoryIds: selectedCategories, fromIso, toIso })
        .then(setResults)
        .catch((e) => setStatus(`検索に失敗しました: ${String(e)}`));
    }, 200);
    return () => clearTimeout(timer);
  }, [keyword, selectedCategories, period, customFrom, customTo, setStatus]);

  const totalMinutes = results.reduce(
    (sum, e) => sum + Math.max(0, durationMinutes(e.startAt, e.endAt)),
    0,
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className="search-view">
      <div className="search-inner">
        <div className="search-filters">
          <div className="search-category-chips">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${selectedCategories.includes(c.id) ? "active" : ""}`}
                onClick={() => toggleCategory(c.id)}
              >
                <span className="category-dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
          <select
            className="select-input search-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            aria-label="検索期間"
          >
            <option value="all">全期間</option>
            <option value="week">今週</option>
            <option value="month">今月</option>
            <option value="year">今年</option>
            <option value="custom">期間指定</option>
          </select>
          {period === "custom" && (
            <>
              <input
                type="date"
                className="text-input search-date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="開始日"
              />
              <span>〜</span>
              <input
                type="date"
                className="text-input search-date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="終了日"
              />
            </>
          )}
        </div>

        <p className="search-summary">
          {results.length} 件 ・ 合計 {formatHours(totalMinutes)} 時間
        </p>

        <ul className="search-results">
          {results.map((entry) => {
            const start = fromLocalIso(entry.startAt);
            const category =
              entry.categoryId !== null ? categoryById.get(entry.categoryId) : undefined;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="search-result"
                  onClick={() => void jumpToEntry(entry)}
                  title="クリックで該当週のカレンダーを開く"
                >
                  <span
                    className="search-result-bar"
                    style={{ background: category?.color ?? UNCATEGORIZED_COLOR }}
                  />
                  <span className="search-result-date">
                    {start.getFullYear()}/{start.getMonth() + 1}/{start.getDate()}（
                    {DOW_LABELS[start.getDay()]}） {formatHm(start)}
                  </span>
                  <span className="search-result-title">{highlight(entry.title, terms)}</span>
                  <span className="search-result-duration">
                    {formatHours(durationMinutes(entry.startAt, entry.endAt))}h
                  </span>
                  {entry.memo !== "" && (
                    <span className="search-result-memo">
                      {highlight(entry.memo.slice(0, 80), terms)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {results.length === 0 && keyword.trim() !== "" && (
          <p className="tasks-empty">「{keyword}」に一致する記録は見つかりませんでした</p>
        )}
      </div>
    </div>
  );
}

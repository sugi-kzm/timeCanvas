import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import type { Task } from "../../types";
import { useTicketOptions } from "../../lib/useTicketOptions";

interface TicketOption {
  task: Task;
  label: string;
  categoryName: string | null;
}

interface TicketComboboxProps {
  tasks: readonly Task[];
  taskId: string | null;
  onChange: (taskId: string | null) => void;
  placeholder?: string;
}

function matchesQuery(option: TicketOption, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return true;
  const displayNoQuery = trimmed.replace(/^#/, "");
  if (displayNoQuery !== "" && String(option.task.displayNo) === displayNoQuery) return true;
  if (option.label.toLowerCase().includes(trimmed)) return true;
  if (option.categoryName !== null && option.categoryName.toLowerCase().includes(trimmed)) {
    return true;
  }
  return false;
}

/**
 * チケット/タスク紐付け用の検索可能コンボボックス。
 * "#123" や "123" と入力すると displayNo が一致するチケットを候補の先頭に出す。
 * QuickCreatePopover / EntryDialog で共通利用する。
 */
export function TicketCombobox({ tasks, taskId, onChange, placeholder }: TicketComboboxProps) {
  const categories = useAppStore((s) => s.categories);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const { ticketGroups, isSelectable } = useTicketOptions(tasks, taskId);

  const options = useMemo<TicketOption[]>(() => {
    const list: TicketOption[] = [];
    for (const { ticket, children } of ticketGroups) {
      const category = ticket.categoryId !== null ? categoryById.get(ticket.categoryId) : undefined;
      if (isSelectable(ticket)) {
        list.push({
          task: ticket,
          label: `${ticket.title}（チケット全体）`,
          categoryName: category?.name ?? null,
        });
      }
      for (const child of children) {
        const childCategory =
          child.categoryId !== null ? categoryById.get(child.categoryId) : undefined;
        list.push({
          task: child,
          label: child.title,
          categoryName: childCategory?.name ?? null,
        });
      }
    }
    return list;
  }, [ticketGroups, isSelectable, categoryById]);

  const selectedOption = useMemo(
    () => (taskId === null ? null : (options.find((o) => o.task.id === taskId) ?? null)),
    [options, taskId],
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filtered = useMemo(() => options.filter((o) => matchesQuery(o, query)), [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const select = (option: TicketOption | null) => {
    onChange(option?.task.id ?? null);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlight] !== undefined) select(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="ticket-combobox" ref={rootRef}>
      <input
        type="text"
        className="text-input"
        placeholder={placeholder ?? "#番号 または タイトルで検索"}
        value={open ? query : (selectedOption?.label ?? "")}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="ticket-combobox-list" role="listbox">
          <li
            role="option"
            aria-selected={taskId === null}
            className={`ticket-combobox-option ${taskId === null ? "selected" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault();
              select(null);
            }}
          >
            チケット / タスクなし
          </li>
          {filtered.map((option, i) => (
            <li
              key={option.task.id}
              role="option"
              aria-selected={option.task.id === taskId}
              className={`ticket-combobox-option ${option.task.id === taskId ? "selected" : ""} ${i === highlight ? "highlight" : ""}`}
              onPointerDown={(e) => {
                e.preventDefault();
                select(option);
              }}
            >
              <span className="ticket-combobox-no">#{option.task.displayNo}</span> {option.label}
              {option.categoryName !== null && (
                <span className="ticket-combobox-category">{option.categoryName}</span>
              )}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="ticket-combobox-empty">該当するチケットがありません</li>
          )}
        </ul>
      )}
    </div>
  );
}

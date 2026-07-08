import type { Category, Task } from "../../types";
import { statusConfig } from "../../lib/status";
import { formatHours } from "../../lib/dates";
import { IconSubtasks } from "../icons";

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface TicketRowData {
  id: string;
  displayNo: number;
  title: string;
  status: Task["status"];
  categoryId: string | null;
  childCount: number;
  estimateMinutes: number | null;
  actualMinutes: number;
}

interface TicketRowProps {
  ticket: TicketRowData;
  categories: readonly Category[];
  selected: boolean;
  onSelect: (id: string) => void;
}

/** チケット一覧の1行（マスタリスト用）。ステータス/名前/子タスク数/カテゴリ/見積/実績を列で揃えて表示する */
export function TicketRow({ ticket, categories, selected, onSelect }: TicketRowProps) {
  const status = statusConfig(ticket.status);
  const category =
    ticket.categoryId !== null ? categories.find((c) => c.id === ticket.categoryId) : undefined;

  return (
    <button
      type="button"
      className={`ticket-row-grid ${selected ? "selected" : ""}`}
      onClick={() => onSelect(ticket.id)}
    >
      <span className="lozenge" style={{ background: status.bg, color: status.text }}>
        {status.label}
      </span>
      <span className="ticket-row-title">
        <span className="ticket-row-no">#{ticket.displayNo}</span> {ticket.title}
      </span>
      <span className="ticket-row-subtasks">
        <IconSubtasks size={12} />
        {ticket.childCount}
      </span>
      {category !== undefined ? (
        <span
          className="ticket-row-category"
          style={{ background: hexToRgba(category.color, 0.16), color: category.color }}
        >
          {category.name}
        </span>
      ) : (
        <span className="ticket-row-category empty">未分類</span>
      )}
      <span className="ticket-row-estimate">
        {ticket.estimateMinutes !== null ? `${formatHours(ticket.estimateMinutes)}h` : "-"}
      </span>
      <span className="ticket-row-actual">
        {ticket.actualMinutes > 0 ? `${formatHours(ticket.actualMinutes)}h` : "-"}
      </span>
    </button>
  );
}

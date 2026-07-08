import type { Category, TimeEntry } from "../../types";
import { formatHm, fromLocalIso } from "../../lib/dates";
import { hexToRgba } from "../../lib/colors";
import { UNCATEGORIZED_COLOR } from "../../lib/summary";

export type EntryDragMode = "move" | "resize-start" | "resize-end";

interface EntryBlockProps {
  entry: TimeEntry;
  category: Category | undefined;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  selected: boolean;
  onDragInit: (entry: TimeEntry, mode: EntryDragMode, e: React.PointerEvent) => void;
  onOpen: (entry: TimeEntry) => void;
  onContextMenu?: (entry: TimeEntry, e: React.MouseEvent) => void;
  /** 日表示（横軸）など、left/width を % ではなく px で上書きしたい場合に使う */
  style?: React.CSSProperties;
  /** 日表示のみ：メモ先頭1行やカテゴリ名などの補足情報。渡された場合のみタイトル+時刻の下に表示する */
  detail?: string;
}

export function EntryBlock({
  entry,
  category,
  top,
  height,
  leftPct,
  widthPct,
  selected,
  onDragInit,
  onOpen,
  onContextMenu,
  style,
  detail,
}: EntryBlockProps) {
  const color = category?.color ?? UNCATEGORIZED_COLOR;
  const showTime = height >= 34;

  return (
    <div
      data-entry-id={entry.id}
      className={`entry-block ${selected ? "selected" : ""}`}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: hexToRgba(color, 0.14),
        borderLeftColor: color,
        outlineColor: color,
        ...style,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDragInit(entry, "move", e);
      }}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => {
        if (onContextMenu === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(entry, e);
      }}
      title={`${entry.title}\n${formatHm(fromLocalIso(entry.startAt))} - ${formatHm(fromLocalIso(entry.endAt))}`}
    >
      <div
        className="resize-handle top"
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragInit(entry, "resize-start", e);
        }}
      />
      <div className="entry-title" style={{ color }}>
        {entry.title}
      </div>
      {showTime && (
        <div className="entry-time">
          {formatHm(fromLocalIso(entry.startAt))} - {formatHm(fromLocalIso(entry.endAt))}
        </div>
      )}
      {detail !== undefined && <div className="entry-detail">{detail}</div>}
      <div
        className="resize-handle bottom"
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragInit(entry, "resize-end", e);
        }}
      />
    </div>
  );
}

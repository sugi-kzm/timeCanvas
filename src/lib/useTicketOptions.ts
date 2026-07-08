import { useMemo } from "react";
import type { Task } from "../types";
import { groupTickets } from "./tickets";

/**
 * エントリのタスク紐付け <select> 用の選択肢を組み立てる。
 * 選択肢: 未完了のチケット/タスク + 現在紐付いているもの（完了済みでも表示する）。
 * EntryDialog / QuickCreatePopover で共通利用する。
 */
export function useTicketOptions(tasks: readonly Task[], taskId: string | null) {
  const isSelectable = (t: Task) => t.status !== "done" || t.id === taskId;
  const ticketGroups = useMemo(
    () =>
      groupTickets(tasks, "due")
        .map(({ ticket, children }) => ({ ticket, children: children.filter(isSelectable) }))
        .filter(({ ticket, children }) => isSelectable(ticket) || children.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, taskId],
  );
  return { ticketGroups, isSelectable };
}

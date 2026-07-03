import type { Task } from "../types";

/** チケット（親）とその配下のタスク（子）のグループ */
export interface TicketGroup {
  ticket: Task;
  children: Task[];
}

/**
 * フラットな一覧をチケット単位のグループに変換する。
 * チケットは未完了→完了の順、子タスクは作成順。
 * 親が見つからない子（親が完了リミット外など）は独立チケットとして扱わず除外する。
 */
export function groupTickets(tasks: readonly Task[]): TicketGroup[] {
  const tickets = tasks.filter((t) => t.parentId === null);
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentId === null) continue;
    childrenByParent.set(task.parentId, [...(childrenByParent.get(task.parentId) ?? []), task]);
  }
  const sorted = [...tickets].sort((a, b) => {
    const aDone = a.status === "done";
    const bDone = b.status === "done";
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
  });
  return sorted.map((ticket) => ({
    ticket,
    children: (childrenByParent.get(ticket.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
    ),
  }));
}

/** チケットの実績合計（チケット直接の実績 + 子タスクの実績） */
export function rollupActualMinutes(
  group: TicketGroup,
  actualByTask: ReadonlyMap<string, number>,
): number {
  const own = actualByTask.get(group.ticket.id) ?? 0;
  return group.children.reduce((sum, c) => sum + (actualByTask.get(c.id) ?? 0), own);
}

/**
 * チケットの見積合計。
 * 子タスクに見積があればその合計（+チケット自身の見積）、
 * どこにも見積がなければ null。
 */
export function rollupEstimateMinutes(group: TicketGroup): number | null {
  const values = [
    group.ticket.estimateMinutes,
    ...group.children.map((c) => c.estimateMinutes),
  ].filter((v): v is number => v !== null && v > 0);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

/** チケットの進捗（完了した子タスク数 / 子タスク数）。子がなければ null */
export function childProgress(group: TicketGroup): { done: number; total: number } | null {
  if (group.children.length === 0) return null;
  return {
    done: group.children.filter((c) => c.status === "done").length,
    total: group.children.length,
  };
}
